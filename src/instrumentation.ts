export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { startEmbeddedWorker } = await import("@/lib/server/embedded-worker");
  startEmbeddedWorker();
}
