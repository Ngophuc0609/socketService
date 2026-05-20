function optionalRequire(packageName) {
  try {
    return require(packageName);
  } catch (error) {
    if (
      error?.code === "MODULE_NOT_FOUND" &&
      String(error.message || "").includes(packageName)
    ) {
      return null;
    }
    throw error;
  }
}

function hasSqlConfig(config) {
  return Boolean(
    config?.url ||
      (config?.driver &&
        config?.host &&
        config?.database &&
        config?.username),
  );
}

function sanitizeConfig(config) {
  return {
    driver: config.driver || null,
    host: config.host || null,
    port: config.port || null,
    database: config.database || null,
    urlConfigured: Boolean(config.url),
  };
}

async function connectMysql(config) {
  const mysql = optionalRequire("mysql2/promise");
  if (!mysql) {
    throw new Error("mysql2 package is not installed");
  }

  const connection = config.url
    ? await mysql.createConnection(config.url)
    : await mysql.createConnection({
        host: config.host,
        port: config.port || 3306,
        database: config.database,
        user: config.username,
        password: config.password,
        connectTimeout: config.connectionTimeoutMs,
      });

  await connection.ping();
  return {
    close: () => connection.end(),
  };
}

async function connectPostgres(config) {
  const pg = optionalRequire("pg");
  if (!pg) {
    throw new Error("pg package is not installed");
  }

  const client = new pg.Client(
    config.url
      ? {
          connectionString: config.url,
          connectionTimeoutMillis: config.connectionTimeoutMs,
        }
      : {
          host: config.host,
          port: config.port || 5432,
          database: config.database,
          user: config.username,
          password: config.password,
          connectionTimeoutMillis: config.connectionTimeoutMs,
        },
  );

  await client.connect();
  await client.query("SELECT 1");
  return {
    close: () => client.end(),
  };
}

async function connectMssql(config) {
  const mssql = optionalRequire("mssql");
  if (!mssql) {
    throw new Error("mssql package is not installed");
  }

  const pool = config.url
    ? await mssql.connect(config.url)
    : await new mssql.ConnectionPool({
        server: config.host,
        port: config.port || 1433,
        database: config.database,
        user: config.username,
        password: config.password,
        options: {
          encrypt: config.encrypt,
          trustServerCertificate: config.trustServerCertificate,
        },
        connectionTimeout: config.connectionTimeoutMs,
      }).connect();

  await pool.request().query("SELECT 1 AS ok");
  return {
    close: () => pool.close(),
  };
}

function defaultDriverFactories() {
  return {
    mysql: connectMysql,
    postgres: connectPostgres,
    mssql: connectMssql,
  };
}

async function createSqlDatabase({
  config,
  loggerPort,
  driverFactories = defaultDriverFactories(),
}) {
  const baseStatus = {
    available: false,
    configured: false,
    driver: config?.driver || null,
    reason: "not_checked",
    close: async () => {},
  };

  if (!config?.enabled) {
    return {
      ...baseStatus,
      reason: "disabled",
    };
  }

  if (!hasSqlConfig(config)) {
    const reason = config?.driver
      ? "missing_sql_connection_config"
      : "missing_sql_driver_or_connection_config";
    loggerPort.error(
      "SQL",
      "SQL database unavailable; running in Redis fallback mode",
      new Error(reason),
      {
        ...sanitizeConfig(config || {}),
        redisFallbackMaxTtlSeconds: 7 * 24 * 60 * 60,
      },
    );
    return {
      ...baseStatus,
      configured: false,
      reason,
    };
  }

  const factory = driverFactories[config.driver];
  if (!factory) {
    const reason = `unsupported_sql_driver:${config.driver || "unknown"}`;
    loggerPort.error(
      "SQL",
      "SQL database unavailable; running in Redis fallback mode",
      new Error(reason),
      sanitizeConfig(config),
    );
    return {
      ...baseStatus,
      configured: true,
      reason,
    };
  }

  try {
    const client = await factory(config);
    loggerPort.info("SQL", "SQL database connected", sanitizeConfig(config));
    return {
      available: true,
      configured: true,
      driver: config.driver,
      reason: "connected",
      close: client.close,
    };
  } catch (error) {
    loggerPort.error(
      "SQL",
      "SQL database unavailable; running in Redis fallback mode",
      error,
      sanitizeConfig(config),
    );
    return {
      ...baseStatus,
      configured: true,
      reason: error?.message || "connection_failed",
    };
  }
}

module.exports = {
  createSqlDatabase,
  hasSqlConfig,
};
