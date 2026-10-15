import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { binaries, command, probe, tempMedia } from "./media";

async function listFrames(dir: string, prefix: string) {
  const names = (await fs.readdir(dir))
    .filter((name) => name.startsWith(prefix) && name.endsWith(".png"))
    .sort();
  if (!names.length) throw new Error("No video frames could be extracted.");
  return names.map((name) => path.join(dir, name));
}

async function luma(file: string) {
  const { data, info } = await sharp(file)
    .resize(64, 36, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function motionCentroid(
  prev: Buffer,
  next: Buffer,
  width: number,
  height: number,
) {
  let sumX = 0,
    sumY = 0,
    weight = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const d = Math.abs(next[i] - prev[i]);
      if (d < 18) continue;
      const w = d * d;
      sumX += x * w;
      sumY += y * w;
      weight += w;
    }
  }
  if (weight < 80) return { x: 0.5, y: 0.42, energy: 0 };
  return {
    x: sumX / weight / Math.max(1, width - 1),
    y: sumY / weight / Math.max(1, height - 1),
    energy: weight,
  };
}

async function characterSprite(buffer: Buffer, targetHeight: number) {
  const image = sharp(buffer, { animated: false, failOn: "error" }).rotate();
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const sample = (x: number, y: number) => {
    const i = (Math.min(height - 1, Math.max(0, y)) * width +
      Math.min(width - 1, Math.max(0, x))) *
      4;
    return [data[i], data[i + 1], data[i + 2]] as const;
  };
  const corners = [
    sample(2, 2),
    sample(width - 3, 2),
    sample(2, height - 3),
    sample(width - 3, height - 3),
  ];
  const avg = [0, 1, 2].map((c) =>
    Math.round(corners.reduce((s, px) => s + px[c], 0) / corners.length),
  );
  const similar = corners.every(
    (px) =>
      Math.abs(px[0] - avg[0]) +
        Math.abs(px[1] - avg[1]) +
        Math.abs(px[2] - avg[2]) <
      90,
  );
  if (similar) {
    const keyed = Buffer.from(data);
    let visible = 0;
    for (let i = 0; i < keyed.length; i += 4) {
      const dist =
        Math.abs(keyed[i] - avg[0]) +
        Math.abs(keyed[i + 1] - avg[1]) +
        Math.abs(keyed[i + 2] - avg[2]);
      if (dist < 72) keyed[i + 3] = 0;
      else if (dist < 110) keyed[i + 3] = Math.round(keyed[i + 3] * 0.35);
      if (keyed[i + 3] > 24) visible++;
    }
    if (visible > (width * height) / 8) keyed.copy(data);
  }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .resize({
      height: Math.max(64, Math.round(targetHeight)),
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
}

export async function renderLocalMotionTransfer(
  video: Buffer,
  character: Buffer,
) {
  return tempMedia(async (dir) => {
    const sourcePath = path.join(dir, "source.mp4");
    const outputPath = path.join(dir, "local-output.mp4");
    const framesDir = path.join(dir, "in");
    const outDir = path.join(dir, "out");
    await fs.mkdir(framesDir);
    await fs.mkdir(outDir);
    await fs.writeFile(sourcePath, video);
    const meta = await probe(sourcePath);
    const fps = Math.min(15, Math.max(8, Math.round(meta.fps || 15)));
    await command(binaries().ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      sourcePath,
      "-vf",
      `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
      "-y",
      path.join(framesDir, "f_%04d.png"),
    ]);
    const frames = await listFrames(framesDir, "f_");
    const first = await sharp(frames[0]).metadata();
    const width = first.width || meta.width;
    const height = first.height || meta.height;
    const sprite = await characterSprite(character, height * 0.72);
    const tracks: { x: number; y: number }[] = [];
    let previous: { data: Buffer; width: number; height: number } | null = null;
    for (const frame of frames) {
      const current = await luma(frame);
      if (!previous) tracks.push({ x: 0.5, y: 0.42 });
      else {
        const motion = motionCentroid(
          previous.data,
          current.data,
          current.width,
          current.height,
        );
        const last = tracks[tracks.length - 1];
        tracks.push({
          x: last.x * 0.72 + motion.x * 0.28,
          y: last.y * 0.72 + motion.y * 0.28,
        });
      }
      previous = current;
    }
    for (let i = 0; i < frames.length; i++) {
      const left = Math.round(
        tracks[i].x * width - sprite.info.width / 2,
      );
      const top = Math.round(
        tracks[i].y * height - sprite.info.height * 0.62,
      );
      await sharp(frames[i])
        .composite([
          {
            input: sprite.data,
            left: Math.min(width - sprite.info.width, Math.max(0, left)),
            top: Math.min(height - sprite.info.height, Math.max(0, top)),
          },
        ])
        .png({ compressionLevel: 1 })
        .toFile(path.join(outDir, `o_${String(i + 1).padStart(4, "0")}.png`));
    }
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-framerate",
      String(fps),
      "-i",
      path.join(outDir, "o_%04d.png"),
      "-i",
      sourcePath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0?",
      "-t",
      String(meta.duration),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
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
      "-shortest",
      "-movflags",
      "+faststart",
      "-map_metadata",
      "-1",
      "-y",
      outputPath,
    ];
    await command(binaries().ffmpeg, args, 300_000);
    const verified = await probe(outputPath);
    if (!verified.duration || verified.duration < 1)
      throw new Error("Local motion transfer produced an empty video.");
    return fs.readFile(outputPath);
  });
}
