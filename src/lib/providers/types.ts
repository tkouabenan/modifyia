export type ProviderState =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "nsfw"
  | "canceled";
export interface ProviderResult {
  request_id: string;
  status: ProviderState;
  status_url?: string;
  cancel_url?: string;
  video?: { url: string };
  error?: unknown;
}
export interface MotionProvider {
  readonly name: string;
  upload(data: Buffer, mime: string): Promise<string>;
  submit(
    input: {
      video_url: string;
      image_urls: string[];
      prompt: string;
      resolution: "720p";
    },
    idempotencyKey: string,
  ): Promise<ProviderResult>;
  status(url: string): Promise<ProviderResult>;
  cancel(url: string): Promise<void>;
}
export class ProviderError extends Error {
  constructor(
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
