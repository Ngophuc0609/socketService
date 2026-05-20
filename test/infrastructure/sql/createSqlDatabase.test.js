const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createSqlDatabase,
  hasSqlConfig,
} = require("../../../src/infrastructure/sql/createSqlDatabase");

function createLoggerMock() {
  return {
    infoCalls: [],
    warnCalls: [],
    errorCalls: [],
    info(...args) {
      this.infoCalls.push(args);
    },
    warn(...args) {
      this.warnCalls.push(args);
    },
    error(...args) {
      this.errorCalls.push(args);
    },
  };
}

test("hasSqlConfig accepts URL or full host config", () => {
  assert.equal(hasSqlConfig({ url: "mysql://u:p@localhost/db" }), true);
  assert.equal(
    hasSqlConfig({
      driver: "mysql",
      host: "localhost",
      database: "bechill",
      username: "user",
    }),
    true,
  );
  assert.equal(hasSqlConfig({ driver: "mysql", host: "localhost" }), false);
});

test("createSqlDatabase reports unavailable and logs when config is missing", async () => {
  const logger = createLoggerMock();

  const db = await createSqlDatabase({
    config: { enabled: true, driver: "mysql" },
    loggerPort: logger,
  });

  assert.equal(db.available, false);
  assert.equal(db.reason, "missing_sql_connection_config");
  assert.equal(logger.errorCalls.length, 1);
});

test("createSqlDatabase connects through injected driver factory", async () => {
  const logger = createLoggerMock();
  let closed = false;

  const db = await createSqlDatabase({
    config: {
      enabled: true,
      driver: "mysql",
      host: "localhost",
      database: "bechill",
      username: "user",
      password: "secret",
    },
    loggerPort: logger,
    driverFactories: {
      mysql: async () => ({
        close: async () => {
          closed = true;
        },
      }),
    },
  });

  assert.equal(db.available, true);
  assert.equal(db.reason, "connected");
  assert.equal(logger.infoCalls.length, 1);

  await db.close();
  assert.equal(closed, true);
});

