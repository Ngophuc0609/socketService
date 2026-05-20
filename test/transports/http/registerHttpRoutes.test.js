const test = require("node:test");

test("POST /emit/user requires secret or JWT", async () => {
  const app = createAppMock();
  let called = false;
  const mockAuthService = {
    userSecret: "testsecret",
    parseBearer: (h) => (h === "Bearer validtoken" ? "validtoken" : null),
    verifyUserToken: (token) =>
      token === "validtoken"
        ? { valid: true, reason: "ok" }
        : { valid: false, reason: "invalid_token" },
  };
  registerHttpRoutes({
    app,
    registry: { counters: () => ({}) },
    socketEmitter: {
      async emitToUser() {
        called = true;
        return { emitted: true, socketIds: ["s1"] };
      },
    },
    loggerPort: createLoggerMock(),
    runtimeMetrics: {
      recordHttpRequest() {},
      snapshot() {
        return {};
      },
    },
    authService: mockAuthService,
  });
  const handler = app.routes.post.get("/emit/user");
  // No secret
  let res = createResMock();
  await handler(
    {
      body: { userType: "driver", userId: "d1", eventName: "evt", payload: {} },
    },
    res,
  );
  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /Unauthorized/);
  // Invalid secret
  res = createResMock();
  await handler(
    {
      headers: { "x-api-key": "bad" },
      body: { userType: "driver", userId: "d1", eventName: "evt", payload: {} },
    },
    res,
  );
  assert.equal(res.statusCode, 401);
  // Valid secret
  res = createResMock();
  await handler(
    {
      headers: { "x-api-key": "testsecret" },
      body: { userType: "driver", userId: "d1", eventName: "evt", payload: {} },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  // Valid JWT
  res = createResMock();
  await handler(
    {
      headers: { authorization: "Bearer validtoken" },
      body: { userType: "driver", userId: "d1", eventName: "evt", payload: {} },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(called, true);
});

test("POST /emit/trip requires secret or JWT", async () => {
  const app = createAppMock();
  let called = false;
  const mockAuthService = {
    userSecret: "testsecret",
    parseBearer: (h) => (h === "Bearer validtoken" ? "validtoken" : null),
    verifyUserToken: (token) =>
      token === "validtoken"
        ? { valid: true, reason: "ok" }
        : { valid: false, reason: "invalid_token" },
  };
  registerHttpRoutes({
    app,
    registry: { counters: () => ({}) },
    socketEmitter: {
      async emitToTrip() {
        called = true;
        return { emitted: true, room: "trip_1" };
      },
    },
    loggerPort: createLoggerMock(),
    runtimeMetrics: {
      recordHttpRequest() {},
      snapshot() {
        return {};
      },
    },
    authService: mockAuthService,
  });
  const handler = app.routes.post.get("/emit/trip");
  // No secret
  let res = createResMock();
  await handler({ body: { tripId: "t1", eventName: "evt", payload: {} } }, res);
  assert.equal(res.statusCode, 401);
  // Valid secret
  res = createResMock();
  await handler(
    {
      headers: { "x-api-key": "testsecret" },
      body: { tripId: "t1", eventName: "evt", payload: {} },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  // Valid JWT
  res = createResMock();
  await handler(
    {
      headers: { authorization: "Bearer validtoken" },
      body: { tripId: "t1", eventName: "evt", payload: {} },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(called, true);
});

test("POST /emit/broadcast requires secret or JWT", async () => {
  const app = createAppMock();
  let called = false;
  const mockAuthService = {
    userSecret: "testsecret",
    parseBearer: (h) => (h === "Bearer validtoken" ? "validtoken" : null),
    verifyUserToken: (token) =>
      token === "validtoken"
        ? { valid: true, reason: "ok" }
        : { valid: false, reason: "invalid_token" },
  };
  registerHttpRoutes({
    app,
    registry: { counters: () => ({}) },
    socketEmitter: {
      async emitBroadcast() {
        called = true;
        return { emitted: true };
      },
    },
    loggerPort: createLoggerMock(),
    runtimeMetrics: {
      recordHttpRequest() {},
      snapshot() {
        return {};
      },
    },
    authService: mockAuthService,
  });
  const handler = app.routes.post.get("/emit/broadcast");
  // No secret
  let res = createResMock();
  await handler({ body: { eventName: "evt", payload: {} } }, res);
  assert.equal(res.statusCode, 401);
  // Valid secret
  res = createResMock();
  await handler(
    {
      headers: { "x-api-key": "testsecret" },
      body: { eventName: "evt", payload: {} },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  // Valid JWT
  res = createResMock();
  await handler(
    {
      headers: { authorization: "Bearer validtoken" },
      body: { eventName: "evt", payload: {} },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(called, true);
});

const assert = require("node:assert/strict");

const {
  registerHttpRoutes,
} = require("../../../src/transports/http/registerHttpRoutes");

function createAppMock() {
  return {
    routes: {
      get: new Map(),
      post: new Map(),
    },
    get(path, handler) {
      this.routes.get.set(path, handler);
    },
    post(path, ...handlers) {
      const composed = async (req, res) => {
        let index = 0;
        const next = async (err) => {
          if (err) throw err;
          const handler = handlers[index++];
          if (!handler) return;
          if (handler.length === 3) {
            return handler(req, res, next);
          }
          return handler(req, res);
        };
        await next();
      };
      this.routes.post.set(path, composed);
    },
  };
}

function createResMock() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createLoggerMock() {
  return {
    infoCalls: [],
    errorCalls: [],
    info(...args) {
      this.infoCalls.push(args);
    },
    error(...args) {
      this.errorCalls.push(args);
    },
  };
}

test("GET /health returns counters", () => {
  const app = createAppMock();
  const registry = {
    counters() {
      return { drivers: 1, customers: 2, default: 3 };
    },
  };

  const runtimeMetrics = {
    snapshot() {
      return { totals: { httpRequests: 0 } };
    },
    recordHttpRequest() {},
  };

  registerHttpRoutes({
    app,
    registry,
    socketEmitter: {},
    loggerPort: createLoggerMock(),
    runtimeMetrics,
  });

  const handler = app.routes.get.get("/health");
  const res = createResMock();
  handler({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, "OK");
  assert.deepEqual(res.body.connections, {
    drivers: 1,
    customers: 2,
    default: 3,
  });
});

test("GET /metrics returns prometheus output", () => {
  const app = createAppMock();
  const runtimeMetrics = {
    toPrometheus() {
      return "socket_events_total 1\n";
    },
    recordHttpRequest() {},
    snapshot() {
      return { totals: {} };
    },
  };

  registerHttpRoutes({
    app,
    registry: { counters: () => ({}) },
    socketEmitter: {},
    loggerPort: createLoggerMock(),
    runtimeMetrics,
  });

  const handler = app.routes.get.get("/metrics");
  const res = createResMock();
  handler({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "text/plain; version=0.0.4");
  assert.equal(res.body, "socket_events_total 1\n");
});

test("GET /dashboard returns html page", () => {
  const app = createAppMock();
  const runtimeMetrics = {
    toPrometheus() {
      return "socket_events_total 1\n";
    },
    recordHttpRequest() {},
    snapshot() {
      return {
        startedAt: "2026-05-15T00:00:00.000Z",
        totals: { httpRequests: 10, httpErrors: 1 },
        byHttpRoute: {
          "/health": { total: 5, errors: 0 },
        },
      };
    },
  };

  registerHttpRoutes({
    app,
    registry: {
      counters: () => ({ drivers: 1, customers: 2, admin: 0, legacy: 3 }),
    },
    socketEmitter: {},
    loggerPort: createLoggerMock(),
    runtimeMetrics,
  });

  const handler = app.routes.get.get("/dashboard");
  const res = createResMock();
  handler({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "text/html; charset=utf-8");
  assert.match(res.body, /BeChill Realtime Metrics Dashboard/);
  assert.match(res.body, /Dashboard endpoint: \/dashboard/);
  assert.match(res.body, /namespaceFilter/);
  assert.match(res.body, /socketSparkline/);
  assert.match(res.body, /alertBanner/);
});

test("POST /driver/event validates required fields", async () => {
  const app = createAppMock();
  registerHttpRoutes({
    app,
    registry: { counters: () => ({}) },
    socketEmitter: {
      async emitToDriver() {
        return { emitted: false, socketIds: [] };
      },
    },
    loggerPort: createLoggerMock(),
  });

  const handler = app.routes.post.get("/driver/event");

  const resMissingHeader = createResMock();
  await handler({ headers: {}, body: {} }, resMissingHeader);
  assert.equal(resMissingHeader.statusCode, 400);
  assert.equal(resMissingHeader.body.error, "user_id invalid");

  const resMissingTrip = createResMock();
  await handler(
    { headers: { user_id: "u1" }, body: { socket_event: "evt" } },
    resMissingTrip,
  );
  assert.equal(resMissingTrip.statusCode, 400);
  assert.equal(resMissingTrip.body.error, "trip_id invalid");
});

test("POST /driver/event emits successfully", async () => {
  const app = createAppMock();
  const logger = createLoggerMock();

  registerHttpRoutes({
    app,
    registry: { counters: () => ({}) },
    socketEmitter: {
      async emitToDriver(userId, event, payload) {
        assert.equal(userId, "d1");
        assert.equal(event, "bookingTrip:Started");
        assert.equal(payload, "trip-1");
        return { emitted: true, socketIds: ["s1"] };
      },
    },
    loggerPort: logger,
  });

  const handler = app.routes.post.get("/driver/event");
  const res = createResMock();

  await handler(
    {
      headers: { user_id: "d1" },
      body: { trip_id: "trip-1", socket_event: "bookingTrip:Started" },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, {
    userId: "d1",
    tripId: "trip-1",
    socketEvent: "bookingTrip:Started",
  });
  assert.equal(logger.infoCalls.length, 1);
});

test("POST /emit/user validates and emits", async () => {
  const app = createAppMock();
  const authService = {
    userSecret: "testsecret",
    parseBearer: (h) => (h === "Bearer validtoken" ? "validtoken" : null),
    verifyUserToken: (token) =>
      token === "validtoken"
        ? { valid: true, reason: "ok" }
        : { valid: false, reason: "invalid_token" },
  };

  registerHttpRoutes({
    app,
    registry: { counters: () => ({}) },
    socketEmitter: {
      async emitToUser(userType, userId, eventName, payload) {
        assert.equal(userType, "driver");
        assert.equal(userId, "driver-1");
        assert.equal(eventName, "bookingTrip:Started");
        assert.equal(payload.tripId, "trip-1");
        return { emitted: true, socketIds: ["s1", "s2"] };
      },
    },
    loggerPort: createLoggerMock(),
    runtimeMetrics: {
      recordHttpRequest() {},
      snapshot() {
        return {};
      },
    },
    authService,
  });

  const handler = app.routes.post.get("/emit/user");
  const res = createResMock();

  await handler(
    {
      headers: { "x-api-key": "testsecret" },
      body: {
        userType: "driver",
        userId: "driver-1",
        eventName: "bookingTrip:Started",
        payload: { tripId: "trip-1" },
      },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.socketCount, 2);
});

test("POST /emit/trip validates and emits", async () => {
  const app = createAppMock();
  const authService = {
    userSecret: "testsecret",
    parseBearer: (h) => (h === "Bearer validtoken" ? "validtoken" : null),
    verifyUserToken: (token) =>
      token === "validtoken"
        ? { valid: true, reason: "ok" }
        : { valid: false, reason: "invalid_token" },
  };

  registerHttpRoutes({
    app,
    registry: { counters: () => ({}) },
    socketEmitter: {
      async emitToTrip(tripId, eventName, payload) {
        assert.equal(tripId, "trip-2");
        assert.equal(eventName, "bookingTrip:ToPickUp");
        assert.equal(payload.status, "to_pick_up");
        return { emitted: true, room: "trip_trip-2" };
      },
    },
    loggerPort: createLoggerMock(),
    runtimeMetrics: {
      recordHttpRequest() {},
      snapshot() {
        return {};
      },
    },
    authService,
  });

  const handler = app.routes.post.get("/emit/trip");
  const res = createResMock();

  await handler(
    {
      headers: { "x-api-key": "testsecret" },
      body: {
        tripId: "trip-2",
        eventName: "bookingTrip:ToPickUp",
        payload: { status: "to_pick_up" },
      },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.room, "trip_trip-2");
});

test("POST /emit/broadcast validates and emits", async () => {
  const app = createAppMock();
  const authService = {
    userSecret: "testsecret",
    parseBearer: (h) => (h === "Bearer validtoken" ? "validtoken" : null),
    verifyUserToken: (token) =>
      token === "validtoken"
        ? { valid: true, reason: "ok" }
        : { valid: false, reason: "invalid_token" },
  };

  registerHttpRoutes({
    app,
    registry: { counters: () => ({}) },
    socketEmitter: {
      async emitBroadcast(eventName, payload, options) {
        assert.equal(eventName, "system:notice");
        assert.equal(payload.message, "maintenance");
        assert.equal(options.userType, "customer");
        assert.equal(options.targetRoom, "trip_trip-9");
        return { emitted: true };
      },
    },
    loggerPort: createLoggerMock(),
    runtimeMetrics: {
      recordHttpRequest() {},
      snapshot() {
        return {};
      },
    },
    authService,
  });

  const handler = app.routes.post.get("/emit/broadcast");
  const res = createResMock();

  await handler(
    {
      headers: { "x-api-key": "testsecret" },
      body: {
        eventName: "system:notice",
        payload: { message: "maintenance" },
        userType: "customer",
        targetRoom: "trip_trip-9",
      },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.userType, "customer");
});

test("POST /customer/event returns socketCount", async () => {
  const app = createAppMock();

  registerHttpRoutes({
    app,
    registry: { counters: () => ({}) },
    socketEmitter: {
      async emitToCustomer() {
        return { emitted: true, socketIds: ["c1", "c2"] };
      },
    },
    loggerPort: createLoggerMock(),
  });

  const handler = app.routes.post.get("/customer/event");
  const res = createResMock();

  await handler(
    {
      headers: { user_id: "customer-1" },
      body: { trip_id: "trip-2", socket_event: "bookingTrip:AcceptedTrip" },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.socketCount, 2);
});

test("POST /customer/event returns 404 when offline", async () => {
  const app = createAppMock();

  registerHttpRoutes({
    app,
    registry: { counters: () => ({}) },
    socketEmitter: {
      async emitToCustomer() {
        return { emitted: false, socketIds: [] };
      },
    },
    loggerPort: createLoggerMock(),
  });

  const handler = app.routes.post.get("/customer/event");
  const res = createResMock();

  await handler(
    {
      headers: { user_id: "customer-offline" },
      body: { trip_id: "trip-2", socket_event: "bookingTrip:AcceptedTrip" },
    },
    res,
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, "user_id is not exist");
});
