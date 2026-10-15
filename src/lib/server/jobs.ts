import { execSql, oneSql, transaction, isPostgres } from "../db";
import { now, pricing, configuration } from "./config";
import { assert, id } from "./security";
import { assetFor, assetPublic } from "./storage";
import { motionProvider } from "../providers/higgsfield";
import type { JobRow, JobInput, ProjectRow, UserRow } from "./records";

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
  return transaction(async () => {
    // All project mutations take this lock, preventing concurrent editing, deletion, or duplicate reservations.
    const project = await oneSql<ProjectRow>(
      `SELECT * FROM projects WHERE id=? AND user_id=?${isPostgres() ? " FOR UPDATE" : ""}`,
      [projectId, userId],
    );
    assert(project, "Project not found.", 404);
    const user = await oneSql<UserRow>("SELECT * FROM users WHERE id=?", [
      userId,
    ]);
    assert(
      user && user.role !== "guest",
      "Create an account to generate and keep your work.",
      401,
    );
    assert(!user.suspended, "This account has been suspended.", 403);
    assert(
      !config.requireVerification || user.email_verified,
      "Verify your email before starting a generation.",
      403,
    );
    assert(project.source_id, "Upload your motion reference first.");
    const source = assetPublic(
      await assetFor(userId, project.source_id, "video"),
    );
    const start = project.trim_start,
      end = project.trim_end;
    assert(
      Number.isFinite(start) &&
        Number.isFinite(end) &&
        start >= 0 &&
        end <= (source.metadata.duration || 0) + 0.05 &&
        end - start >= 4 &&
        end - start <= 30,
      "Select a clip between 4 and 30 seconds within your source video.",
    );
    const images: string[] = JSON.parse(project.character_ids);
    assert(
      images.length >= 1 && images.length <= 8,
      "Choose between 1 and 8 character reference images.",
    );
    for (const image of images) await assetFor(userId, image, "image");
    const active = await oneSql<JobRow>(
      "SELECT id FROM generation_jobs WHERE project_id=? AND status IN ('queued','uploading','processing')",
      [projectId],
    );
    assert(!active, "This project already has an active generation.", 409);
    const cost = Math.ceil((end - start) * (await pricing()).creditsPerSecond),
      jobId = id();
    const input: JobInput = {
      source_id: source.id,
      character_ids: images,
      trim_start: start,
      trim_end: end,
      aspect: project.aspect,
      audio: project.audio,
      prompt: project.prompt,
      project_name: project.name,
    };
    const changed = await execSql(
      "UPDATE users SET credits=credits-?,updated_at=? WHERE id=? AND credits>=? AND suspended=0",
      [cost, now(), userId, cost],
    );
    assert(
      changed,
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
    return { id: jobId, cost, status: "queued" as const };
  });
}

export async function refundJob(
  jobId: string,
  status: "failed" | "cancelled",
  error: string,
  leaseOwner?: string,
) {
  return transaction(async () => {
    const job = await oneSql<JobRow>(
      "SELECT * FROM generation_jobs WHERE id=?",
      [jobId],
    );
    if (!job) return false;
    // Conditional UPDATE, rather than a stale SELECT, is the authority for issuing a refund on both databases.
    const changed = await execSql(
      `UPDATE generation_jobs SET status=?,stage=?,error=?,refunded_at=?,completed_at=?,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE id=? AND refunded_at IS NULL AND status<>'completed'${leaseOwner ? " AND lease_owner=?" : ""}`,
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
        ...(leaseOwner ? [leaseOwner] : []),
      ],
    );
    if (!changed) return false;
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
    return true;
  });
}

export async function cancelJob(userId: string, jobId: string) {
  const owner = `cancel:${id()}`;
  const job = await transaction(async () => {
    const row = await oneSql<JobRow>(
      "SELECT * FROM generation_jobs WHERE id=? AND user_id=?",
      [jobId, userId],
    );
    assert(row, "Generation not found.", 404);
    assert(
      ["queued", "uploading"].includes(row.status),
      "Only queued or preparing generations can be cancelled.",
      409,
    );
    const changed = await execSql(
      "UPDATE generation_jobs SET lease_until=?,lease_owner=? WHERE id=? AND status IN ('queued','uploading') AND (lease_owner IS NULL OR lease_until < ?)",
      [new Date(Date.now() + 90_000).toISOString(), owner, jobId, now()],
    );
    assert(
      changed,
      "The worker is preparing this job. Try again after its status updates.",
      409,
    );
    return row;
  });
  try {
    if (job.provider_request_id) {
      assert(
        job.provider_cancel_url,
        "The provider cannot cancel this request.",
        409,
      );
      await motionProvider().cancel(job.provider_cancel_url);
    }
    await refundJob(jobId, "cancelled", "Cancelled by the creator.", owner);
    return { message: "Generation cancelled. Reserved credits returned." };
  } finally {
    await execSql(
      "UPDATE generation_jobs SET lease_owner=NULL,lease_until=NULL WHERE id=? AND lease_owner=?",
      [jobId, owner],
    );
  }
}
