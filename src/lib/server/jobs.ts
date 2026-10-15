import { execSql, oneSql, transaction } from "../db";
import { now, pricing, configuration } from "./config";
import { assert, id } from "./security";
import { assetFor } from "./storage";
import { motionProvider } from "../providers/higgsfield";
export async function createJob(
  userId: string,
  projectId: string,
  consent: boolean,
) {
  assert(
    consent,
    "Confirm that you own the media and have permission to use all likenesses.",
  );
  const config = await configuration();
  assert(
    config.provider,
    "Real AI generation is not configured. Add HF_CREDENTIALS on the server to enable Higgsfield Genjutsu.",
    503,
  );
  assert(
    config.workerOnline,
    "The generation worker is offline. Start npm run worker on the processing service.",
    503,
  );
  const user = await oneSql("SELECT * FROM users WHERE id=?", [userId]);
  assert(
    user && user.role !== "guest",
    "Create an account to generate and keep your work.",
    401,
  );
  assert(
    !config.requireVerification || user.email_verified,
    "Verify your email before starting a generation.",
    403,
  );
  const project = await oneSql(
    "SELECT * FROM projects WHERE id=? AND user_id=?",
    [projectId, userId],
  );
  assert(project, "Project not found.", 404);
  assert(project.source_id, "Upload your motion reference first.");
  const source = await assetFor(userId, project.source_id, "video");
  const meta = JSON.parse(source.metadata);
  const start = Number(project.trim_start),
    end = Number(project.trim_end);
  assert(
    Number.isFinite(start) &&
      Number.isFinite(end) &&
      start >= 0 &&
      end <= meta.duration + 0.05 &&
      end - start >= 4 &&
      end - start <= 30.01,
    "Select a clip between 4 and 30 seconds within your source video.",
  );
  const images: string[] = JSON.parse(project.character_ids);
  assert(
    images.length >= 1 && images.length <= 8,
    "Choose between 1 and 8 character reference images.",
  );
  for (const image of images) await assetFor(userId, image, "image");
  const { creditsPerSecond } = await pricing();
  const cost = Math.ceil((end - start) * creditsPerSecond),
    jobId = id();
  const input = {
    source_id: source.id,
    character_ids: images,
    trim_start: start,
    trim_end: end,
    aspect: project.aspect,
    audio: project.audio,
    prompt: project.prompt,
    project_name: project.name,
  };
  await transaction(async () => {
    const active = await oneSql(
      "SELECT id FROM generation_jobs WHERE project_id=? AND status IN ('queued','uploading','processing')",
      [projectId],
    );
    assert(!active, "This project already has an active generation.", 409);
    const updated = await execSql(
      "UPDATE users SET credits=credits-?,updated_at=? WHERE id=? AND credits>=?",
      [cost, now(), userId, cost],
    );
    assert(
      updated,
      `This clip needs ${cost} credits. Add more credits or shorten your clip.`,
      402,
    );
    await execSql(
      "INSERT INTO generation_jobs(id,user_id,project_id,status,stage,cost,duration,input,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      [
        jobId,
        userId,
        projectId,
        "queued",
        "Waiting for the processing worker",
        cost,
        end - start,
        JSON.stringify(input),
        now(),
        now(),
      ],
    );
    await execSql(
      "INSERT INTO credit_transactions(id,user_id,amount,reason,reference_id,created_at) VALUES(?,?,?,?,?,?)",
      [
        id(),
        userId,
        -cost,
        "Generation credit reservation",
        `job:${jobId}`,
        now(),
      ],
    );
    await execSql(
      "UPDATE projects SET status='queued',updated_at=? WHERE id=?",
      [now(), projectId],
    );
  });
  return { id: jobId, cost, status: "queued" };
}
export async function refundJob(
  jobId: string,
  status: "failed" | "cancelled",
  error: string,
) {
  await transaction(async () => {
    const job = await oneSql("SELECT * FROM generation_jobs WHERE id=?", [
      jobId,
    ]);
    if (!job || job.refunded_at || job.status === "completed") return;
    await execSql(
      "UPDATE generation_jobs SET status=?,stage=?,error=?,refunded_at=?,completed_at=?,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=?",
      [
        status,
        status === "cancelled"
          ? "Cancelled — credits returned"
          : "Failed — credits returned",
        error,
        now(),
        now(),
        now(),
        jobId,
      ],
    );
    await execSql(
      "UPDATE users SET credits=credits+?,updated_at=? WHERE id=?",
      [job.cost, now(), job.user_id],
    );
    await execSql(
      "INSERT INTO credit_transactions(id,user_id,amount,reason,reference_id,created_at) VALUES(?,?,?,?,?,?)",
      [
        id(),
        job.user_id,
        job.cost,
        status === "cancelled"
          ? "Cancelled generation refund"
          : "Failed generation refund",
        `refund:${jobId}`,
        now(),
      ],
    );
    await execSql("UPDATE projects SET status=?,updated_at=? WHERE id=?", [
      status,
      now(),
      job.project_id,
    ]);
    await execSql(
      "INSERT INTO notifications(id,user_id,message,created_at) VALUES(?,?,?,?)",
      [
        id(),
        job.user_id,
        `Generation ${status}. ${job.cost} credits have been returned to your balance.`,
        now(),
      ],
    );
  });
}
export async function cancelJob(userId: string, jobId: string) {
  const job = await oneSql(
    "SELECT * FROM generation_jobs WHERE id=? AND user_id=?",
    [jobId, userId],
  );
  assert(job, "Generation not found.", 404);
  assert(
    job.status === "queued" || job.status === "uploading",
    "Only queued or preparing generations can be cancelled.",
    409,
  );
  // Lock before cancellation so the worker cannot submit while cancellation is committed.
  await transaction(async () => {
    const changed = await execSql(
      "UPDATE generation_jobs SET lease_until=?,lease_owner='cancellation' WHERE id=? AND status IN ('queued','uploading') AND (lease_owner IS NULL OR lease_until < ?)",
      [new Date(Date.now() + 60_000).toISOString(), jobId, now()],
    );
    assert(
      changed,
      "The worker is preparing this job. Try again in a moment, or wait for its status to update.",
      409,
    );
    if (job.provider_request_id) {
      assert(
        job.provider_cancel_url,
        "The provider cannot cancel this request.",
        409,
      );
      await motionProvider().cancel(job.provider_cancel_url);
    }
    await refundJob(jobId, "cancelled", "Cancelled by the creator.");
  });
  return { message: "Generation cancelled. Reserved credits returned." };
}
