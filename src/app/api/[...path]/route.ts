import type { CountRow, ProjectRow } from "@/lib/server/records";
import { NextResponse } from "next/server";
import { z } from "zod";
import sharp from "sharp";
import bcrypt from "bcryptjs";
import { execSql, oneSql, querySql } from "@/lib/db";
import {
  AppError,
  assert,
  id,
  jsonBody,
  verifyOrigin,
  rateLimit,
  cookieHeader,
} from "@/lib/server/security";
import {
  account,
  bootstrapAccount,
  consumeAuthToken,
  googleCallback,
  googleStart,
  login,
  logout,
  register,
  requestPasswordReset,
  requireAccount,
  resendVerification,
} from "@/lib/server/auth";
import { configuration, now, plans } from "@/lib/server/config";
import {
  workspace,
  saveProject,
  deleteProject,
  duplicateProject,
} from "@/lib/server/workspace";
import {
  assetFor,
  assetBuffer,
  assetPublic,
  removeAsset,
  saveAsset,
  serveAsset,
  type AssetRow,
} from "@/lib/server/storage";
import { normalizeImage, processUpload } from "@/lib/server/media";
import { cancelJob, createJob } from "@/lib/server/jobs";
import { checkout, billingPortal, stripeWebhook } from "@/lib/server/billing";
import { requireAdmin, adminAction, adminData } from "@/lib/server/admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function boundedMultipart(req: Request, max: number) {
  assert(
    Number(req.headers.get("content-length") || 0) <= max,
    "This upload is too large.",
    413,
  );
  const reader = req.body?.getReader();
  assert(reader, "No file was received.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > max) {
      await reader.cancel();
      throw new AppError(413, "This upload is too large.");
    }
    chunks.push(value);
  }
  const data = await new Response(Buffer.concat(chunks), {
    headers: { "Content-Type": req.headers.get("content-type")! },
  }).formData();
  return data;
}
async function dispatch(req: Request, segments: string[]) {
  const path = segments.join("/"),
    method = req.method;
  if (path === "billing/webhook" && method === "POST")
    return stripeWebhook(req);
  if (path === "auth/google" && method === "GET") return googleStart(req);
  if (path === "auth/google/callback" && method === "GET")
    return googleCallback(req);
  if (path === "health" && method === "GET")
    return { status: "ok", service: "MODIFY AI", time: now() };
  if (!["GET", "HEAD"].includes(method)) verifyOrigin(req);
  if (path === "bootstrap" && method === "POST") {
    if (!(await account(req))) await rateLimit(req, "guest", 20, 3600);
    const { user, cookie } = await bootstrapAccount(req);
    return { ...(await workspace(user.id)), ...(cookie ? { cookie } : {}) };
  }
  if (path === "plans" && method === "GET") return { plans: await plans() };
  if (path.startsWith("auth/")) {
    await rateLimit(req, "auth", 12, 60);
    if (path === "auth/logout" && method === "POST")
      return {
        message: "You have been signed out.",
        cookie: await logout(req),
      };
    if (path === "auth/resend-verification" && method === "POST")
      return resendVerification(req);
    const body = await jsonBody(req);
    if (path === "auth/register" && method === "POST")
      return register(req, body);
    if (path === "auth/login" && method === "POST") return login(req, body);
    if (path === "auth/forgot-password" && method === "POST")
      return requestPasswordReset(req, body);
    if (path === "auth/reset-password" && method === "POST")
      return consumeAuthToken(req, body, "reset");
    if (path === "auth/verify-email" && method === "POST")
      return consumeAuthToken(req, body, "verify");
  }
  const user = await requireAccount(req);
  if (path === "workspace" && method === "GET") return workspace(user.id);
  if (path === "configuration" && method === "GET") return configuration();
  if (path === "notifications/read" && method === "POST") {
    await execSql(
      "UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL",
      [now(), user.id],
    );
    return { ok: true };
  }
  if (path === "uploads" && method === "POST") {
    await rateLimit(req, "uploads", 20, 3600, user.id);
    const config = await configuration();
    const max =
      Math.max(config.maxVideoMb, config.maxImageMb) * 1024 * 1024 +
      1024 * 1024;
    const form = await boundedMultipart(req, max);
    const file = form.get("file"),
      kind = form.get("kind");
    assert(
      file instanceof File && (kind === "video" || kind === "image"),
      "Choose a file and its media type.",
    );
    assert(file.size > 0, "This file is empty.");
    assert(
      file.size <=
        (kind === "video" ? config.maxVideoMb : config.maxImageMb) *
          1024 *
          1024,
      `${kind === "video" ? "Video" : "Image"} files must be ${kind === "video" ? config.maxVideoMb : config.maxImageMb} MB or smaller.`,
      413,
    );
    const userData = await workspace(user.id);
    const cap =
      userData.plans.find((p) => p.id === userData.user.plan)!.storageMb *
      1024 *
      1024;
    assert(
      userData.stats.storage + file.size <= cap,
      "Your workspace storage is full. Remove unused media or upgrade your plan.",
      413,
    );
    const asset = await processUpload(user.id, file, kind);
    const current = await oneSql<CountRow>(
      "SELECT COALESCE(SUM(size),0) AS total FROM video_uploads WHERE user_id=?",
      [user.id],
    );
    if (Number(current!.total) > cap) {
      await removeAsset(asset);
      throw new AppError(
        413,
        "The normalized upload exceeds your storage limit.",
      );
    }
    let characterId: string | undefined;
    if (kind === "image") {
      characterId = id();
      await execSql(
        "INSERT INTO character_assets(id,user_id,asset_id,name,created_at) VALUES(?,?,?,?,?)",
        [
          characterId,
          user.id,
          asset.id,
          file.name.replace(/\.[^.]+$/, "").slice(0, 80),
          now(),
        ],
      );
    }
    return {
      asset: assetPublic(asset),
      characterId,
      message:
        kind === "video"
          ? "Video inspected and normalized to H.264 MP4."
          : "Character normalized and saved to your library.",
    };
  }
  if (segments[0] === "assets" && segments[1]) {
    const asset = await assetFor(user.id, segments[1]);
    if (method === "GET") return serveAsset(req, asset);
    if (method === "DELETE") {
      const projects = await querySql<ProjectRow>(
        "SELECT source_id,character_ids FROM projects WHERE user_id=?",
        [user.id],
      );
      assert(
        !projects.some(
          (p) =>
            p.source_id === asset.id ||
            JSON.parse(p.character_ids).includes(asset.id),
        ),
        "This asset is used by a project. Delete that project first.",
        409,
      );
      const result = await oneSql(
        "SELECT id FROM generated_videos WHERE asset_id=?",
        [asset.id],
      );
      assert(
        !result,
        "Delete the associated project before removing its result.",
        409,
      );
      await removeAsset(asset);
      return { message: "Unused media deleted." };
    }
  }
  if (
    segments[0] === "images" &&
    segments[1] &&
    segments[2] === "edit" &&
    method === "POST"
  ) {
    await rateLimit(req, "image-edit", 30, 3600, user.id);
    const original = await assetFor(user.id, segments[1], "image");
    const body = await jsonBody(req);
    const ratio = String(body.ratio || "original");
    assert(
      ["original", "1:1", "4:5", "3:4"].includes(ratio),
      "Unsupported crop ratio.",
    );
    const buffer = await assetBuffer(original);
    const meta = await sharp(buffer).metadata();
    let crop;
    if (ratio !== "original") {
      const [w, h] = ratio.split(":").map(Number),
        r = w / h,
        width = Math.min(meta.width!, Math.floor(meta.height! * r)),
        height = Math.min(meta.height!, Math.floor(meta.width! / r));
      crop = {
        left: Math.floor((meta.width! - width) / 2),
        top: Math.floor((meta.height! - height) / 2),
        width,
        height,
      };
    }
    const result = await normalizeImage(buffer, body.enhance === true, crop);
    const saved = await saveAsset(
      user.id,
      original.name.replace(".jpg", "") + " edited.jpg",
      "image",
      "image/jpeg",
      result.data,
      result.metadata,
    );
    await execSql(
      "INSERT INTO character_assets(id,user_id,asset_id,name,created_at) VALUES(?,?,?,?,?)",
      [
        id(),
        user.id,
        saved.id,
        original.name.replace(".jpg", "") + " edited",
        now(),
      ],
    );
    return {
      asset: assetPublic(saved),
      message: "Edited copy saved. Your original is unchanged.",
    };
  }
  if (segments[0] === "projects") {
    const pid = segments[1];
    if (!pid && method === "POST")
      return saveProject(user.id, await jsonBody(req));
    if (pid && segments[2] === "duplicate" && method === "POST")
      return duplicateProject(user.id, pid);
    if (pid && segments[2] === "generate" && method === "POST") {
      await rateLimit(req, "generate", 10, 3600, user.id);
      const body = await jsonBody(req);
      return createJob(user.id, pid, body.consent === true);
    }
    if (pid && method === "PATCH") {
      const body = await jsonBody(req);
      if (Object.keys(body).length === 1 && typeof body.name === "string") {
        assert(
          body.name.trim().length > 0 && body.name.length <= 100,
          "Enter a name (1–100 characters).",
        );
        const changed = await execSql(
          "UPDATE projects SET name=?,updated_at=? WHERE id=? AND user_id=?",
          [body.name.trim(), now(), pid, user.id],
        );
        assert(changed, "Project not found.", 404);
        return { message: "Project renamed." };
      }
      return saveProject(user.id, body, pid);
    }
    if (pid && method === "DELETE") return deleteProject(user.id, pid);
  }
  if (
    segments[0] === "jobs" &&
    segments[1] &&
    segments[2] === "cancel" &&
    method === "POST"
  )
    return cancelJob(user.id, segments[1]);
  if (segments[0] === "characters") {
    if (!segments[1] && method === "POST") {
      const body = await jsonBody(req);
      const parsed = z
        .object({
          asset_id: z.string().uuid(),
          name: z.string().trim().min(1).max(80),
          collection: z.string().max(60).default("My characters"),
        })
        .safeParse(body);
      assert(parsed.success, "Enter a character name and select an image.");
      await assetFor(user.id, parsed.data.asset_id, "image");
      const cid = id();
      await execSql(
        "INSERT INTO character_assets(id,user_id,asset_id,name,collection,created_at) VALUES(?,?,?,?,?,?)",
        [
          cid,
          user.id,
          parsed.data.asset_id,
          parsed.data.name,
          parsed.data.collection,
          now(),
        ],
      );
      return { id: cid };
    }
    const cid = segments[1];
    const character = await oneSql(
      "SELECT id FROM character_assets WHERE id=? AND user_id=?",
      [cid, user.id],
    );
    assert(character, "Character not found.", 404);
    if (method === "PATCH") {
      const body = await jsonBody(req);
      const parsed = z
        .object({
          name: z.string().trim().min(1).max(80).optional(),
          collection: z.string().trim().min(1).max(60).optional(),
          favorite: z.boolean().optional(),
        })
        .safeParse(body);
      assert(parsed.success, "Invalid character settings.");
      const c = parsed.data;
      await execSql(
        "UPDATE character_assets SET name=COALESCE(?,name),collection=COALESCE(?,collection),favorite=COALESCE(?,favorite) WHERE id=? AND user_id=?",
        [
          c.name ?? null,
          c.collection ?? null,
          c.favorite === undefined ? null : c.favorite ? 1 : 0,
          cid,
          user.id,
        ],
      );
      return { message: "Character updated." };
    }
    if (method === "DELETE") {
      await execSql("DELETE FROM character_assets WHERE id=? AND user_id=?", [
        cid,
        user.id,
      ]);
      return {
        message:
          "Character removed from your library. Project references are preserved.",
      };
    }
  }
  if (path === "profile" && method === "PATCH") {
    const body = await jsonBody(req);
    const parsed = z
      .object({
        name: z.string().trim().min(2).max(80),
        locale: z.enum(["en", "fr"]),
        notifications: z.boolean().optional(),
      })
      .safeParse(body);
    assert(parsed.success, "Enter a valid name and language.");
    await execSql("UPDATE users SET name=?,updated_at=? WHERE id=?", [
      parsed.data.name,
      now(),
      user.id,
    ]);
    await execSql(
      "UPDATE profiles SET locale=?,notifications=COALESCE(?,notifications) WHERE user_id=?",
      [
        parsed.data.locale,
        parsed.data.notifications === undefined
          ? null
          : parsed.data.notifications
            ? 1
            : 0,
        user.id,
      ],
    );
    return { message: "Preferences saved." };
  }
  if (path === "account" && method === "DELETE") {
    const body = await jsonBody(req);
    assert(
      body.confirmation === "DELETE",
      "Type DELETE to confirm account deletion.",
    );
    if (user.password_hash)
      assert(
        await bcrypt.compare(String(body.password || ""), user.password_hash),
        "Confirm your password to delete this account.",
        403,
      );
    const active = await oneSql(
      "SELECT id FROM generation_jobs WHERE user_id=? AND status IN ('queued','uploading','processing')",
      [user.id],
    );
    assert(
      !active,
      "Wait for or cancel active jobs before deleting your account.",
      409,
    );
    const sub = await oneSql(
      "SELECT id FROM subscriptions WHERE user_id=? AND status IN ('active','trialing','past_due')",
      [user.id],
    );
    assert(
      !sub,
      "Cancel your subscription in the billing portal before deleting your account.",
      409,
    );
    const assets = await querySql<AssetRow>(
      "SELECT * FROM video_uploads WHERE user_id=?",
      [user.id],
    );
    await execSql("DELETE FROM users WHERE id=?", [user.id]);
    for (const asset of assets)
      try {
        await removeAsset(asset);
      } catch {
        console.error("Media cleanup requires retry for a deleted account.");
      }
    return {
      message: "Your account and workspace have been deleted.",
      cookie: cookieHeader("", req, 0),
    };
  }
  if (path === "billing/checkout" && method === "POST") {
    await requireAccount(req, true);
    await rateLimit(req, "checkout", 8, 60, user.id);
    const body = await jsonBody(req);
    return checkout(req, user.id, String(body.plan));
  }
  if (path === "billing/portal" && method === "POST") {
    await requireAccount(req, true);
    return billingPortal(req, user.id);
  }
  if (path === "admin" && method === "GET") {
    await requireAdmin(req);
    return adminData();
  }
  if (path === "admin" && method === "POST") {
    const admin = await requireAdmin(req);
    return adminAction(admin.id, await jsonBody(req, 64_000));
  }
  throw new AppError(404, "This API endpoint does not exist.");
}
async function handler(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const data = await dispatch(req, (await ctx.params).path);
    if (data instanceof Response) return data;
    const { cookie, ...body } = data as Record<string, unknown>;
    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "private, no-store",
        ...(cookie ? { "Set-Cookie": String(cookie) } : {}),
      },
    });
  } catch (e) {
    if (e instanceof AppError)
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: e.status, headers: { "Cache-Control": "no-store" } },
      );
    if (e instanceof z.ZodError)
      return NextResponse.json(
        {
          error: "The service returned an invalid response. Please try again.",
        },
        { status: 502 },
      );
    console.error(
      "API request failed:",
      e instanceof Error ? e.message : "Unknown error",
    );
    return NextResponse.json(
      {
        error:
          "Something went wrong. Please try again. Your saved work is safe.",
      },
      { status: 500 },
    );
  }
}
export const GET = handler,
  POST = handler,
  PATCH = handler,
  DELETE = handler;
