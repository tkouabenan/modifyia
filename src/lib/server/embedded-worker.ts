import { heartbeat, runOne } from "./worker";
import { id } from "./security";

const globalKey = "__modifyAiEmbeddedWorker";

export function startEmbeddedWorker() {
  const runtime = globalThis as typeof globalThis & {
    [globalKey]?: boolean;
  };
  if (runtime[globalKey] || process.env.EMBED_WORKER === "false") return;
  runtime[globalKey] = true;
  const workerId = `embedded:${id()}`;
  const tick = async () => {
    try {
      await heartbeat();
      await runOne(workerId);
    } catch (e) {
      console.error(
        "Embedded worker:",
        e instanceof Error ? e.message : "unknown error",
      );
    } finally {
      setTimeout(() => void tick(), 1500);
    }
  };
  void heartbeat().finally(() => void tick());
}
