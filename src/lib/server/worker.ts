import { execSql, oneSql, isPostgres, transaction } from "../db";
import { id } from "./security";
import { now, pricing, envNumber } from "./config";
import { assetFor, assetBuffer, removeAsset } from "./storage";
import { trimSource, exportVideo } from "./media";
import { motionProvider, downloadRemote } from "../providers/higgsfield";
import { ProviderError, type ProviderResult } from "../providers/types";
import { refundJob } from "./jobs";
import type { JobInput, JobRow } from "./records";

const leaseDate = () => new Date(Date.now() + 90_000).toISOString();
const terminal = ["completed", "failed", "cancelled"];
class LeaseLost extends Error {}
export async function heartbeat() {
  await execSql(
    "INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
    ["worker_heartbeat", String(Date.now()), now()],
  );
}
export async function claimJob(workerId: string) {
  return transaction(async () => {
    const job = await oneSql<JobRow>(
      `SELECT j.* FROM generation_jobs j WHERE j.status IN ('queued','uploading','processing') AND (j.lease_until IS NULL OR j.lease_until < ?) ORDER BY CASE WHEN EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id=j.user_id AND s.status='active' AND s.plan='pro') THEN 0 WHEN EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id=j.user_id AND s.status='active' AND s.plan='creator') THEN 1 ELSE 2 END,j.created_at LIMIT 1 ${isPostgres() ? "FOR UPDATE SKIP LOCKED" : ""}`,
      [now()],
    );
    if (!job) return null;
    const started = job.started_at || now();
    await execSql(
      "UPDATE generation_jobs SET lease_owner=?,lease_until=?,attempts=attempts+1,started_at=? WHERE id=?",
      [workerId, leaseDate(), started, job.id],
    );
    return {
      ...job,
      lease_owner: workerId,
      started_at: started,
      attempts: job.attempts + 1,
    };
  });
}

// One durable step per claim: release the lease between polls so queued provider jobs can be cancelled.
export async function runOne(workerId: string = id()): Promise<boolean> {
  const job = await claimJob(workerId);
  if (!job) return false;
  let lost = false;
  let nextPoll: string | null = null;
  const timer = setInterval(() => {
    void execSql(
      "UPDATE generation_jobs SET lease_until=? WHERE id=? AND lease_owner=?",
      [leaseDate(), job.id, workerId],
    )
      .then((changed) => {
        if (!changed) lost = true;
      })
      .catch(() => {
        lost = true;
      });
  }, 20_000);
  const stage = async (
    status: "queued" | "uploading" | "processing",
    text: string,
  ) => {
    if (lost) throw new LeaseLost();
    await transaction(async () => {
      const changed = await execSql(
        "UPDATE generation_jobs SET status=?,stage=?,error=NULL,updated_at=? WHERE id=? AND lease_owner=? AND status IN ('queued','uploading','processing')",
        [status, text, now(), job.id, workerId],
      );
      if (!changed) throw new LeaseLost();
      await execSql("UPDATE projects SET status=?,updated_at=? WHERE id=?", [
        status,
        now(),
        job.project_id,
      ]);
    });
  };
  try {
    if (
      Date.now() - Date.parse(job.started_at) >
      Math.max(1, envNumber("GENERATION_TIMEOUT_MINUTES", 45)) * 60_000
    ) {
      throw new Error(
        "The generation exceeded the processing time limit. Contact support with your project ID.",
      );
    }
    const provider = motionProvider();
    const input = JSON.parse(job.input) as JobInput;
    const source = await assetFor(job.user_id, input.source_id, "video");
    let result: ProviderResult | undefined;
    if (!job.provider_request_id) {
      await stage(
        "uploading",
        "Normalizing and trimming your motion reference",
      );
      const prepared = job.prepared_source_id
        ? await assetFor(job.user_id, job.prepared_source_id, "video")
        : await trimSource(
            job.user_id,
            source,
            input.trim_start,
            input.trim_end,
          );
      await execSql(
        "UPDATE generation_jobs SET prepared_source_id=? WHERE id=? AND lease_owner=?",
        [prepared.id, job.id, workerId],
      );
      job.prepared_source_id = prepared.id;
      await stage("uploading", "Uploading prepared references to Higgsfield");
      const videoUrl =
        job.source_url ||
        (await provider.upload(await assetBuffer(prepared), "video/mp4"));
      await execSql(
        "UPDATE generation_jobs SET source_url=? WHERE id=? AND lease_owner=?",
        [videoUrl, job.id, workerId],
      );
      const imageUrls: string[] = job.image_urls
        ? JSON.parse(job.image_urls)
        : [];
      if (!imageUrls.length) {
        for (const image of input.character_ids)
          imageUrls.push(
            await provider.upload(
              await assetBuffer(await assetFor(job.user_id, image, "image")),
              "image/jpeg",
            ),
          );
        await execSql(
          "UPDATE generation_jobs SET image_urls=? WHERE id=? AND lease_owner=?",
          [JSON.stringify(imageUrls), job.id, workerId],
        );
      }
      await stage(
        "uploading",
        "Submitting the prepared performance to the AI model",
      );
      result = await provider.submit(
        {
          video_url: videoUrl,
          image_urls: imageUrls,
          prompt: input.prompt,
          resolution: "720p",
        },
        job.id,
      );
      const changed = await execSql(
        "UPDATE generation_jobs SET provider_request_id=?,provider_status_url=?,provider_cancel_url=?,updated_at=? WHERE id=? AND lease_owner=?",
        [
          result.request_id,
          result.status_url || null,
          result.cancel_url || null,
          now(),
          job.id,
          workerId,
        ],
      );
      if (!changed) throw new LeaseLost();
      job.provider_request_id = result.request_id;
      job.provider_status_url = result.status_url || null;
      const price = await pricing();
      await execSql(
        "INSERT INTO provider_usage(id,job_id,event,duration,estimated_cost_cents,created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM provider_usage WHERE job_id=? AND event='submitted')",
        [
          id(),
          job.id,
          "submitted",
          job.duration,
          Math.ceil(job.duration * price.providerCostPerSecondCents),
          now(),
          job.id,
        ],
      );
    } else if (!job.provider_output_url) {
      if (!job.provider_status_url)
        throw new Error(
          "The provider did not return a status URL. Contact support with your job ID.",
        );
      result = await provider.status(job.provider_status_url);
      if (result.request_id !== job.provider_request_id)
        throw new Error(
          "The provider returned a mismatched request identifier.",
        );
    }
    if (result) {
      if (result.status === "failed")
        throw new Error(
          "The AI provider could not complete this transformation. Try a clearer character reference or simpler motion.",
        );
      if (result.status === "nsfw")
        throw new Error(
          "The provider rejected this content under its safety policy. Use different media.",
        );
      if (result.status === "canceled") {
        await refundJob(
          job.id,
          "cancelled",
          "Cancelled by the AI provider.",
          workerId,
        );
        return true;
      }
      if (result.status !== "completed") {
        await stage(
          result.status === "queued" ? "queued" : "processing",
          result.status === "queued"
            ? "Waiting in the AI provider queue"
            : "The AI model is recreating your performance",
        );
        const delay = Math.min(
          10_000,
          2000 * Math.pow(1.5, Math.min(job.attempts - 1, 5)),
        );
        nextPoll = new Date(Date.now() + delay).toISOString();
        return true;
      }
      if (!result.video?.url)
        throw new Error("The provider completed without returning a video.");
      job.provider_output_url = result.video.url;
      const changed = await execSql(
        "UPDATE generation_jobs SET provider_output_url=? WHERE id=? AND lease_owner=?",
        [result.video.url, job.id, workerId],
      );
      if (!changed) throw new LeaseLost();
    }
    if (!job.provider_output_url)
      throw new Error("The provider did not return a video URL.");
    await stage("processing", "Validating and encoding your 720p MP4");
    const output = await exportVideo(
      job.user_id,
      await downloadRemote(job.provider_output_url),
      source,
      input,
      input.project_name,
    );
    try {
      await transaction(async () => {
        const changed = await execSql(
          "UPDATE generation_jobs SET status='completed',stage='Your video is ready',error=NULL,completed_at=?,updated_at=?,lease_owner=NULL,lease_until=NULL WHERE id=? AND lease_owner=? AND status='processing'",
          [now(), now(), job.id, workerId],
        );
        if (!changed) throw new LeaseLost();
        await execSql(
          "INSERT INTO generated_videos(id,user_id,project_id,job_id,asset_id,created_at) VALUES(?,?,?,?,?,?)",
          [id(), job.user_id, job.project_id, job.id, output.id, now()],
        );
        await execSql(
          "UPDATE projects SET status='completed',updated_at=? WHERE id=?",
          [now(), job.project_id],
        );
        await execSql(
          "INSERT INTO notifications(id,user_id,message,created_at) VALUES(?,?,?,?)",
          [
            id(),
            job.user_id,
            `${input.project_name} is ready. Your 720p MP4 is available in My Projects.`,
            now(),
          ],
        );
      });
    } catch (e) {
      await removeAsset(output);
      throw e;
    }
    if (job.prepared_source_id) {
      await execSql(
        "UPDATE generation_jobs SET prepared_source_id=NULL WHERE id=?",
        [job.id],
      );
      const prepared = await assetFor(
        job.user_id,
        job.prepared_source_id,
        "video",
      );
      await removeAsset(prepared);
    }
  } catch (e) {
    if (lost || e instanceof LeaseLost) {
      /* Another worker owns the job. Never refund or overwrite its result. */
    } else if (e instanceof ProviderError && e.retryable) {
      nextPoll = new Date(Date.now() + 30_000).toISOString();
      await execSql(
        "UPDATE generation_jobs SET stage=?,error=?,updated_at=? WHERE id=? AND lease_owner=? AND status IN ('queued','uploading','processing')",
        [
          "Connection interrupted — retrying safely",
          e.message,
          now(),
          job.id,
          workerId,
        ],
      );
    } else {
      await refundJob(
        job.id,
        "failed",
        e instanceof Error
          ? e.message.slice(0, 700)
          : "An unexpected processing error occurred.",
        workerId,
      );
    }
  } finally {
    clearInterval(timer);
    await execSql(
      "UPDATE generation_jobs SET lease_owner=NULL,lease_until=? WHERE id=? AND lease_owner=?",
      [nextPoll, job.id, workerId],
    );
  }
  return true;
}
export { terminal as terminalJobStatuses };
