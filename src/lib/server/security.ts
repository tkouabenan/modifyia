import {
  createHash,
  randomBytes,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { execSql, oneSql, transaction } from "../db";
import { now } from "./config";
export const id = () => randomUUID();
export const hash = (str: string) =>
  createHash("sha256").update(str).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_ERROR",
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new AppError(status, message);
}
export function cookies(req: Request) {
  return Object.fromEntries(
    (req.headers.get("cookie") || "")
      .split(";")
      .filter(Boolean)
      .map((c) => {
        const i = c.indexOf("=");
        return [c.slice(0, i).trim(), c.slice(i + 1).trim()];
      }),
  );
}
export function requestOrigin(req: Request) {
  if (process.env.APP_URL) return new URL(process.env.APP_URL).origin;
  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    new URL(req.url).host;
  const proto =
    req.headers.get("x-forwarded-proto") ||
    new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}
export function verifyOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site")
    throw new AppError(403, "Cross-site requests are not allowed.");
  if (origin && origin !== requestOrigin(req))
    throw new AppError(403, "Invalid request origin.");
  // JSON requests without Origin are permitted for server-to-server clients; cookies alone are not sufficient for HTML form CSRF.
  if (
    req.method !== "DELETE" &&
    !req.headers
      .get("content-type")
      ?.match(/application\/json|multipart\/form-data/)
  )
    throw new AppError(415, "Expected JSON or a multipart file upload.");
}
export function cookieHeader(
  value: string,
  req: Request,
  maxAge = 60 * 60 * 24 * 30,
) {
  return `modify_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${requestOrigin(req).startsWith("https:") ? "; Secure" : ""}`;
}
export async function rateLimit(
  req: Request,
  scope: string,
  max = 40,
  windowSeconds = 60,
  userId?: string,
) {
  const ip =
    userId ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "local";
  const key = `${scope}:${hash(ip)}`;
  await transaction(async () => {
    const reset = new Date(Date.now() + windowSeconds * 1000).toISOString();
    await execSql(
      `INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.reset_at < ? THEN 1 ELSE rate_limits.count+1 END, reset_at=CASE WHEN rate_limits.reset_at < ? THEN ? ELSE rate_limits.reset_at END`,
      [key, reset, now(), now(), reset],
    );
    const row = await oneSql("SELECT count FROM rate_limits WHERE key=?", [
      key,
    ]);
    if (row!.count > max)
      throw new AppError(429, "Too many requests. Please try again shortly.");
  });
}
export async function jsonBody(
  req: Request,
  max = 32_768,
): Promise<Record<string, unknown>> {
  assert(
    Number(req.headers.get("content-length") || 0) <= max,
    "Request is too large.",
    413,
  );
  const body = await req.text();
  assert(Buffer.byteLength(body) <= max, "Request is too large.", 413);
  try {
    const parsed = JSON.parse(body);
    assert(
      parsed && typeof parsed === "object" && !Array.isArray(parsed),
      "Invalid JSON.",
    );
    return parsed;
  } catch {
    throw new AppError(400, "Invalid JSON request.");
  }
}
export function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
