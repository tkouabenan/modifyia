import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import type { Aspect, Asset } from "../types";
import { assert, AppError } from "./security";
import { assetBuffer, saveAsset, type AssetRow } from "./storage";
const require = createRequire(import.meta.url);
export function binaries() {
  return {
    ffmpeg: process.env.FFMPEG_PATH || require("@ffmpeg-installer/ffmpeg").path,
    ffprobe:
      process.env.FFPROBE_PATH || require("@ffprobe-installer/ffprobe").path,
  };
}
export async function command(
  executable: string,
  args: string[],
  timeout = 180_000,
) {
  return new Promise<string>((resolve, reject) => {
    const proc = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let out = "",
      err = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(
        new AppError(
          422,
          "Media preparation took too long. Try a smaller file or a shorter clip.",
        ),
      );
    }, timeout);
    proc.stdout.on("data", (c) => {
      if (out.length < 500_000) out += c;
    });
    proc.stderr.on("data", (c) => {
      err = (err + c).slice(-4000);
    });
    proc.on("error", () => {
      clearTimeout(timer);
      reject(
        new AppError(
          503,
          "FFmpeg or FFprobe is unavailable. Configure the media processing binaries.",
        ),
      );
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else
        reject(
          new AppError(
            422,
            `This file could not be decoded or converted. Export it as H.264 MP4 or a standard JPG/PNG image and try again. ${process.env.NODE_ENV !== "production" ? err.split("\n").filter(Boolean).slice(-1)[0] || "" : ""}`,
          ),
        );
    });
  });
}
export async function tempMedia<T>(fn: (dir: string) => Promise<T>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "modify-ai-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
export async function probe(file: string) {
  const output = JSON.parse(
    await command(
      binaries().ffprobe,
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file,
      ],
      30_000,
    ),
  );
  const v = output.streams?.find((s: any) => s.codec_type === "video");
  assert(
    v && Number(v.width) > 0 && Number(v.height) > 0,
    "No decodable video stream was found.",
    422,
  );
  const duration = Number(output.format?.duration || v.duration);
  const [n, d] = String(v.avg_frame_rate || v.r_frame_rate || "0/1")
    .split("/")
    .map(Number);
  return {
    width: Number(v.width),
    height: Number(v.height),
    duration,
    fps: d ? n / d : n,
    audio: output.streams.some((s: any) => s.codec_type === "audio"),
    format: output.format?.format_name,
    codec: v.codec_name,
    audioCodec: output.streams.find((s: any) => s.codec_type === "audio")
      ?.codec_name,
  };
}
export function outputDimensions(
  width: number,
  height: number,
  aspect: Aspect,
) {
  const ratio =
    aspect === "original"
      ? width / height
      : Number(aspect.split(":")[0]) / Number(aspect.split(":")[1]);
  assert(
    Number.isFinite(ratio) && ratio >= 0.25 && ratio <= 4,
    "This aspect ratio is not supported.",
  );
  return ratio >= 1
    ? { width: Math.round((720 * ratio) / 2) * 2, height: 720 }
    : { width: 720, height: Math.round(720 / ratio / 2) * 2 };
}
export function fitFilter(width: number, height: number) {
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
}
export async function normalizeImage(
  buffer: Buffer,
  enhance = false,
  crop?: { left: number; top: number; width: number; height: number },
) {
  try {
    const meta = await sharp(buffer, {
      animated: false,
      limitInputPixels: 40_000_000,
      failOn: "error",
    }).metadata();
    assert(
      meta.width && meta.height && meta.width >= 128 && meta.height >= 128,
      "Use a character image at least 128 × 128 pixels.",
    );
    let img = sharp(buffer, {
      animated: false,
      limitInputPixels: 40_000_000,
    }).rotate();
    if (crop) {
      const oriented = await img.toBuffer({ resolveWithObject: true });
      assert(
        crop.left >= 0 &&
          crop.top >= 0 &&
          crop.width >= 128 &&
          crop.height >= 128 &&
          crop.left + crop.width <= oriented.info.width &&
          crop.top + crop.height <= oriented.info.height,
        "Crop extends outside the image.",
      );
      img = sharp(oriented.data).extract(crop);
    }
    img = img.resize({
      width: 2048,
      height: 2048,
      fit: "inside",
      withoutEnlargement: true,
    });
    if (enhance) img = img.normalise().sharpen({ sigma: 0.5 });
    const { data, info } = await img
      .jpeg({ quality: 92 })
      .toBuffer({ resolveWithObject: true });
    return {
      data,
      metadata: {
        width: info.width,
        height: info.height,
        format: "jpeg",
        originalFormat: meta.format,
        enhanced: enhance,
      },
    };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      422,
      "This image could not be decoded. Some HEIC/HEIF codecs require a libheif-enabled server. Try exporting your reference as JPG or PNG.",
    );
  }
}
export async function processUpload(
  userId: string,
  file: File,
  kind: "video" | "image",
) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = await fileTypeFromBuffer(buffer);
  assert(
    type && type.mime !== "image/svg+xml",
    "The file type could not be verified. Use a supported video or raster image.",
  );
  if (kind === "image") {
    assert(
      type.mime.startsWith("image/"),
      "Choose a real image file. Renaming a file does not convert it.",
    );
    const result = await normalizeImage(buffer);
    return saveAsset(
      userId,
      file.name.replace(/\.[^.]+$/, "") + ".jpg",
      "image",
      "image/jpeg",
      result.data,
      result.metadata,
    );
  }
  assert(
    type.mime.startsWith("video/") ||
      ["application/mxf", "application/ogg", "application/vnd.ms-asf"].includes(
        type.mime,
      ),
    "Choose a real video file. This format could not be identified.",
  );
  return tempMedia(async (dir) => {
    const input = path.join(dir, `input.${type.ext}`),
      output = path.join(dir, "normalized.mp4"),
      thumb = path.join(dir, "thumb.jpg");
    await fs.writeFile(input, buffer);
    const meta = await probe(input);
    assert(
      Number.isFinite(meta.duration) && meta.duration >= 4,
      "Your source video must be at least 4 seconds long.",
    );
    assert(
      meta.duration <= 300,
      "Choose a source video of 5 minutes or less, then trim it to 4–30 seconds.",
    );
    assert(
      meta.width * meta.height <= 4096 * 4096 &&
        meta.width / meta.height >= 0.25 &&
        meta.width / meta.height <= 4,
      "Use a video up to 4K with a standard landscape or portrait aspect ratio.",
    );
    await command(binaries().ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      input,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-vf",
      "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1",
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-threads",
      "2",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-map_metadata",
      "-1",
      "-y",
      output,
    ]);
    const normalized = await probe(output);
    await command(
      binaries().ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-ss",
        "0.2",
        "-i",
        output,
        "-frames:v",
        "1",
        "-vf",
        "scale=640:-2",
        "-q:v",
        "3",
        "-y",
        thumb,
      ],
      30_000,
    );
    const thumbnail = await saveAsset(
      userId,
      "Source preview.jpg",
      "thumbnail",
      "image/jpeg",
      await fs.readFile(thumb),
      {},
    );
    return saveAsset(
      userId,
      file.name.replace(/\.[^.]+$/, "") + ".mp4",
      "video",
      "video/mp4",
      await fs.readFile(output),
      {
        ...normalized,
        originalFormat: type.ext,
        originalSize: file.size,
        thumbnail_id: thumbnail.id,
      },
    );
  });
}
export async function trimSource(
  userId: string,
  source: AssetRow,
  start: number,
  end: number,
) {
  return tempMedia(async (dir) => {
    const input = path.join(dir, "input.mp4"),
      output = path.join(dir, "trimmed.mp4");
    await fs.writeFile(input, await assetBuffer(source));
    await command(binaries().ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-ss",
      String(start),
      "-i",
      input,
      "-t",
      String(end - start),
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "19",
      "-threads",
      "2",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      "-map_metadata",
      "-1",
      "-y",
      output,
    ]);
    return saveAsset(
      userId,
      "Prepared motion.mp4",
      "video",
      "video/mp4",
      await fs.readFile(output),
      await probe(output),
    );
  });
}
export async function exportVideo(
  userId: string,
  generated: Buffer,
  source: AssetRow,
  input: {
    trim_start: number;
    trim_end: number;
    aspect: Aspect;
    audio: "preserve" | "mute";
  },
  projectName: string,
) {
  return tempMedia(async (dir) => {
    const video = path.join(dir, "generated.mp4"),
      original = path.join(dir, "source.mp4"),
      output = path.join(dir, "output.mp4");
    await fs.writeFile(video, generated);
    await fs.writeFile(original, await assetBuffer(source));
    const meta = await probe(video);
    const src = JSON.parse(source.metadata);
    const duration = input.trim_end - input.trim_start;
    assert(
      Math.abs(meta.duration - duration) <= Math.max(1, duration * 0.1),
      "The provider output duration did not match your clip. Your credits will be returned.",
      422,
    );
    const dimensions = outputDimensions(src.width, src.height, input.aspect);
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-i",
      video,
    ];
    if (input.audio === "preserve" && src.audio)
      args.push("-ss", String(input.trim_start), "-i", original);
    args.push("-map", "0:v:0");
    if (input.audio === "preserve" && src.audio)
      args.push("-map", "1:a:0?", "-c:a", "aac", "-b:a", "192k");
    else args.push("-an");
    args.push(
      "-t",
      String(duration),
      "-vf",
      fitFilter(dimensions.width, dimensions.height),
      "-c:v",
      "libx264",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "medium",
      "-crf",
      "19",
      "-threads",
      "2",
      "-movflags",
      "+faststart",
      "-map_metadata",
      "-1",
      "-metadata",
      "comment=AI-generated with MODIFY AI. Synthetic media.",
      "-metadata",
      "title=" + projectName,
      "-y",
      output,
    );
    await command(binaries().ffmpeg, args);
    const verified = await probe(output);
    assert(
      verified.codec === "h264" &&
        verified.width === dimensions.width &&
        verified.height === dimensions.height &&
        (!verified.audio || verified.audioCodec === "aac"),
      "Export validation failed. Your credits will be returned.",
      422,
    );
    return saveAsset(
      userId,
      `${projectName}.mp4`,
      "output",
      "video/mp4",
      await fs.readFile(output),
      {
        ...verified,
        ai_generated: true,
        provenance:
          "AI-generated with MODIFY AI; not cryptographic C2PA provenance.",
      } as Asset["metadata"],
    );
  });
}
