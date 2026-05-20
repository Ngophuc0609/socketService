const express = require("express");
const { createServer } = require("http");
const path = require("path");
const { Server } = require("socket.io");

const { readEnv, resolveRedisTtlPolicy } = require("../config/env");
const { createLoggerPort } = require("../infrastructure/logging/loggerPort");
const {
  createRedisClients,
} = require("../infrastructure/redis/createRedisClients");
const {
  createSqlDatabase,
} = require("../infrastructure/sql/createSqlDatabase");
const { createSafeRedisOps } = require("../infrastructure/redis/safeRedisOps");
const {
  createConnectionRegistry,
} = require("../infrastructure/realtime/connectionRegistry");
const {
  createRuntimeMetrics,
} = require("../infrastructure/monitoring/runtimeMetrics");
const {
  createLocationService,
} = require("../modules/location/locationService");
const { createAuthService } = require("../modules/auth/authService");
const { createTripRoomService } = require("../modules/trip/tripRoomService");
const {
  createSocketEmitterService,
} = require("../modules/connection/socketEmitterService");
const {
  createRedisRelayService,
} = require("../modules/relay/redisRelayService");
const { registerHttpRoutes } = require("../transports/http/registerHttpRoutes");
const {
  registerNamespaces,
} = require("../transports/socket/registerNamespaces");
const {
  registerSocketFlows,
} = require("../transports/socket/registerSocketFlows");
const {
  subscribeBackendEvents,
} = require("../transports/redis/subscribeBackendEvents");

async function createRuntime() {
  const env = readEnv();
  const loggerPort = createLoggerPort();
  const sqlDatabase = await createSqlDatabase({
    config: env.sql,
    loggerPort,
  });
  const redisConfig = resolveRedisTtlPolicy(env.redis, sqlDatabase.available);

  if (!sqlDatabase.available) {
    loggerPort.warn("SQL", "Using Redis fallback TTL policy", {
      reason: sqlDatabase.reason,
      socketTtlSeconds: redisConfig.socketTtlSeconds,
      locationTtlSeconds: redisConfig.locationTtlSeconds,
      maxFallbackTtlSeconds: redisConfig.maxFallbackTtlSeconds,
    });
  }

  if (
    env.environment === "staging" &&
    env.security.requireJwtSecretOnStaging &&
    !env.user.jwtSecret
  ) {
    throw new Error(
      "JWT_SECRET is required on staging (set JWT_SECRET or disable REQUIRE_JWT_SECRET_ON_STAGING)",
    );
  }

  const app = express();
  app.use(express.json());
  app.use("/demo", express.static(path.resolve(__dirname, "../../public")));

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigin,
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  const { commandClient, subscribeClient } = createRedisClients(redisConfig);
  const safeRedisOps = createSafeRedisOps(commandClient, loggerPort);
  const runtimeMetrics = createRuntimeMetrics();

  const registry = createConnectionRegistry();
  const authService = createAuthService({
    adminSecret: env.admin.jwtSecret,
    userSecret: env.user.jwtSecret,
  });
  const tripRoomService = createTripRoomService({
    safeRedisOps,
    socketTtlSeconds: redisConfig.socketTtlSeconds,
  });
  const locationService = createLocationService({
    safeRedisOps,
    locationTtlSeconds: redisConfig.locationTtlSeconds,
  });

  const namespaces = registerNamespaces(io, env);
  const socketEmitter = createSocketEmitterService({
    io,
    namespaces,
    registry,
    safeRedisOps,
  });
  const relayService = createRedisRelayService({
    io,
    namespaces,
    socketEmitter,
    loggerPort,
    runtimeMetrics,
  });

  registerHttpRoutes({
    app,
    registry,
    socketEmitter,
    loggerPort,
    runtimeMetrics,
    authService,
    sqlStatus: sqlDatabase,
  });
  registerSocketFlows({
    io,
    namespaces,
    registry,
    safeRedisOps,
    authService,
    loggerPort,
    socketTtlSeconds: redisConfig.socketTtlSeconds,
    tripRoomService,
    locationService,
    runtimeMetrics,
  });
  subscribeBackendEvents({
    subscribeClient,
    channel: redisConfig.pubSubChannel,
    loggerPort,
    relayService,
    runtimeMetrics,
  });

  let shuttingDown = false;
  let processHandlersInstalled = false;

  async function stop(signal = "MANUAL") {
    if (shuttingDown) return;
    shuttingDown = true;

    loggerPort.info("SHUTDOWN", "Stopping modular runtime", { signal });

    try {
      const sockets = await io.fetchSockets();
      for (const socket of sockets) {
        socket.disconnect(true);
      }
    } catch (error) {
      loggerPort.warn("SHUTDOWN", "Failed to disconnect sockets cleanly", {
        error: error?.message || error,
      });
    }

    await Promise.allSettled([
      commandClient.quit(),
      subscribeClient.quit(),
      sqlDatabase.close(),
      new Promise((resolve) => io.close(resolve)),
      new Promise((resolve) => httpServer.close(resolve)),
    ]);

    loggerPort.info("SHUTDOWN", "Modular runtime stopped", { signal });
  }

  function installProcessHandlers() {
    if (processHandlersInstalled) return;
    processHandlersInstalled = true;

    process.on("SIGINT", async () => {
      await stop("SIGINT");
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await stop("SIGTERM");
      process.exit(0);
    });

    process.on("uncaughtException", async (error) => {
      loggerPort.error("BOOT", "Uncaught exception", error);
      await stop("UNCAUGHT_EXCEPTION");
      process.exit(1);
    });

    process.on("unhandledRejection", async (reason) => {
      loggerPort.error("BOOT", "Unhandled rejection", reason);
      await stop("UNHANDLED_REJECTION");
      process.exit(1);
    });
  }

  return {
    start() {
      return new Promise((resolve) => {
        httpServer.listen(env.port, () => {
          loggerPort.info("BOOT", "Modular runtime started", {
            port: env.port,
            environment: env.environment,
          });
          installProcessHandlers();
          resolve();
        });
      });
    },
    stop,
  };
}

module.exports = { createRuntime };
