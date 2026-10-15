import { heartbeat, runOne } from "../src/lib/server/worker";
import { initDb } from "../src/lib/db";
import { id } from "../src/lib/server/security";
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});
await initDb();
console.log("MODIFY AI media worker started. Real provider processing only.");
const timer = setInterval(() => heartbeat().catch(console.error), 20_000);
await heartbeat();
const concurrency = Math.max(
  1,
  Math.min(4, Number(process.env.WORKER_CONCURRENCY || 2)),
);
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    const workerId = id();
    while (!stopping) {
      try {
        if (!(await runOne(workerId)))
          await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        console.error("Worker error:", e instanceof Error ? e.message : e);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }),
);
clearInterval(timer);
console.log("Worker stopped cleanly.");
process.exit(0);
