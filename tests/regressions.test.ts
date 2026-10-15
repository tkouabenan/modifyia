import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { closeDb, execSql, initDb, oneSql } from "../src/lib/db";
import { parseStudioDraft } from "../src/lib/studio-draft";
import { createJob, refundJob, cancelJob } from "../src/lib/server/jobs";
import { claimJob, heartbeat, runOne } from "../src/lib/server/worker";
import { ProviderError } from "../src/lib/providers/types";
import type { JobRow, UserRow } from "../src/lib/server/records";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  cancel: vi.fn(),
  upload: vi.fn(),
  submit: vi.fn(),
  download: vi.fn(),
}));
vi.mock("../src/lib/providers/higgsfield", () => ({
  motionProvider: () => ({
    name: "Test-only provider",
    status: mocks.status,
    cancel: mocks.cancel,
    upload: mocks.upload,
    submit: mocks.submit,
  }),
  downloadRemote: mocks.download,
}));
let dir: string, uid: string, pid: string;
const originalDatabase = process.env.DATABASE_URL,
  originalProvider = process.env.HF_CREDENTIALS;
const timestamp = () => new Date().toISOString();
const balance = async () =>
  Number(
    (await oneSql<UserRow>("SELECT credits FROM users WHERE id=?", [uid]))!
      .credits,
  );
const reserve = () => createJob(uid, pid, true);

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "modify-ai-regression-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "test.sqlite")}`;
  process.env.HF_CREDENTIALS = "test-only:not-a-real-credential";
  await initDb();
});
afterAll(async () => {
  await closeDb();
  if (originalDatabase === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabase;
  if (originalProvider === undefined) delete process.env.HF_CREDENTIALS;
  else process.env.HF_CREDENTIALS = originalProvider;
  await rm(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  vi.resetAllMocks();
  await execSql("DELETE FROM users");
  uid = randomUUID();
  pid = randomUUID();
  const source = randomUUID(),
    image = randomUUID();
  await execSql(
    "INSERT INTO users(id,name,role,credits,email_verified,created_at,updated_at) VALUES(?,?,?,100,1,?,?)",
    [uid, "Test creator", "user", timestamp(), timestamp()],
  );
  for (const [asset, kind, mime, metadata] of [
    [
      source,
      "video",
      "video/mp4",
      JSON.stringify({ duration: 10, width: 1280, height: 720, fps: 30 }),
    ],
    [image, "image", "image/jpeg", JSON.stringify({ width: 512, height: 512 })],
  ])
    await execSql(
      "INSERT INTO video_uploads(id,user_id,name,kind,mime,size,storage_key,metadata,created_at) VALUES(?,?,?,?,?,1,?,?,?)",
      [
        asset,
        uid,
        "Test reference",
        kind,
        mime,
        `${uid}/${asset}`,
        metadata,
        timestamp(),
      ],
    );
  await execSql(
    "INSERT INTO projects(id,user_id,name,source_id,character_ids,trim_start,trim_end,created_at,updated_at) VALUES(?,?,?,?,?,0,4,?,?)",
    [
      pid,
      uid,
      "Test project",
      source,
      JSON.stringify([image]),
      timestamp(),
      timestamp(),
    ],
  );
  await heartbeat();
});

describe("Browser draft validation", () => {
  it("recovers from invalid browser JSON", () =>
    expect(parseStudioDraft("{broken").name).toBe("Untitled transformation"));
  it("rejects corrupt asset identifiers and nonfinite trim settings", () =>
    expect(
      parseStudioDraft(
        JSON.stringify({ source_id: "../../private", trim_end: "NaN" }),
      ).source_id,
    ).toBeNull());
  it("retains a valid draft without introducing an invalid project id", () => {
    const draft = parseStudioDraft(
      JSON.stringify({
        id: pid,
        name: "My dance",
        trim_end: 4,
        aspect: "9:16",
      }),
    );
    expect(draft).toMatchObject({
      id: pid,
      name: "My dance",
      trim_end: 4,
      aspect: "9:16",
    });
  });
});
describe("Atomic generation accounting", () => {
  it("reserves credits exactly once for concurrent requests on one project", async () => {
    const results = await Promise.allSettled([reserve(), reserve()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balance()).toBe(80);
    expect(
      (await oneSql<{ total: number }>(
        "SELECT COUNT(*) AS total FROM generation_jobs",
      ))!.total,
    ).toBe(1);
  });
  it("refunds a failed job only once", async () => {
    const job = await reserve();
    await Promise.all([
      refundJob(job.id, "failed", "Failure"),
      refundJob(job.id, "failed", "Duplicate"),
    ]);
    expect(await balance()).toBe(100);
    expect(
      (await oneSql<{ total: number }>(
        "SELECT COUNT(*) AS total FROM credit_transactions WHERE reference_id=?",
        [`refund:${job.id}`],
      ))!.total,
    ).toBe(1);
  });
  it("does not let a stale worker refund a job owned by another worker", async () => {
    const job = await reserve();
    await execSql("UPDATE generation_jobs SET lease_owner=? WHERE id=?", [
      "new-worker",
      job.id,
    ]);
    expect(
      await refundJob(job.id, "failed", "Old worker failure", "old-worker"),
    ).toBe(false);
    expect(await balance()).toBe(80);
  });
  it("does not refund completed work", async () => {
    const job = await reserve();
    await execSql("UPDATE generation_jobs SET status='completed' WHERE id=?", [
      job.id,
    ]);
    expect(await refundJob(job.id, "failed", "Late failure")).toBe(false);
    expect(await balance()).toBe(80);
  });
  it("rejects insufficient balances without creating a job", async () => {
    await execSql("UPDATE users SET credits=2 WHERE id=?", [uid]);
    await expect(reserve()).rejects.toMatchObject({ status: 402 });
    expect(await balance()).toBe(2);
    expect(
      await oneSql("SELECT id FROM generation_jobs WHERE project_id=?", [pid]),
    ).toBeNull();
  });
  it("requires rights confirmation before charging credits", async () => {
    await expect(createJob(uid, pid, false)).rejects.toMatchObject({
      status: 400,
    });
    expect(await balance()).toBe(100);
  });
  it("does not charge credits when the cloud provider is unconfigured", async () => {
    const credentials = process.env.HF_CREDENTIALS;
    const previous = process.env.MOTION_PROVIDER;
    process.env.MOTION_PROVIDER = "higgsfield";
    delete process.env.HF_CREDENTIALS;
    try {
      await expect(reserve()).rejects.toMatchObject({ status: 503 });
      expect(await balance()).toBe(100);
    } finally {
      if (previous === undefined) delete process.env.MOTION_PROVIDER;
      else process.env.MOTION_PROVIDER = previous;
      process.env.HF_CREDENTIALS = credentials;
    }
  });
  it("blocks suspended accounts", async () => {
    await execSql("UPDATE users SET suspended=1 WHERE id=?", [uid]);
    await expect(reserve()).rejects.toMatchObject({ status: 403 });
    expect(await balance()).toBe(100);
  });
  it("isolates project ownership", async () => {
    await expect(createJob(randomUUID(), pid, true)).rejects.toMatchObject({
      status: 404,
    });
    expect(await balance()).toBe(100);
  });
});
describe("Durable worker claims and recovery", () => {
  it("does not allow two workers to claim the same active job", async () => {
    await reserve();
    const claims = await Promise.all([claimJob("one"), claimJob("two")]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
  it("returns provider-queued jobs to the queue and permits cancellation between polls", async () => {
    const job = await reserve();
    await execSql(
      "UPDATE generation_jobs SET provider_request_id=?,provider_status_url=?,provider_cancel_url=? WHERE id=?",
      [
        "request-1",
        "https://api.higgsfield.ai/requests/request-1/status",
        "https://api.higgsfield.ai/requests/request-1/cancel",
        job.id,
      ],
    );
    mocks.status.mockResolvedValue({
      request_id: "request-1",
      status: "queued",
    });
    mocks.cancel.mockResolvedValue(undefined);
    await runOne("worker");
    const waiting = await oneSql<JobRow>(
      "SELECT * FROM generation_jobs WHERE id=?",
      [job.id],
    );
    expect(waiting).toMatchObject({ status: "queued", lease_owner: null });
    expect(Date.parse(waiting!.lease_until!)).toBeGreaterThan(Date.now());
    await cancelJob(uid, job.id);
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(await balance()).toBe(100);
  });
  it("retains the reservation during a transient polling failure", async () => {
    const job = await reserve();
    await execSql(
      "UPDATE generation_jobs SET provider_request_id=?,provider_status_url=? WHERE id=?",
      [
        "request-2",
        "https://api.higgsfield.ai/requests/request-2/status",
        job.id,
      ],
    );
    mocks.status.mockRejectedValue(
      new ProviderError("Network interrupted", true),
    );
    await runOne("worker");
    const pending = await oneSql<JobRow>(
      "SELECT * FROM generation_jobs WHERE id=?",
      [job.id],
    );
    expect(pending?.lease_owner).toBeNull();
    expect(pending?.refunded_at).toBeNull();
    expect(await balance()).toBe(80);
    expect(Date.parse(pending!.lease_until!)).toBeGreaterThan(Date.now());
  });
  it("enforces the processing deadline even before provider submission", async () => {
    const job = await reserve();
    await execSql("UPDATE generation_jobs SET started_at=? WHERE id=?", [
      new Date(Date.now() - 60 * 60_000).toISOString(),
      job.id,
    ]);
    await runOne("worker");
    expect(
      (
        await oneSql<JobRow>("SELECT status FROM generation_jobs WHERE id=?", [
          job.id,
        ])
      )?.status,
    ).toBe("failed");
    expect(await balance()).toBe(100);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
