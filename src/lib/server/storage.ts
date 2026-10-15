import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { execSql, oneSql } from "../db";
import type { Asset } from "../types";
import { now } from "./config";
import { assert, id } from "./security";
export const mediaRoot = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.env.MEDIA_ROOT || "./data/media",
  );
const s3 = () =>
  new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    ...(process.env.S3_ENDPOINT
      ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
      : {}),
    ...(process.env.S3_ACCESS_KEY_ID
      ? {
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
          },
        }
      : {}),
  });
export type AssetRow = {
  id: string;
  user_id: string;
  name: string;
  kind: Asset["kind"];
  mime: string;
  size: number;
  storage_key: string;
  metadata: string;
  created_at: string;
};
export function assetPublic(row: AssetRow): Asset {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    mime: row.mime,
    size: row.size,
    metadata: JSON.parse(row.metadata),
    url: `/api/assets/${row.id}`,
    created_at: row.created_at,
  };
}
export async function saveAsset(
  userId: string,
  name: string,
  kind: Asset["kind"],
  mime: string,
  data: Buffer,
  metadata: Asset["metadata"] & Record<string, unknown> = {},
): Promise<AssetRow> {
  const assetId = id();
  const key = `${userId}/${assetId}.${mime === "video/mp4" ? "mp4" : "jpg"}`;
  if (process.env.S3_BUCKET)
    await s3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: data,
        ContentType: mime,
        ServerSideEncryption: "AES256",
      }),
    );
  else {
    await fs.mkdir(path.join(/* turbopackIgnore: true */ mediaRoot(), userId), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(/* turbopackIgnore: true */ mediaRoot(), key),
      data,
      { mode: 0o600 },
    );
  }
  const row: AssetRow = {
    id: assetId,
    user_id: userId,
    name: name.slice(0, 180),
    kind,
    mime,
    size: data.length,
    storage_key: key,
    metadata: JSON.stringify(metadata),
    created_at: now(),
  };
  try {
    await execSql(
      "INSERT INTO video_uploads(id,user_id,name,kind,mime,size,storage_key,metadata,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        row.id,
        row.user_id,
        row.name,
        row.kind,
        row.mime,
        row.size,
        row.storage_key,
        row.metadata,
        row.created_at,
      ],
    );
  } catch (e) {
    await deleteObject(key);
    throw e;
  }
  return row;
}
export async function assetFor(
  userId: string,
  assetId: string,
  kind?: Asset["kind"],
) {
  const row = await oneSql<AssetRow>(
    "SELECT * FROM video_uploads WHERE id=? AND user_id=?",
    [assetId, userId],
  );
  assert(
    row && (!kind || row.kind === kind),
    "This media is not available in your workspace.",
    404,
  );
  return row;
}
export async function assetBuffer(asset: AssetRow) {
  if (process.env.S3_BUCKET) {
    const res = await s3().send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: asset.storage_key,
      }),
    );
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  return fs.readFile(
    /* turbopackIgnore: true */ path.join(
      /* turbopackIgnore: true */ mediaRoot(),
      asset.storage_key,
    ),
  );
}
async function deleteObject(key: string) {
  if (process.env.S3_BUCKET)
    await s3().send(
      new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    );
  else
    await fs.rm(path.join(/* turbopackIgnore: true */ mediaRoot(), key), {
      force: true,
    });
}
export async function removeAsset(row: AssetRow) {
  await deleteObject(row.storage_key);
  await execSql("DELETE FROM video_uploads WHERE id=?", [row.id]);
}
export async function serveAsset(req: Request, asset: AssetRow) {
  const url = new URL(req.url);
  const isDownload = url.searchParams.has("download");
  const filename =
    (url.searchParams.get("name") || asset.name)
      .replace(/[^\p{L}\p{N}_. -]/gu, "")
      .slice(0, 100)
      .replace(/\.[^.]+$/, "") || "modify-ai-video";
  const disposition = isDownload
    ? `attachment; filename="${filename.replace(/[^a-zA-Z0-9_. -]/g, "_")}.${asset.mime === "video/mp4" ? "mp4" : "jpg"}"; filename*=UTF-8''${encodeURIComponent(filename)}.${asset.mime === "video/mp4" ? "mp4" : "jpg"}`
    : "inline";
  if (process.env.S3_BUCKET) {
    const signed = await getSignedUrl(
      s3(),
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: asset.storage_key,
        ResponseContentDisposition: disposition,
        ResponseContentType: asset.mime,
      }),
      { expiresIn: 60 },
    );
    return new Response(null, {
      status: 302,
      headers: { Location: signed, "Cache-Control": "private, no-store" },
    });
  }
  const file = path.join(
    /* turbopackIgnore: true */ mediaRoot(),
    asset.storage_key,
  );
  const stat = await fs.stat(/* turbopackIgnore: true */ file);
  const headers: Record<string, string> = {
    "Content-Type": asset.mime,
    "Content-Disposition": disposition,
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  };
  let start = 0,
    end = stat.size - 1,
    status = 200;
  const range = req.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]))
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    start = match[1]
      ? Number(match[1])
      : Math.max(0, stat.size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
    if (start > end || start >= stat.size)
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
    status = 206;
  }
  headers["Content-Length"] = String(end - start + 1);
  return new Response(
    Readable.toWeb(
      createReadStream(/* turbopackIgnore: true */ file, { start, end }),
    ) as ReadableStream,
    { status, headers },
  );
}
