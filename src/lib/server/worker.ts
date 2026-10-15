import { execSql, oneSql, isPostgres, transaction } from "../db";
import { id } from "./security";
import { now, pricing } from "./config";
import { assetFor, assetBuffer } from "./storage";
import { trimSource, exportVideo } from "./media";
import { motionProvider, downloadRemote } from "../providers/higgsfield";
import { ProviderError } from "../providers/types";
import { refundJob } from "./jobs";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const leaseDate = () => new Date(Date.now() + 90_000).toISOString();
export async function heartbeat() {
  await execSql(
    "INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
    ["worker_heartbeat", String(Date.now()), now()],
  );
}
export async function claimJob(workerId: string) {
  return transaction(async () => {
    const job = await oneSql(
      `SELECT j.* FROM generation_jobs j WHERE j.status IN ('queued','uploading','processing') AND (j.lease_until IS NULL OR j.lease_until < ?) ORDER BY CASE WHEN EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id=j.user_id AND s.status='active' AND s.plan='pro') THEN 0 WHEN EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id=j.user_id AND s.status='active' AND s.plan='creator') THEN 1 ELSE 2 END,j.created_at LIMIT 1 ${isPostgres() ? "FOR UPDATE SKIP LOCKED" : ""}`,
      [now()],
    );
    if (!job) return null;
    await execSql(
      "UPDATE generation_jobs SET lease_owner=?,lease_until=?,attempts=attempts+1,started_at=COALESCE(started_at,?) WHERE id=?",
      [workerId, leaseDate(), now(), job.id],
    );
    return job;
  });
}
export async function runOne(workerId = id()): Promise<boolean> {
  const job = await claimJob(workerId);
  if (!job) return false;
  let leaseLost = false;
  const heartbeatTimer = setInterval(async () => {
    try {
      const changed = await execSql(
        "UPDATE generation_jobs SET lease_until=? WHERE id=? AND lease_owner=?",
        [leaseDate(), job.id, workerId],
      );
      if (!changed) leaseLost = true;
    } catch {
      leaseLost = true;
    }
  }, 20_000);
  const stage = async (status: string, text: string) => {
    if (leaseLost) throw new ProviderError("Worker lease was lost.", true);
    const changed = await execSql(
      "UPDATE generation_jobs SET status=?,stage=?,updated_at=? WHERE id=? AND lease_owner=? AND status NOT IN ('completed','failed','cancelled')",
      [status, text, now(), job.id, workerId],
    );
    if (!changed) throw new ProviderError("The job is no longer active.");
    await execSql("UPDATE projects SET status=?,updated_at=? WHERE id=?", [
      status,
      now(),
      job.project_id,
    ]);
  };
  try {
    const provider = motionProvider();
    const input = JSON.parse(job.input);
    const source = await assetFor(job.user_id, input.source_id, "video");
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
      if (!job.prepared_source_id)
        await execSql(
          "UPDATE generation_jobs SET prepared_source_id=? WHERE id=? AND lease_owner=?",
          [prepared.id, job.id, workerId],
        );
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
      if (leaseLost) throw new ProviderError("Worker lease lost.", true);
      const response = await provider.submit(
        {
          video_url: videoUrl,
          image_urls: imageUrls,
          prompt: input.prompt,
          resolution: "720p",
        },
        job.id,
      );
      await execSql(
        "UPDATE generation_jobs SET provider_request_id=?,provider_status_url=?,provider_cancel_url=?,updated_at=? WHERE id=? AND lease_owner=?",
        [
          response.request_id,
          response.status_url || null,
          response.cancel_url || null,
          now(),
          job.id,
          workerId,
        ],
      );
      job.provider_request_id = response.request_id;
      job.provider_status_url = response.status_url;
      if (response.video?.url) {
        job.provider_output_url = response.video.url;
        await execSql(
          "UPDATE generation_jobs SET provider_output_url=? WHERE id=?",
          [response.video.url, job.id],
        );
      }
      const price = await pricing();
      await execSql(
        "INSERT INTO provider_usage(id,job_id,event,duration,estimated_cost_cents,created_at) VALUES(?,?,?,?,?,?)",
        [
          id(),
          job.id,
          "submitted",
          job.duration,
          Math.ceil(job.duration * price.providerCostPerSecondCents),
          now(),
        ],
      );
    }
    await stage("processing", "The AI model is recreating your performance");
    const timeout =
      Number(process.env.GENERATION_TIMEOUT_MINUTES || 45) * 60_000;
    let delay = 2000,
      failures = 0;
    while (!job.provider_output_url) {
      const active = await oneSql(
        "SELECT status,started_at FROM generation_jobs WHERE id=?",
        [job.id],
      );
      if (
        !active ||
        ["completed", "failed", "cancelled"].includes(active.status)
      )
        return true;
      if (Date.now() - Date.parse(active.started_at) > timeout)
        throw new Error(
          "The generation exceeded the processing time limit. Contact support with your project ID.",
        );
      if (!job.provider_status_url)
        throw new Error(
          "The provider did not return a status URL. Contact support with your job ID.",
        );
      try {
        const result = await provider.status(job.provider_status_url);
        failures = 0;
        if (result.status === "completed") {
          if (!result.video?.url)
            throw new Error(
              "The provider completed without returning a video.",
            );
          job.provider_output_url = result.video.url;
          await execSql(
            "UPDATE generation_jobs SET provider_output_url=? WHERE id=? AND lease_owner=?",
            [result.video.url, job.id, workerId],
          );
          break;
        }
        if (result.status === "failed")
          throw new Error(
            "The AI provider could not complete this transformation. Try a clearer character reference or simpler motion.",
          );
        if (result.status === "nsfw")
          throw new Error(
            "The provider rejected this content under its safety policy. Use different media.",
          );
        if (result.status === "canceled") {
          await refundJob(job.id, "cancelled", "Cancelled by the AI provider.");
          return true;
        }
        await stage(
          "processing",
          result.status === "queued"
            ? "Waiting in the AI provider queue"
            : "The AI model is recreating your performance",
        );
      } catch (e) {
        if (e instanceof ProviderError && e.retryable && ++failures < 8) {
          /* Retry status, never submit another generation. */
        } else throw e;
      }
      await sleep(delay + Math.random() * 500);
      delay = Math.min(delay * 1.5, 10000);
    }
    await stage("processing", "Validating and encoding your 720p MP4");
    const output = await exportVideo(
      job.user_id,
      await downloadRemote(job.provider_output_url),
      source,
      input,
      input.project_name,
    );
    await transaction(async () => {
      const changed = await execSql(
        "UPDATE generation_jobs SET status='completed',stage='Your video is ready',completed_at=?,updated_at=?,lease_owner=NULL,lease_until=NULL WHERE id=? AND lease_owner=? AND status='processing'",
        [now(), now(), job.id, workerId],
      );
      if (!changed)
        throw new Error("The generation lease expired before completion.");
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
    if (e instanceof ProviderError && e.retryable) {
      await execSql(
        "UPDATE generation_jobs SET stage=?,error=?,lease_until=?,lease_owner=NULL,updated_at=? WHERE id=? AND lease_owner=?",
        [
          "Connection interrupted — retrying safely",
          e.message,
          new Date(Date.now() + 30_000).toISOString(),
          now(),
          job.id,
          workerId,
        ],
      );
    } else
      await refundJob(
        job.id,
        "failed",
        e instanceof Error
          ? e.message.slice(0, 700)
          : "An unexpected processing error occurred.",
      );
  } finally {
    clearInterval(heartbeatTimer);
    await execSql(
      "UPDATE generation_jobs SET lease_owner=NULL,lease_until=NULL WHERE id=? AND lease_owner=?",
      [job.id, workerId],
    );
  }
  return true;
}
