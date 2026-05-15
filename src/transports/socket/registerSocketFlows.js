const {
  userSocketKey,
  socketInfoKey,
  roomSocketKey,
} = require("../../shared/constants/redisKeys");

function registerSocketFlows({
  io,
  namespaces,
  registry,
  safeRedisOps,
  authService,
  loggerPort,
  socketTtlSeconds,
  tripRoomService,
  locationService,
  runtimeMetrics,
}) {
  function recordSocketEvent(eventName) {
    if (!runtimeMetrics) return;
    runtimeMetrics.recordSocketEvent(eventName);
  }

  function recordConnect(namespace) {
    if (!runtimeMetrics) return;
    runtimeMetrics.recordSocketConnect(namespace);
  }

  function recordDisconnect(namespace) {
    if (!runtimeMetrics) return;
    runtimeMetrics.recordSocketDisconnect(namespace);
  }

  function parseAuthFromHandshake(socket) {
    const headers = socket.handshake.headers || {};
    const rawAuth = headers["authorization"] || headers["Authorization"];
    const token = authService.parseBearer(rawAuth);
    const userId = authService.readUserId(headers);

    if (!token) {
      return { error: "UnAuthorization: accessToken invalid" };
    }

    if (!userId) {
      return { error: "UnAuthorization: userId invalid" };
    }

    const userVerify = authService.verifyUserToken(token);
    if (!userVerify.valid) {
      return { error: `UnAuthorization: ${userVerify.reason}` };
    }

    return { token, userId };
  }

  function emitAdminLog(type, data = {}) {
    if (!namespaces.admin) return;
    namespaces.admin.emit("admin:log", {
      type,
      time: new Date().toISOString(),
      data,
    });
  }

  async function addUserSocket(userType, userId, socket) {
    const userKey = userSocketKey(userType, userId);
    const infoKey = socketInfoKey(socket.id);

    await safeRedisOps.sadd(userKey, socket.id);
    await safeRedisOps.expire(userKey, socketTtlSeconds);

    await safeRedisOps.hset(infoKey, {
      userId,
      userType,
      socketId: socket.id,
      connectedAt: Date.now(),
    });
    await safeRedisOps.expire(infoKey, socketTtlSeconds);
  }

  async function removeUserSocket(userType, userId, socketId) {
    const userKey = userSocketKey(userType, userId);
    await safeRedisOps.srem(userKey, socketId);
    const remaining = await safeRedisOps.scard(userKey);
    if (remaining === 0) {
      await safeRedisOps.del(userKey);
    }
    await safeRedisOps.del(socketInfoKey(socketId));
  }

  async function onUpdateLocation(socket, userId, userType, data = {}) {
    if (locationService.isThrottled(socket.id)) {
      return;
    }

    const normalized = locationService.normalize(data.latitude, data.longitude);
    if (!normalized.valid) {
      return;
    }

    const locationData = {
      userId,
      userType,
      latitude: normalized.lat,
      longitude: normalized.lng,
      timestamp: Date.now(),
    };

    await locationService.persistLocation(locationData);

    if (data.tripId) {
      const room = `trip_${data.tripId}`;
      io.of("/").to(room).emit("locationUpdate", locationData);
      namespaces.drivers.to(room).emit("locationUpdate", locationData);
      namespaces.customers.to(room).emit("locationUpdate", locationData);
    }

    loggerPort.debug("LOCATION", "Processed location update", {
      userId,
      userType,
      socketId: socket.id,
      tripId: data.tripId,
    });
  }

  async function cleanupSocket(userType, userId, socket) {
    await removeUserSocket(userType, userId, socket.id);

    for (const room of Array.from(socket.rooms)) {
      await safeRedisOps.srem(roomSocketKey(room), socket.id);
    }

    locationService.clearSocket(socket.id);
  }

  namespaces.drivers.use((socket, next) => {
    const parsed = parseAuthFromHandshake(socket);
    if (parsed.error) return next(new Error(parsed.error));
    socket.userId = parsed.userId;
    socket.accessToken = parsed.token;
    socket.userType = "driver";
    next();
  });

  namespaces.customers.use((socket, next) => {
    const parsed = parseAuthFromHandshake(socket);
    if (parsed.error) return next(new Error(parsed.error));
    socket.userId = parsed.userId;
    socket.accessToken = parsed.token;
    socket.userType = "customer";
    next();
  });

  if (namespaces.admin) {
    namespaces.admin.use((socket, next) => {
      const token =
        socket.handshake?.auth?.token ||
        socket.handshake?.headers?.authorization ||
        socket.handshake?.headers?.Authorization;

      const accessToken =
        token && token.startsWith("Bearer ")
          ? authService.parseBearer(token)
          : token;

      const verified = authService.verifyAdminToken(accessToken);
      if (!verified.valid) {
        return next(new Error(`Unauthorized: ${verified.reason}`));
      }

      socket.adminId =
        verified.payload?.userId || verified.payload?.sub || null;
      return next();
    });

    namespaces.admin.on("connection", (socket) => {
      recordConnect("/admin");
      loggerPort.info("ADMIN_CONNECT", "Admin connected", {
        adminId: socket.adminId,
        socketId: socket.id,
      });

      emitAdminLog("control", {
        event: "connected",
        adminId: socket.adminId,
      });

      socket.on("admin:joinTrip", (tripId) => {
        if (!tripId) return;
        recordSocketEvent("admin:joinTrip");
        socket.join(`trip_${tripId}`);
        emitAdminLog("control", { event: "joinTrip", tripId });
      });

      socket.on("admin:emitTest", (payload) => {
        if (!payload || !payload.room || !payload.event) return;
        recordSocketEvent("admin:emitTest");
        io.to(payload.room).emit(payload.event, payload.data);
        emitAdminLog("control", { event: "emitTest", payload });
      });

      socket.on("admin:getDrivers", () => {
        recordSocketEvent("admin:getDrivers");
        const drivers = Array.from(registry.drivers.keys());
        socket.emit("admin:drivers", drivers);
      });

      socket.on("admin:setFilter", (filter) => {
        recordSocketEvent("admin:setFilter");
        socket.filter = filter;
        emitAdminLog("control", { event: "setFilter", filter });
      });

      socket.on("disconnect", () => {
        recordDisconnect("/admin");
        loggerPort.info("ADMIN_DISCONNECT", "Admin disconnected", {
          adminId: socket.adminId,
          socketId: socket.id,
        });
      });
    });
  }

  namespaces.drivers.on("connection", async (socket) => {
    recordConnect("/drivers");
    const userId = socket.userId;
    const existing = registry.drivers.get(userId);
    if (existing && existing.id !== socket.id) {
      existing.disconnect(true);
    }

    registry.drivers.set(userId, socket);
    await socket.join(`driver_${userId}`);
    await safeRedisOps.sadd(roomSocketKey(`driver_${userId}`), socket.id);
    await safeRedisOps.expire(
      roomSocketKey(`driver_${userId}`),
      socketTtlSeconds,
    );
    await addUserSocket("driver", userId, socket);

    socket.on("joinTrip", async (data = {}) => {
      recordSocketEvent("joinTrip");
      if (!data.tripId) {
        socket.emit("error", { message: "Missing tripId" });
        return;
      }

      const room = await tripRoomService.joinTrip(socket, data.tripId);
      socket.emit("joinedTrip", { tripId: data.tripId, room });
    });

    socket.on("leaveTrip", async (data = {}) => {
      recordSocketEvent("leaveTrip");
      if (!data.tripId) {
        socket.emit("error", { message: "Missing tripId" });
        return;
      }

      await tripRoomService.leaveTrip(socket, data.tripId);
      socket.emit("leftTrip", { tripId: data.tripId });
    });

    socket.on("updateLocation", (data = {}) => {
      recordSocketEvent("updateLocation");
      onUpdateLocation(socket, userId, "driver", data);
    });

    socket.on("disconnect", async () => {
      recordDisconnect("/drivers");
      const current = registry.drivers.get(userId);
      if (current && current.id === socket.id) {
        registry.drivers.delete(userId);
      }
      await cleanupSocket("driver", userId, socket);
    });
  });

  namespaces.customers.on("connection", async (socket) => {
    recordConnect("/customers");
    const userId = socket.userId;
    const list = registry.customers.get(userId) || [];
    list.push(socket);
    registry.customers.set(userId, list);

    await socket.join(`customer_${userId}`);
    await safeRedisOps.sadd(roomSocketKey(`customer_${userId}`), socket.id);
    await safeRedisOps.expire(
      roomSocketKey(`customer_${userId}`),
      socketTtlSeconds,
    );
    await addUserSocket("customer", userId, socket);

    socket.on("joinTrip", async (data = {}) => {
      recordSocketEvent("joinTrip");
      if (!data.tripId) {
        socket.emit("error", { message: "Missing tripId" });
        return;
      }

      const room = await tripRoomService.joinTrip(socket, data.tripId);
      socket.emit("joinedTrip", { tripId: data.tripId, room });
    });

    socket.on("leaveTrip", async (data = {}) => {
      recordSocketEvent("leaveTrip");
      if (!data.tripId) {
        socket.emit("error", { message: "Missing tripId" });
        return;
      }

      await tripRoomService.leaveTrip(socket, data.tripId);
      socket.emit("leftTrip", { tripId: data.tripId });
    });

    socket.on("updateLocation", (data = {}) => {
      recordSocketEvent("updateLocation");
      onUpdateLocation(socket, userId, "customer", data);
    });

    socket.on("disconnect", async () => {
      recordDisconnect("/customers");
      const current = registry.customers.get(userId) || [];
      const next = current.filter((item) => item.id !== socket.id);
      if (next.length === 0) registry.customers.delete(userId);
      else registry.customers.set(userId, next);
      await cleanupSocket("customer", userId, socket);
    });
  });

  namespaces.legacy.on("connection", (socket) => {
    recordConnect("/");
    loggerPort.debug("LEGACY_CONNECT", "Legacy namespace connection", {
      socketId: socket.id,
    });

    socket.on("authenticate", async (data = {}) => {
      recordSocketEvent("authenticate");
      const { userId, userType } = data;
      if (!userId || !userType) {
        socket.emit("error", { message: "Missing userId or userType" });
        return;
      }

      socket.userId = userId;
      socket.userType = userType;

      const userSockets = registry.legacy.get(userId) || [];
      userSockets.push(socket.id);
      registry.legacy.set(userId, userSockets);

      const userRoom = `${userType}_${userId}`;
      await socket.join(userRoom);
      await socket.join(userType);
      await safeRedisOps.sadd(roomSocketKey(userRoom), socket.id);
      await safeRedisOps.expire(roomSocketKey(userRoom), socketTtlSeconds);
      await addUserSocket(userType, userId, socket);

      socket.emit("authenticated", {
        success: true,
        userId,
        userType,
        rooms: Array.from(socket.rooms),
      });
    });

    socket.on("joinTrip", async (data = {}) => {
      recordSocketEvent("joinTrip");
      if (!data.tripId) {
        socket.emit("error", { message: "Missing tripId" });
        return;
      }

      const room = await tripRoomService.joinTrip(socket, data.tripId);
      socket.emit("joinedTrip", { tripId: data.tripId, room });
    });

    socket.on("leaveTrip", async (data = {}) => {
      recordSocketEvent("leaveTrip");
      if (!data.tripId) {
        socket.emit("error", { message: "Missing tripId" });
        return;
      }

      await tripRoomService.leaveTrip(socket, data.tripId);
      socket.emit("leftTrip", { tripId: data.tripId });
    });

    socket.on("updateLocation", (data = {}) => {
      recordSocketEvent("updateLocation");
      if (!socket.userId) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }

      onUpdateLocation(socket, socket.userId, socket.userType, data);
    });

    socket.on("disconnect", async () => {
      recordDisconnect("/");
      if (socket.userId) {
        const userSockets = registry.legacy.get(socket.userId) || [];
        const next = userSockets.filter((item) => item !== socket.id);
        if (next.length === 0) registry.legacy.delete(socket.userId);
        else registry.legacy.set(socket.userId, next);
        await cleanupSocket(
          socket.userType || "unknown",
          socket.userId,
          socket,
        );
      }
      locationService.clearSocket(socket.id);
    });
  });
}

module.exports = { registerSocketFlows };
