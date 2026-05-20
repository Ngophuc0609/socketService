const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const ONE_DAY_SECONDS = 24 * 60 * 60;
const MAX_REDIS_FALLBACK_TTL_SECONDS = 7 * ONE_DAY_SECONDS;

function readPositiveNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function readBoolean(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true";
}

function normalizeSqlDriver(value) {
  const driver = String(value || "").trim().toLowerCase();
  if (driver === "postgresql") return "postgres";
  if (driver === "sqlserver") return "mssql";
  return driver;
}

function inferSqlDriverFromUrl(url) {
  const value = String(url || "").toLowerCase();
  if (value.startsWith("postgres://") || value.startsWith("postgresql://")) {
    return "postgres";
  }
  if (value.startsWith("mysql://") || value.startsWith("mysql2://")) {
    return "mysql";
  }
  if (value.startsWith("mssql://") || value.startsWith("sqlserver://")) {
    return "mssql";
  }
  return "";
}

function resolveRedisTtlPolicy(redisConfig, sqlAvailable) {
  if (sqlAvailable) return { ...redisConfig };

  const fallbackMax = Math.min(
    redisConfig.maxFallbackTtlSeconds || MAX_REDIS_FALLBACK_TTL_SECONDS,
    MAX_REDIS_FALLBACK_TTL_SECONDS,
  );

  return {
    ...redisConfig,
    socketTtlSeconds: Math.min(redisConfig.socketTtlSeconds, fallbackMax),
    locationTtlSeconds: Math.min(redisConfig.locationTtlSeconds, fallbackMax),
  };
}

function readEnv() {
  const environment = process.env.NODE_ENV || "development";
  const sqlUrl = process.env.SQL_URL || process.env.DATABASE_URL || "";
  const sqlDriver = normalizeSqlDriver(
    process.env.SQL_DRIVER ||
      process.env.DB_CLIENT ||
      inferSqlDriverFromUrl(sqlUrl),
  );

  return {
    environment,
    port: Number(process.env.PORT || 8605),
    corsOrigin: process.env.CORS_ORIGIN || "*",
    redis: {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      socketTtlSeconds: readPositiveNumber(
        "REDIS_SOCKET_TTL_SECONDS",
        30 * ONE_DAY_SECONDS,
      ),
      locationTtlSeconds: readPositiveNumber(
        "REDIS_LOCATION_TTL_SECONDS",
        300,
      ),
      maxFallbackTtlSeconds: Math.min(
        readPositiveNumber(
          "REDIS_MAX_FALLBACK_TTL_SECONDS",
          MAX_REDIS_FALLBACK_TTL_SECONDS,
        ),
        MAX_REDIS_FALLBACK_TTL_SECONDS,
      ),
      pubSubChannel: process.env.REDIS_CHANNEL || "bechill:events",
    },
    sql: {
      enabled: process.env.SQL_ENABLED !== "false",
      driver: sqlDriver,
      url: sqlUrl,
      host: process.env.SQL_HOST || process.env.DB_HOST || "",
      port: process.env.SQL_PORT ? Number(process.env.SQL_PORT) : undefined,
      database:
        process.env.SQL_DATABASE ||
        process.env.DB_DATABASE ||
        process.env.DB_NAME ||
        "",
      username: process.env.SQL_USER || process.env.DB_USER || "",
      password: process.env.SQL_PASSWORD || process.env.DB_PASSWORD || "",
      encrypt: readBoolean("SQL_ENCRYPT", false),
      trustServerCertificate: readBoolean(
        "SQL_TRUST_SERVER_CERTIFICATE",
        true,
      ),
      connectionTimeoutMs: readPositiveNumber(
        "SQL_CONNECTION_TIMEOUT_MS",
        5000,
      ),
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

module.exports = {
  MAX_REDIS_FALLBACK_TTL_SECONDS,
  readEnv,
  resolveRedisTtlPolicy,
};
