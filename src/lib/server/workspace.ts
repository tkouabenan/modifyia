import { execSql, oneSql, querySql, transaction } from "../db";
import { z } from "zod";
import { publicUser } from "./auth";
import { configuration, now, plans } from "./config";
import { assert, id } from "./security";
import { assetFor, assetPublic, type AssetRow } from "./storage";
import type { Project, Workspace } from "../types";
export async function listProjects(userId: string): Promise<Project[]> {
  const projects = await querySql(
    "SELECT * FROM projects WHERE user_id=? ORDER BY updated_at DESC LIMIT 200",
    [userId],
  );
  return Promise.all(
    projects.map(async (p) => {
      const job = await oneSql(
        "SELECT * FROM generation_jobs WHERE project_id=? ORDER BY created_at DESC LIMIT 1",
        [p.id],
      );
      const output =
        job?.status === "completed"
          ? await oneSql(
              "SELECT asset_id FROM generated_videos WHERE job_id=?",
              [job.id],
            )
          : null;
      const source = p.source_id
        ? await oneSql<AssetRow>(
            "SELECT * FROM video_uploads WHERE id=? AND user_id=?",
            [p.source_id, userId],
          )
        : null;
      const thumbnail = source
        ? JSON.parse(source.metadata).thumbnail_id
        : null;
      const characters = JSON.parse(p.character_ids);
      return {
        ...p,
        character_ids: characters,
        output_id: output?.asset_id,
        output_url: output ? `/api/assets/${output.asset_id}` : undefined,
        source_url: source ? `/api/assets/${source.id}` : undefined,
        thumbnail: thumbnail ? `/api/assets/${thumbnail}` : undefined,
        character_url: characters[0]
          ? `/api/assets/${characters[0]}`
          : undefined,
        error: job?.error,
        job_id: job?.id,
      } as Project;
    }),
  );
}
export async function workspace(userId: string): Promise<Workspace> {
  const [
    user,
    projects,
    characters,
    jobs,
    assets,
    catalog,
    config,
    transactions,
    notifications,
    subscription,
    payments,
  ] = await Promise.all([
    publicUser(userId),
    listProjects(userId),
    querySql(
      "SELECT * FROM character_assets WHERE user_id=? ORDER BY favorite DESC,created_at DESC LIMIT 200",
      [userId],
    ),
    querySql(
      "SELECT j.id,j.project_id,p.name,j.status,j.stage,j.cost,j.error,j.created_at,j.updated_at,j.provider_request_id FROM generation_jobs j JOIN projects p ON p.id=j.project_id WHERE j.user_id=? ORDER BY j.created_at DESC LIMIT 200",
      [userId],
    ),
    querySql<AssetRow>(
      "SELECT * FROM video_uploads WHERE user_id=? AND kind IN ('video','image') ORDER BY created_at DESC LIMIT 100",
      [userId],
    ),
    plans(),
    configuration(),
    querySql(
      "SELECT id,amount,reason,created_at FROM credit_transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
      [userId],
    ),
    querySql(
      "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30",
      [userId],
    ),
    oneSql(
      "SELECT plan,status,current_period_end FROM subscriptions WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
      [userId],
    ),
    querySql(
      "SELECT id,amount,currency,status,invoice_url,created_at FROM payment_transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
      [userId],
    ),
  ]);
  const storage = await oneSql(
    "SELECT COALESCE(SUM(size),0) AS total FROM video_uploads WHERE user_id=?",
    [userId],
  );
  const completed = await oneSql(
    "SELECT COUNT(*) AS total FROM generated_videos WHERE user_id=?",
    [userId],
  );
  const monthly = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 5 + i);
    const key = d.toISOString().slice(0, 7);
    return {
      month: d.toLocaleString("en", { month: "short", timeZone: "UTC" }),
      count: jobs.filter(
        (j) => j.created_at.startsWith(key) && j.status === "completed",
      ).length,
    };
  });
  return {
    user,
    projects,
    characters: characters.map((c) => ({
      ...c,
      url: `/api/assets/${c.asset_id}`,
    })),
    jobs,
    assets: assets.map(assetPublic),
    plans: catalog,
    config,
    stats: {
      total: Number(completed!.total),
      completed: Number(completed!.total),
      active: jobs.filter((j) =>
        ["queued", "uploading", "processing"].includes(j.status),
      ).length,
      failed: jobs.filter((j) => j.status === "failed").length,
      storage: Number(storage!.total),
      monthly,
    },
    transactions,
    notifications,
    subscription: subscription || undefined,
    payments,
  } as Workspace;
}
const projectSchema = z.object({
  name: z.string().trim().min(1).max(100).default("Untitled transformation"),
  prompt: z.string().max(10000).default(""),
  source_id: z.string().uuid().nullable().default(null),
  character_ids: z.array(z.string().uuid()).max(8).default([]),
  trim_start: z.number().min(0).max(300).default(0),
  trim_end: z.number().min(0).max(300).default(0),
  aspect: z
    .enum(["original", "16:9", "9:16", "1:1", "4:5"])
    .default("original"),
  audio: z.enum(["preserve", "mute"]).default("preserve"),
});
export async function saveProject(
  userId: string,
  body: Record<string, unknown>,
  projectId?: string,
) {
  const parsed = projectSchema.safeParse(body);
  assert(
    parsed.success,
    parsed.error?.issues[0]?.message || "Invalid project settings.",
  );
  const p = parsed.data;
  if (p.source_id) {
    const source = await assetFor(userId, p.source_id, "video");
    const duration = JSON.parse(source.metadata).duration;
    assert(
      p.trim_start <= p.trim_end && p.trim_end <= duration + 0.1,
      "The trim range is outside your source video.",
    );
  }
  for (const image of p.character_ids) await assetFor(userId, image, "image");
  const pid = projectId || id();
  await transaction(async () => {
    if (projectId) {
      const existing = await oneSql(
        "SELECT id FROM projects WHERE id=? AND user_id=?",
        [pid, userId],
      );
      assert(existing, "Project not found.", 404);
      const active = await oneSql(
        "SELECT id FROM generation_jobs WHERE project_id=? AND status IN ('queued','uploading','processing')",
        [pid],
      );
      assert(
        !active,
        "Wait for this generation to finish before editing its inputs.",
        409,
      );
      await execSql(
        "UPDATE projects SET name=?,prompt=?,source_id=?,character_ids=?,trim_start=?,trim_end=?,aspect=?,audio=?,updated_at=? WHERE id=? AND user_id=?",
        [
          p.name,
          p.prompt,
          p.source_id,
          JSON.stringify(p.character_ids),
          p.trim_start,
          p.trim_end,
          p.aspect,
          p.audio,
          now(),
          pid,
          userId,
        ],
      );
    } else
      await execSql(
        "INSERT INTO projects(id,user_id,name,prompt,source_id,character_ids,trim_start,trim_end,aspect,audio,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          pid,
          userId,
          p.name,
          p.prompt,
          p.source_id,
          JSON.stringify(p.character_ids),
          p.trim_start,
          p.trim_end,
          p.aspect,
          p.audio,
          now(),
          now(),
        ],
      );
  });
  return { id: pid, message: "Project saved to your workspace." };
}
export async function deleteProject(userId: string, projectId: string) {
  await transaction(async () => {
    const project = await oneSql(
      "SELECT id FROM projects WHERE id=? AND user_id=?",
      [projectId, userId],
    );
    assert(project, "Project not found.", 404);
    const active = await oneSql(
      "SELECT id FROM generation_jobs WHERE project_id=? AND status IN ('queued','uploading','processing')",
      [projectId],
    );
    assert(
      !active,
      "Cancel the active generation before deleting this project.",
      409,
    );
    await execSql("DELETE FROM projects WHERE id=? AND user_id=?", [
      projectId,
      userId,
    ]);
  });
  return {
    message:
      "Project deleted. Reusable source media remains in your workspace.",
  };
}
export async function duplicateProject(userId: string, projectId: string) {
  const row = await oneSql("SELECT * FROM projects WHERE id=? AND user_id=?", [
    projectId,
    userId,
  ]);
  assert(row, "Project not found.", 404);
  return saveProject(userId, {
    ...row,
    name: `${row.name.slice(0, 90)} (copy)`,
    character_ids: JSON.parse(row.character_ids),
  });
}
