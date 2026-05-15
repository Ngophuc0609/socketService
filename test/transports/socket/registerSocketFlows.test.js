const test = require("node:test");
const assert = require("node:assert/strict");

const {
  registerSocketFlows,
} = require("../../../src/transports/socket/registerSocketFlows");

let socketIdCounter = 0;

function createNamespace(name) {
  return {
    name,
    middlewares: [],
    connectionHandler: null,
    emitted: [],
    roomEmitted: [],
    use(fn) {
      this.middlewares.push(fn);
    },
    on(event, fn) {
      if (event === "connection") {
        this.connectionHandler = fn;
      }
    },
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

function createSocket(headers = {}) {
  socketIdCounter += 1;
  const socket = {
    id: `s-${socketIdCounter}`,
    handshake: { headers, auth: {} },
    rooms: new Set([`s-${socketIdCounter}`]),
    emitted: [],
    handlers: new Map(),
    disconnected: false,
    userId: undefined,
    userType: undefined,
    on(event, fn) {
      this.handlers.set(event, fn);
    },
    emit(event, payload) {
      this.emitted.push({ event, payload });
    },
    async join(room) {
      this.rooms.add(room);
    },
    async leave(room) {
      this.rooms.delete(room);
    },
    disconnect() {
      this.disconnected = true;
    },
    async trigger(event, payload) {
      const handler = this.handlers.get(event);
      if (handler) {
        return handler(payload);
      }
      return undefined;
    },
  };
  return socket;
}

async function connectWithMiddleware(namespace, socket) {
  for (const middleware of namespace.middlewares) {
    await new Promise((resolve, reject) => {
      middleware(socket, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  await namespace.connectionHandler(socket);
}

function createBaseDeps() {
  const ioRoot = createNamespace("/");
  const drivers = createNamespace("/drivers");
  const customers = createNamespace("/customers");
  const legacy = createNamespace("/");
  const admin = createNamespace("/admin");

  const io = {
    root: ioRoot,
    of(name) {
      if (name === "/") return ioRoot;
      throw new Error(`Unexpected namespace lookup: ${name}`);
    },
  };

  const safeRedisOps = {
    calls: [],
    async hset(key, value) {
      this.calls.push({ op: "hset", key, value });
      return 1;
    },
    async sadd(key, ...values) {
      this.calls.push({ op: "sadd", key, values });
      return values.length;
    },
    async srem(key, ...values) {
      this.calls.push({ op: "srem", key, values });
      return values.length;
    },
    async del(key) {
      this.calls.push({ op: "del", key });
      return 1;
    },
    async expire(key, ttl) {
      this.calls.push({ op: "expire", key, ttl });
      return 1;
    },
    async scard() {
      return 0;
    },
  };

  const tripRoomService = {
    joinCalls: [],
    leaveCalls: [],
    async joinTrip(socket, tripId) {
      this.joinCalls.push({ socketId: socket.id, tripId });
      await socket.join(`trip_${tripId}`);
      return `trip_${tripId}`;
    },
    async leaveTrip(socket, tripId) {
      this.leaveCalls.push({ socketId: socket.id, tripId });
      await socket.leave(`trip_${tripId}`);
      return `trip_${tripId}`;
    },
  };

  const locationService = {
    persisted: [],
    cleared: [],
    isThrottled() {
      return false;
    },
    normalize(lat, lng) {
      const latitude = Number(lat);
      const longitude = Number(lng);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return { valid: false };
      }
      return { valid: true, lat: latitude, lng: longitude };
    },
    async persistLocation(data) {
      this.persisted.push(data);
    },
    clearSocket(socketId) {
      this.cleared.push(socketId);
    },
  };

  const deps = {
    io,
    namespaces: { drivers, customers, legacy },
    registry: {
      drivers: new Map(),
      customers: new Map(),
      legacy: new Map(),
    },
    safeRedisOps,
    authService: {
      parseBearer(value) {
        if (!value) return null;
        const [scheme, token] = String(value).split(" ");
        if (scheme !== "Bearer" || !token) return null;
        return token;
      },
      readUserId(headers) {
        return headers.user_id || headers.userId || null;
      },
      verifyUserToken() {
        return { valid: true, reason: "ok", payload: { sub: "user" } };
      },
      verifyAdminToken(token) {
        if (token === "admin-token") {
          return {
            valid: true,
            reason: "ok",
            payload: { role: "admin", sub: "admin-1" },
          };
        }
        return { valid: false, reason: "invalid_signature", payload: null };
      },
    },
    loggerPort: { debug() {}, info() {} },
    socketTtlSeconds: 300,
    tripRoomService,
    locationService,
  };

  deps.namespaces.admin = admin;

  registerSocketFlows(deps);
  return deps;
}

test("driver flow: middleware auth, joinTrip, updateLocation, cleanup", async () => {
  const deps = createBaseDeps();
  const driverSocket = createSocket({
    authorization: "Bearer t1",
    user_id: "driver-1",
  });

  await connectWithMiddleware(deps.namespaces.drivers, driverSocket);

  assert.equal(deps.registry.drivers.get("driver-1"), driverSocket);

  await driverSocket.trigger("joinTrip", { tripId: "trip-1" });
  assert.equal(deps.tripRoomService.joinCalls.length, 1);
  assert.equal(driverSocket.emitted.at(-1).event, "joinedTrip");

  await driverSocket.trigger("updateLocation", {
    latitude: 10.1,
    longitude: 106.1,
    tripId: "trip-1",
  });

  assert.equal(deps.locationService.persisted.length, 1);
  assert.equal(deps.io.root.roomEmitted.length, 1);
  assert.equal(deps.io.root.roomEmitted[0].event, "locationUpdate");

  await driverSocket.trigger("disconnect");
  assert.equal(deps.registry.drivers.has("driver-1"), false);
  assert.equal(deps.locationService.cleared.includes(driverSocket.id), true);
});

test("legacy flow requires authenticate before updateLocation", async () => {
  const deps = createBaseDeps();
  const legacySocket = createSocket();

  await deps.namespaces.legacy.connectionHandler(legacySocket);

  await legacySocket.trigger("updateLocation", {
    latitude: 10,
    longitude: 106,
    tripId: "trip-x",
  });

  assert.equal(legacySocket.emitted.length, 1);
  assert.equal(legacySocket.emitted[0].event, "error");
  assert.equal(legacySocket.emitted[0].payload.message, "Not authenticated");

  await legacySocket.trigger("authenticate", {
    userId: "customer-1",
    userType: "customer",
  });

  const authEvent = legacySocket.emitted.find(
    (x) => x.event === "authenticated",
  );
  assert.ok(authEvent);
  assert.equal(authEvent.payload.userId, "customer-1");

  await legacySocket.trigger("updateLocation", {
    latitude: 11,
    longitude: 107,
    tripId: "trip-x",
  });

  assert.equal(deps.locationService.persisted.length, 1);
});

test("driver single-active policy disconnects old socket", async () => {
  const deps = createBaseDeps();

  const oldSocket = createSocket({
    authorization: "Bearer t-old",
    user_id: "driver-99",
  });
  await connectWithMiddleware(deps.namespaces.drivers, oldSocket);

  const newSocket = createSocket({
    authorization: "Bearer t-new",
    user_id: "driver-99",
  });
  await connectWithMiddleware(deps.namespaces.drivers, newSocket);

  assert.equal(oldSocket.disconnected, true);
  assert.equal(deps.registry.drivers.get("driver-99"), newSocket);
});

test("customer supports multiple active sockets", async () => {
  const deps = createBaseDeps();

  const socketA = createSocket({
    authorization: "Bearer c-a",
    user_id: "customer-77",
  });
  const socketB = createSocket({
    authorization: "Bearer c-b",
    user_id: "customer-77",
  });

  await connectWithMiddleware(deps.namespaces.customers, socketA);
  await connectWithMiddleware(deps.namespaces.customers, socketB);

  const list = deps.registry.customers.get("customer-77") || [];
  assert.equal(list.length, 2);
  assert.equal(
    list.some((s) => s.id === socketA.id),
    true,
  );
  assert.equal(
    list.some((s) => s.id === socketB.id),
    true,
  );
});

test("admin namespace authenticates and handles admin:getDrivers", async () => {
  const deps = createBaseDeps();

  const driverSocket = createSocket({
    authorization: "Bearer t1",
    user_id: "driver-live",
  });
  await connectWithMiddleware(deps.namespaces.drivers, driverSocket);

  const adminSocket = createSocket({ authorization: "Bearer admin-token" });
  await connectWithMiddleware(deps.namespaces.admin, adminSocket);

  await adminSocket.trigger("admin:getDrivers");

  const emitted = adminSocket.emitted.find((e) => e.event === "admin:drivers");
  assert.ok(emitted);
  assert.equal(Array.isArray(emitted.payload), true);
  assert.equal(emitted.payload.includes("driver-live"), true);
});
