const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createRuntimeMetrics,
} = require("../../../src/infrastructure/monitoring/runtimeMetrics");

test("runtime metrics snapshot tracks counters", () => {
  const metrics = createRuntimeMetrics();

  metrics.recordSocketConnect("/drivers");
  metrics.recordSocketEvent("joinTrip");
  metrics.recordHttpRequest("/health", 200);
  metrics.recordRedisMessage(true);
  metrics.recordRelayEvent("bookingTrip:Request");
  metrics.recordSocketDisconnect("/drivers");

  const snap = metrics.snapshot();
  assert.equal(snap.connections.drivers, 0);
  assert.equal(snap.totals.socketConnections, 1);
  assert.equal(snap.totals.socketDisconnections, 1);
  assert.equal(snap.totals.socketEvents, 1);
  assert.equal(snap.totals.httpRequests, 1);
  assert.equal(snap.totals.redisMessages, 1);
  assert.equal(snap.totals.relayEvents, 1);
});

test("runtime metrics exports prometheus text", () => {
  const metrics = createRuntimeMetrics();
  metrics.recordHttpRequest("/health", 500);
  const text = metrics.toPrometheus();

  assert.equal(typeof text, "string");
  assert.equal(text.includes("http_requests_total"), true);
  assert.equal(text.includes("http_request_errors_total"), true);
});
