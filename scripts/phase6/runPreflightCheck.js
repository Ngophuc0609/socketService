const axios = require("axios");
const Redis = require("ioredis");
const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

function fail(message) {
  console.error(`Preflight failed: ${message}`);
  process.exit(1);
}

function readConfig() {
  const serviceUrl = process.env.SERVICE_URL || "http://localhost:8605";
  const redisHost = process.env.REDIS_HOST || "localhost";
  const redisPort = Number(process.env.REDIS_PORT || 6379);
  const redisPassword = process.env.REDIS_PASSWORD || undefined;
  const requireJwtSecret =
    process.env.REQUIRE_JWT_SECRET_ON_STAGING !== "false";
  const nodeEnv = process.env.NODE_ENV || "development";
  const jwtSecret = process.env.JWT_SECRET || "";

  return {
    serviceUrl,
    redisHost,
    redisPort,
    redisPassword,
    requireJwtSecret,
    nodeEnv,
    jwtSecret,
  };
}

async function checkHttp(config) {
  try {
    const health = await axios.get(`${config.serviceUrl}/health`, {
      timeout: 5000,
    });
    if (health.status !== 200) {
      fail(`/health returned status ${health.status}`);
    }
  } catch (error) {
    fail(`cannot reach /health at ${config.serviceUrl}: ${error.message}`);
  }

  try {
    const metrics = await axios.get(`${config.serviceUrl}/metrics`, {
      timeout: 5000,
    });
    if (metrics.status !== 200) {
      fail(`/metrics returned status ${metrics.status}`);
    }
  } catch (error) {
    fail(`cannot reach /metrics at ${config.serviceUrl}: ${error.message}`);
  }
}

async function checkRedis(config) {
  const redis = new Redis({
    host: config.redisHost,
    port: config.redisPort,
    password: config.redisPassword,
  });

  try {
    const pong = await redis.ping();
    if (pong !== "PONG") {
      fail(`redis ping expected PONG, got ${pong}`);
    }
  } catch (error) {
    fail(
      `cannot connect redis ${config.redisHost}:${config.redisPort}: ${error.message}`,
    );
  } finally {
    await redis.quit().catch(() => {});
  }
}

async function main() {
  const config = readConfig();

  if (
    config.nodeEnv === "staging" &&
    config.requireJwtSecret &&
    !config.jwtSecret
  ) {
    fail("JWT_SECRET is required on staging");
  }

  await checkHttp(config);
  await checkRedis(config);

  console.log(
    "Preflight passed:",
    JSON.stringify(
      {
        serviceUrl: config.serviceUrl,
        redis: `${config.redisHost}:${config.redisPort}`,
        nodeEnv: config.nodeEnv,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  fail(error?.message || String(error));
});
