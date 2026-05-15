const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function readEnv() {
  const environment = process.env.NODE_ENV || "development";

  return {
    environment,
    port: Number(process.env.PORT || 8605),
    corsOrigin: process.env.CORS_ORIGIN || "*",
    redis: {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      socketTtlSeconds: 30 * 24 * 60 * 60,
      locationTtlSeconds: 300,
      pubSubChannel: "bechill:events",
    },
    admin: {
      monitorEnabled: process.env.ADMIN_MONITOR === "true",
      jwtSecret: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || "",
    },
    user: {
      jwtSecret: process.env.JWT_SECRET || "",
    },
    security: {
      requireJwtSecretOnStaging:
        process.env.REQUIRE_JWT_SECRET_ON_STAGING !== "false",
    },
  };
}

module.exports = { readEnv };
