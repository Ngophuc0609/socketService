const fs = require("fs");
const path = require("path");
const axios = require("axios");
const Redis = require("ioredis");
const { io } = require("socket.io-client");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

function required(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function validateTokenInput(name, value) {
  if (!value || value.includes("replace-with")) {
    throw new Error(`Invalid ${name}: set a real token for staging`);
  }
}

async function preflight(serviceUrl, redis) {
  try {
    const health = await axios.get(`${serviceUrl}/health`, { timeout: 5000 });
    if (health.status !== 200) {
      throw new Error(`/health returned ${health.status}`);
    }
  } catch (error) {
    throw new Error(`Preflight service check failed: ${error.message}`);
  }

  try {
    const metrics = await axios.get(`${serviceUrl}/metrics`, { timeout: 5000 });
    if (metrics.status !== 200) {
      throw new Error(`/metrics returned ${metrics.status}`);
    }
  } catch (error) {
    throw new Error(`Preflight metrics check failed: ${error.message}`);
  }

  try {
    const pong = await redis.ping();
    if (pong !== "PONG") {
      throw new Error(`Redis ping got ${pong}`);
    }
  } catch (error) {
    throw new Error(`Preflight redis check failed: ${error.message}`);
  }
}

function waitForMatch(socket, matcher, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.offAny(listener);
      reject(new Error(`Timeout waiting for event on ${socket.nsp}`));
    }, timeoutMs);

    function listener(eventName, payload) {
      const ok = matcher(eventName, payload);
      if (!ok) return;
      clearTimeout(timer);
      socket.offAny(listener);
      resolve({ eventName, payload });
    }

    socket.onAny(listener);
  });
}

async function main() {
  const serviceUrl = required("SERVICE_URL", "http://localhost:8605");
  const redisHost = required("REDIS_HOST", "localhost");
  const redisPort = Number(required("REDIS_PORT", "6379"));
  const redisPassword = process.env.REDIS_PASSWORD || undefined;
  const redisChannel = process.env.REDIS_CHANNEL || "bechill:events";

  const driverUserId = required("CONTRACT_DRIVER_USER_ID", "driver-001");
  const customerUserId = required("CONTRACT_CUSTOMER_USER_ID", "customer-001");
  const driverToken = required("CONTRACT_DRIVER_BEARER", "test-driver-token");
  const customerToken = required(
    "CONTRACT_CUSTOMER_BEARER",
    "test-customer-token",
  );
  const timeoutMs = Number(process.env.CONTRACT_TIMEOUT_MS || 10000);

  validateTokenInput("CONTRACT_DRIVER_BEARER", driverToken);
  validateTokenInput("CONTRACT_CUSTOMER_BEARER", customerToken);

  const fixturePath = path.resolve(
    process.cwd(),
    process.env.CONTRACT_FIXTURE ||
      "document/fixtures/backend-bookingtrip-payloads.sample.json",
  );

  const cases = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error("Contract fixture must be a non-empty array");
  }

  const redis = new Redis({
    host: redisHost,
    port: redisPort,
    password: redisPassword,
  });

  await preflight(serviceUrl, redis);

  const driverSocket = io(`${serviceUrl}/drivers`, {
    transports: ["websocket"],
    extraHeaders: {
      authorization: `Bearer ${driverToken}`,
      user_id: driverUserId,
    },
  });

  const customerSocket = io(`${serviceUrl}/customers`, {
    transports: ["websocket"],
    extraHeaders: {
      authorization: `Bearer ${customerToken}`,
      user_id: customerUserId,
    },
  });

  await Promise.all([
    new Promise((resolve, reject) => {
      driverSocket.on("connect", resolve);
      driverSocket.on("connect_error", reject);
    }),
    new Promise((resolve, reject) => {
      customerSocket.on("connect", resolve);
      customerSocket.on("connect_error", reject);
    }),
  ]);

  const tripId = process.env.CONTRACT_TRIP_ID || "trip-001";
  driverSocket.emit("joinTrip", { tripId });
  customerSocket.emit("joinTrip", { tripId });

  const results = [];
  for (const item of cases) {
    const expected = item.expect || {};
    const targetSocket =
      expected.socket === "driver" ? driverSocket : customerSocket;

    const matcher = (eventName) => {
      if (expected.eventName && eventName !== expected.eventName) return false;
      if (
        expected.eventNamePrefix &&
        !String(eventName).startsWith(expected.eventNamePrefix)
      ) {
        return false;
      }
      return true;
    };

    const waitPromise = waitForMatch(targetSocket, matcher, timeoutMs);
    await redis.publish(redisChannel, JSON.stringify(item.message));
    const received = await waitPromise;

    results.push({
      name: item.name,
      receivedEvent: received.eventName,
    });
  }

  console.log("Contract test passed:", JSON.stringify(results, null, 2));

  driverSocket.disconnect();
  customerSocket.disconnect();
  await redis.quit();
}

main().catch((error) => {
  console.error("Contract test failed:", error?.message || error);
  process.exit(1);
});
