import { createHiggsfieldClient } from "@higgsfield/client/v2";
import { z } from "zod";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { MotionProvider, ProviderResult } from "./types";
import { ProviderError } from "./types";
const base = "https://api.higgsfield.ai";
const resultSchema = z.object({
  request_id: z.string().min(1),
  status: z.enum([
    "queued",
    "in_progress",
    "completed",
    "failed",
    "nsfw",
    "canceled",
  ]),
  status_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
  video: z.object({ url: z.string().url() }).optional(),
  error: z.unknown().optional(),
});
export function providerUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.origin !== base || parsed.username || parsed.password)
    throw new ProviderError("The provider returned an untrusted request URL.");
  return url;
}
function privateIp(ip: string) {
  return /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|224\.|::1$|::ffff:|f[cd][\da-f]{2}:|fe[89ab][\da-f]:|::$)/i.test(
    ip,
  );
}
export async function safeRemoteUrl(url: string) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    (parsed.port && parsed.port !== "443")
  )
    throw new ProviderError("The provider returned an invalid media URL.");
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((a) => privateIp(a.address)))
    throw new ProviderError("Private-network media URLs are not permitted.");
  return url;
}
export async function downloadRemote(
  url: string,
  maxBytes = 250 * 1024 * 1024,
): Promise<Buffer> {
  for (let redirects = 0; redirects < 4; redirects++) {
    await safeRemoteUrl(url);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(180_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new ProviderError("Invalid media redirect.");
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok)
      throw new ProviderError(
        "The generated video could not be retrieved.",
        response.status >= 500,
      );
    if (Number(response.headers.get("content-length") || 0) > maxBytes)
      throw new ProviderError(
        "The provider output exceeds the media size limit.",
      );
    const chunks: Buffer[] = [];
    let length = 0;
    const reader = response.body!.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new ProviderError("The generated video is too large.");
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  throw new ProviderError("Too many media redirects.");
}
async function hfFetch(url: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(providerUrl(url), {
      ...init,
      redirect: "error",
      headers: {
        Authorization: `Key ${process.env.HF_CREDENTIALS}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(40_000),
    });
  } catch {
    throw new ProviderError(
      "The AI provider is temporarily unreachable. The worker will retry safely.",
      true,
    );
  }
  if (!response.ok)
    throw new ProviderError(
      response.status === 401
        ? "The AI provider credentials were rejected."
        : response.status === 402 || response.status === 403
          ? "The provider account needs API access or additional balance."
          : `The AI provider returned HTTP ${response.status}.`,
      response.status === 429 || response.status >= 500,
    );
  return response;
}
export class HiggsfieldProvider implements MotionProvider {
  readonly name = "Higgsfield Genjutsu";
  constructor() {
    if (!process.env.HF_CREDENTIALS)
      throw new ProviderError(
        "Configure HF_CREDENTIALS to enable real motion transfer.",
      );
  }
  async upload(data: Buffer, mime: string) {
    const response = await hfFetch(`${base}/files/generate-upload-url`, {
      method: "POST",
      body: JSON.stringify({ content_type: mime }),
    });
    const upload = z
      .object({
        public_url: z.string().url(),
        upload_url: z.string().url(),
        upload_headers: z.record(z.string(), z.string()),
      })
      .parse(await response.json());
    await safeRemoteUrl(upload.upload_url);
    await safeRemoteUrl(upload.public_url);
    let put: Response;
    try {
      put = await fetch(upload.upload_url, {
        method: "PUT",
        headers: upload.upload_headers,
        body: new Uint8Array(data),
        redirect: "error",
        signal: AbortSignal.timeout(180_000),
      });
    } catch {
      throw new ProviderError(
        "Could not upload prepared media to the provider.",
        true,
      );
    }
    if (!put.ok)
      throw new ProviderError(
        "The provider media upload was rejected.",
        put.status >= 500,
      );
    return upload.public_url;
  }
  async submit(
    input: {
      video_url: string;
      image_urls: string[];
      prompt: string;
      resolution: "720p";
    },
    idempotencyKey: string,
  ): Promise<ProviderResult> {
    const client = createHiggsfieldClient({
      credentials: process.env.HF_CREDENTIALS,
      baseURL: base,
      timeout: 45_000,
      maxRetries: 2,
      headers: { "Idempotency-Key": idempotencyKey },
    });
    try {
      const res = resultSchema.parse(
        await client.subscribe("higgsfield/genjutsu/motion-transfer/v1.0", {
          input,
          withPolling: false,
        }),
      );
      if (res.status_url) providerUrl(res.status_url);
      if (res.cancel_url) providerUrl(res.cancel_url);
      return res;
    } catch (e: any) {
      if (e instanceof ProviderError) throw e;
      const status = Number(e.status || e.statusCode || 0);
      throw new ProviderError(
        status === 401
          ? "The AI provider credentials were rejected."
          : status === 403
            ? "The provider account needs API access or balance."
            : "The AI provider could not accept this request.",
        !status || status === 429 || status >= 500,
      );
    }
  }
  async status(url: string) {
    return resultSchema.parse(await (await hfFetch(url)).json());
  }
  async cancel(url: string) {
    await hfFetch(url, { method: "POST" });
  }
}
export const motionProvider = (): MotionProvider => new HiggsfieldProvider();
