const axios = require("axios");
const Redis = require("ioredis");
const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function preflight(serviceUrl, redis) {
  try {
    const health = await axios.get(`${serviceUrl}/health`, { timeout: 5000 });
    if (health.status !== 200 || health.data?.status !== "OK") {
      throw new Error(`/health status=${health.status}`);
    }
  } catch (error) {
    throw new Error(`preflight /health failed: ${error.message}`);
  }

  try {
    const metrics = await axios.get(`${serviceUrl}/metrics`, { timeout: 5000 });
    if (metrics.status !== 200) {
      throw new Error(`/metrics status=${metrics.status}`);
    }
  } catch (error) {
    throw new Error(`preflight /metrics failed: ${error.message}`);
  }

  try {
    const pong = await redis.ping();
    if (pong !== "PONG") {
      throw new Error(`redis ping got ${pong}`);
    }
  } catch (error) {
    throw new Error(`preflight redis failed: ${error.message}`);
  }
}

async function main() {
  const serviceUrl = process.env.SERVICE_URL || "http://localhost:8605";
  const durationSeconds = Number(process.env.SOAK_DURATION_SECONDS || 300);
  const intervalMs = Number(process.env.SOAK_INTERVAL_MS || 2000);
  const redisChannel = process.env.REDIS_CHANNEL || "bechill:events";

  const redis = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  });

  const start = Date.now();
  const failures = [];
  let loops = 0;

  await preflight(serviceUrl, redis);

  while ((Date.now() - start) / 1000 < durationSeconds) {
    loops += 1;

    try {
      const health = await axios.get(`${serviceUrl}/health`, { timeout: 5000 });
      if (health.status !== 200 || health.data?.status !== "OK") {
        failures.push({ type: "health", loop: loops, status: health.status });
      }
    } catch (error) {
      failures.push({
        type: "health",
        loop: loops,
        error: error?.message || String(error),
      });
    }

    try {
      await axios.get(`${serviceUrl}/metrics`, { timeout: 5000 });
    } catch (error) {
      failures.push({
        type: "metrics",
        loop: loops,
        error: error?.message || String(error),
      });
    }

    try {
      const tripEvent = {
        type: "trip",
        target: `soak-${loops % 10}`,
        eventName: "soak:heartbeat",
        payload: {
          iteration: loops,
          ts: Date.now(),
        },
      };
      await redis.publish(redisChannel, JSON.stringify(tripEvent));
    } catch (error) {
      failures.push({
        type: "redis_publish",
        loop: loops,
        error: error?.message || String(error),
      });
    }

    await sleep(intervalMs);
  }

  await redis.quit();

  if (failures.length > 0) {
    console.error(
      "Soak test detected failures:",
      JSON.stringify(failures, null, 2),
    );
    process.exit(1);
  }

  console.log(
    `Soak test passed: loops=${loops}, durationSeconds=${durationSeconds}, intervalMs=${intervalMs}`,
  );
}

main().catch((error) => {
  console.error("Soak test failed:", error?.message || error);
  process.exit(1);
});
