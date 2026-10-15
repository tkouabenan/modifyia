import { randomUUID } from "node:crypto";
import { renderLocalMotionTransfer } from "../server/local-engine";
import type { MotionProvider, ProviderResult } from "./types";
import { ProviderError } from "./types";

const blobs = new Map<string, Buffer>();

export function storeLocalMedia(data: Buffer) {
  const id = randomUUID();
  blobs.set(id, data);
  return `local-media://${id}`;
}

export function readLocalMedia(url: string) {
  if (!url.startsWith("local-media://")) return null;
  return blobs.get(url.slice("local-media://".length)) || null;
}

export class LocalMotionProvider implements MotionProvider {
  readonly name = "MODIFY AI local engine";
  async upload(data: Buffer) {
    return storeLocalMedia(data);
  }
  async submit(input: {
    video_url: string;
    image_urls: string[];
    prompt: string;
    resolution: "720p";
  }): Promise<ProviderResult> {
    const video = readLocalMedia(input.video_url);
    const character = input.image_urls
      .map((url) => readLocalMedia(url))
      .find(Boolean);
    if (!video || !character)
      throw new ProviderError("Prepared source media was missing for local generation.");
    try {
      const output = await renderLocalMotionTransfer(video, character);
      return {
        request_id: randomUUID(),
        status: "completed",
        video: { url: storeLocalMedia(output) },
      };
    } catch (e) {
      throw new ProviderError(
        e instanceof Error
          ? e.message
          : "The local motion engine could not complete this video.",
      );
    }
  }
  async status(): Promise<ProviderResult> {
    throw new ProviderError("Local generations complete in a single step.");
  }
  async cancel() {}
}
