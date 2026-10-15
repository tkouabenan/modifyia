import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { binaries, command, probe } from "../src/lib/server/media";
import { renderLocalMotionTransfer } from "../src/lib/server/local-engine";
import { LocalMotionProvider } from "../src/lib/providers/local";

describe("Local motion engine", () => {
  let dir = "";
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });
  it("renders a real MP4 from a source clip and character image", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "modify-local-engine-"));
    const videoPath = path.join(dir, "source.mp4");
    await command(binaries().ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=640x360:rate=15:duration=4",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=4",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-shortest",
      "-y",
      videoPath,
    ]);
    const video = await (await import("node:fs/promises")).readFile(videoPath);
    const character = await sharp({
      create: {
        width: 256,
        height: 320,
        channels: 3,
        background: { r: 124, g: 58, b: 237 },
      },
    })
      .jpeg()
      .toBuffer();
    const output = await renderLocalMotionTransfer(video, character);
    await writeFile(path.join(dir, "out.mp4"), output);
    const meta = await probe(path.join(dir, "out.mp4"));
    expect(meta.codec).toBe("h264");
    expect(meta.duration).toBeGreaterThan(3);
    expect(meta.duration).toBeLessThan(5.5);
  }, 60_000);
  it("completes a local provider submit without remote URLs", async () => {
    const provider = new LocalMotionProvider();
    const videoPath = path.join(tmpdir(), `modify-src-${Date.now()}.mp4`);
    await command(binaries().ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=320x180:d=4:r=10",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-y",
      videoPath,
    ]);
    const { readFile, unlink } = await import("node:fs/promises");
    const video = await readFile(videoPath);
    await unlink(videoPath);
    const image = await sharp({
      create: {
        width: 160,
        height: 200,
        channels: 3,
        background: { r: 34, g: 211, b: 238 },
      },
    })
      .jpeg()
      .toBuffer();
    const result = await provider.submit(
      {
        video_url: await provider.upload(video),
        image_urls: [await provider.upload(image)],
        prompt: "test",
        resolution: "720p",
      },
    );
    expect(result.status).toBe("completed");
    expect(result.video?.url.startsWith("local-media://")).toBe(true);
  }, 60_000);
});
