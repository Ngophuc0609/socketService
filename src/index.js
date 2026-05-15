const { createRuntime } = require("./app/createRuntime");

async function start() {
  const runtime = await createRuntime();
  await runtime.start();
}

start().catch((error) => {
  // Keep process behavior explicit for production orchestration.
  console.error("[Bootstrap] Fatal startup error:", error);
  process.exit(1);
});
