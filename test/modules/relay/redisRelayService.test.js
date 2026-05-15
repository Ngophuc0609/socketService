const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createRedisRelayService,
} = require("../../../src/modules/relay/redisRelayService");

function createNamespace(name) {
  return {
    name,
    emitted: [],
    roomEmitted: [],
    emit(event, payload) {
      this.emitted.push({ event, payload });
    },
    to(room) {
      return {
        emit: (event, payload) => {
          this.roomEmitted.push({ room, event, payload });
        },
      };
    },
  };
}

test("bookingTrip:Request emits only to targeted driver", async () => {
  const io = createNamespace("io");
  const drivers = createNamespace("drivers");
  const customers = createNamespace("customers");

  const calls = [];
  const service = createRedisRelayService({
    io,
    namespaces: { drivers, customers, admin: null },
    socketEmitter: {
      async emitToDriver(userId, event, payload) {
        calls.push({ userId, event, payload });
      },
      async emitToCustomer() {},
    },
    loggerPort: { error() {}, debug() {} },
  });

  service.relayGenericEvent({
    eventName: "bookingTrip:Request",
    target: "driver-1",
    payload: { data: "trip-1" },
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    userId: "driver-1",
    event: "bookingTrip:Request",
    payload: "trip-1",
  });
  assert.equal(drivers.emitted.length, 0);
  assert.equal(customers.emitted.length, 0);
});

test("bookingTrip:Completed relays to trip rooms and targeted customer", async () => {
  const io = createNamespace("io");
  const drivers = createNamespace("drivers");
  const customers = createNamespace("customers");

  const customerCalls = [];
  const service = createRedisRelayService({
    io,
    namespaces: { drivers, customers, admin: null },
    socketEmitter: {
      async emitToDriver() {},
      async emitToCustomer(userId, event, payload) {
        customerCalls.push({ userId, event, payload });
      },
    },
    loggerPort: { error() {}, debug() {} },
  });

  service.relayGenericEvent({
    eventName: "bookingTrip:Completed",
    target: "customer-1",
    payload: { data: { tripId: "trip-99", status: "Completed" } },
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(io.roomEmitted.length, 1);
  assert.equal(io.roomEmitted[0].room, "trip_trip-99");
  assert.equal(io.roomEmitted[0].event, "bookingTrip:Completed:trip-99");

  assert.equal(drivers.roomEmitted.length, 1);
  assert.equal(customers.roomEmitted.length, 1);

  assert.equal(customerCalls.length, 1);
  assert.deepEqual(customerCalls[0], {
    userId: "customer-1",
    event: "bookingTrip:Completed:trip-99",
    payload: { tripId: "trip-99", status: "Completed" },
  });
});

test("generic trip event emits to all trip namespaces", () => {
  const io = createNamespace("io");
  const drivers = createNamespace("drivers");
  const customers = createNamespace("customers");

  const service = createRedisRelayService({
    io,
    namespaces: { drivers, customers, admin: null },
    socketEmitter: {
      async emitToDriver() {},
      async emitToCustomer() {},
    },
    loggerPort: { error() {}, debug() {} },
  });

  service.relayGenericEvent({
    type: "trip",
    target: "trip-7",
    eventName: "tripStatusChanged",
    payload: { ok: true },
  });

  assert.deepEqual(io.roomEmitted[0], {
    room: "trip_trip-7",
    event: "tripStatusChanged",
    payload: { ok: true },
  });
  assert.deepEqual(drivers.roomEmitted[0], {
    room: "trip_trip-7",
    event: "tripStatusChanged",
    payload: { ok: true },
  });
  assert.deepEqual(customers.roomEmitted[0], {
    room: "trip_trip-7",
    event: "tripStatusChanged",
    payload: { ok: true },
  });
});
