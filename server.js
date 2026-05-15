require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const {
  logInfo,
  logWarn,
  logError,
  logDebug,
  attachTrace,
  formatTelegram,
} = require("./logger");

async function sendTelegramLog(msg, meta = {}) {
  try {
    logInfo("TELEGRAM", msg, meta);
  } catch (err) {
    console.error("[Telegram Notify Error]", err?.message || err);
  }
}

const { createServer } = require("http");
const { Server } = require("socket.io");
const Redis = require("ioredis");
// FIX: Remove DriverRoom vì không dùng đúng logic
// const DriverRoom = "driver_room";

// Khởi tạo Express app
const app = express();
app.use(express.json());

// Khởi tạo HTTP server
const server = createServer(app);

// Khởi tạo Redis client
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

const redisSub = redis.duplicate();

// SAFE REDIS WRAPPERS (tránh crash nếu Redis bị lỗi)
async function safeRedisHSet(key, value) {
  try {
    await redis.hset(key, value);
  } catch (err) {
    const message = err?.message || err;
    console.error("[Redis] hset error:", message);
    sendTelegramLog(
      formatTelegram("ERROR", "REDIS", "hset error", { key, error: message }),
    ).catch(() => {});
  }
}

async function safeRedisSAdd(key, ...values) {
  try {
    await redis.sadd(key, ...values);
  } catch (err) {
    const message = err?.message || err;
    console.error("[Redis] sadd error:", message);
    sendTelegramLog(
      formatTelegram("ERROR", "REDIS", "sadd error", {
        key,
        values: JSON.stringify(values),
        error: message,
      }),
    ).catch(() => {});
  }
}

async function safeRedisSRem(key, ...values) {
  try {
    await redis.srem(key, ...values);
  } catch (err) {
    const message = err?.message || err;
    console.error("[Redis] srem error:", message);
    sendTelegramLog(
      formatTelegram("ERROR", "REDIS", "srem error", {
        key,
        values: JSON.stringify(values),
        error: message,
      }),
    ).catch(() => {});
  }
}

async function safeRedisDel(key) {
  try {
    await redis.del(key);
  } catch (err) {
    const message = err?.message || err;
    console.error("[Redis] del error:", message);
    sendTelegramLog(
      formatTelegram("ERROR", "REDIS", "del error", { key, error: message }),
    ).catch(() => {});
  }
}

async function safeRedisExpire(key, seconds) {
  try {
    await redis.expire(key, seconds);
  } catch (err) {
    const message = err?.message || err;
    console.error("[Redis] expire error:", message);
    sendTelegramLog(
      formatTelegram("ERROR", "REDIS", "expire error", {
        key,
        seconds,
        error: message,
      }),
    ).catch(() => {});
  }
}

// Throttle vị trí (1s per socket)
const locationUpdateThrottle = new Map();

// Redis key TTL (30 days)
const REDIS_SOCKET_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 ngày

/**
 * Lưu socketId -> userId/userType để dễ lookup. Bao gồm:
 * - socket:uid:{userType}:{userId} = set(socketId)
 * - socket:info:{socketId} = hash { userId, userType, namespace }
 */
async function addUserSocket(userType, userId, socketId) {
  try {
    const userKey = `socket:uid:${userType}:${userId}`;
    await redis.sadd(userKey, socketId);
    await redis.expire(userKey, REDIS_SOCKET_TTL_SECONDS);

    const infoKey = `socket:info:${socketId}`;
    await redis.hset(infoKey, {
      userId,
      userType,
      socketId,
      connectedAt: Date.now(),
    });
    await redis.expire(infoKey, REDIS_SOCKET_TTL_SECONDS);
  } catch (err) {
    console.error("[Redis] addUserSocket error:", err?.message || err);
  }
}

async function removeUserSocket(userType, userId, socketId) {
  try {
    const userKey = `socket:uid:${userType}:${userId}`;
    await redis.srem(userKey, socketId);
    const remaining = await redis.scard(userKey);
    if (remaining === 0) {
      await redis.del(userKey);
    }

    const infoKey = `socket:info:${socketId}`;
    await redis.del(infoKey);
  } catch (err) {
    console.error("[Redis] removeUserSocket error:", err?.message || err);
  }
}

async function getSocketIdsForUser(userType, userId) {
  try {
    const key = `socket:uid:${userType}:${userId}`;
    const ids = await redis.smembers(key);
    return ids || [];
  } catch (err) {
    console.error("[Redis] getSocketIdsForUser error:", err?.message || err);
    return [];
  }
}

// Khởi tạo Socket.io server với HTTP server
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

const PORT = process.env.PORT || 8605;

// Admin monitoring (toggle on/off in production)
const ADMIN_MONITOR = process.env.ADMIN_MONITOR === "true";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;

function base64UrlDecode(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = 4 - (s.length % 4);
  if (pad !== 4) {
    s += "=".repeat(pad);
  }
  return Buffer.from(s, "base64").toString("utf8");
}

function verifyAdminToken(token) {
  if (!token) return null;
  try {
    if (!ADMIN_JWT_SECRET) {
      // Admin monitoring enabled but secret is not configured
      logWarn("ADMIN", "Missing ADMIN_JWT_SECRET, admin auth disabled");
      return null;
    }

    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const data = `${headerB64}.${payloadB64}`;

    const expectedSig = crypto
      .createHmac("sha256", ADMIN_JWT_SECRET)
      .update(data)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    if (expectedSig !== signatureB64) return null;

    return JSON.parse(base64UrlDecode(payloadB64));
  } catch (err) {
    return null;
  }
}

const adminNamespace = ADMIN_MONITOR ? io.of("/admin") : null;

function emitAdminLog(type, data = {}) {
  if (!ADMIN_MONITOR || !adminNamespace) return;
  try {
    adminNamespace.emit("admin:log", {
      type,
      time: new Date().toISOString(),
      data,
    });
  } catch (err) {
    logWarn("ADMIN", "Failed to emit admin log", {
      error: err?.message || err,
    });
  }
}

console.log(`Socket.io server starting on port ${PORT}...`);

// ===========================================
// MIDDLEWARE - Authentication cho Socket.io
// ===========================================
// Middleware này chạy trước khi connection được thiết lập
io.use((socket, next) => {
  const headers = socket.handshake.headers;

  // Kiểm tra Authorization header
  const authHeader = headers["authorization"] || headers["Authorization"];
  if (!authHeader) {
    return next(new Error("UnAuthorization: Missing Authorization header"));
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return next(new Error("UnAuthorization: Invalid Authorization format"));
  }

  const accessToken = parts[1];
  if (!accessToken) {
    return next(new Error("UnAuthorization: accessToken invalid"));
  }

  // TODO: Verify JWT token nếu cần
  // const isTokenExpired = verifyJWT(accessToken);
  // if (isTokenExpired) {
  //   return next(new Error('UnAuthorization: accessToken is expired'));
  // }

  // Kiểm tra userId
  const userId = headers["user_id"] || headers["userId"];
  if (!userId) {
    return next(new Error("UnAuthorization: userId invalid"));
  }

  // Lưu thông tin vào socket để sử dụng sau
  socket.userId = userId;
  socket.accessToken = accessToken;

  next();
});

// ===========================================
// NAMESPACE: /drivers
// ===========================================
// Driver chỉ có 1 kết nối duy nhất (disconnect phiên cũ nếu connect lại)
const driversNamespace = io.of("/drivers");
const driversConnected = new Map(); // userId -> socket

/**
 * Emit tới tất cả driver (broadcast)
 */
function emitToAllDrivers(event, payload) {
  driversNamespace.emit(event, payload);
  emitAdminLog("emit", {
    namespace: "/drivers",
    target: "all",
    event,
    payload,
  });
}

/**
 * Emit tới 1 driver chỉ định (chỉ 1 socket được phép kết nối per driver)
 */
async function emitToDriver(userId, event, payload) {
  if (!userId) return false;

  // Prefer in-memory map (single-instance fast path)
  const socket = driversConnected.get(userId);
  if (socket) {
    driversNamespace.to(socket.id).emit(event, payload);
    emitAdminLog("emit", {
      namespace: "/drivers",
      target: userId,
      event,
      payload,
      socketId: socket.id,
    });
    return true;
  }

  // Fallback: lookup Redis to support multi-instance and stale state
  const socketIds = await getSocketIdsForUser("driver", userId);
  if (socketIds && socketIds.length > 0) {
    socketIds.forEach((socketId) => {
      driversNamespace.to(socketId).emit(event, payload);
    });
    emitAdminLog("emit", {
      namespace: "/drivers",
      target: userId,
      event,
      payload,
      socketIds,
    });
    return true;
  }

  return false;
}

/**
 * Emit tới 1 customer (có thể nhiều socket kết nối)
 */
async function emitToCustomer(userId, event, payload) {
  if (!userId) return false;

  const emittedSocketIds = new Set();
  let emitted = false;

  // Prefer in-memory map (fast path, multi-id per customer)
  const sockets = customersConnected.get(userId) || [];
  console.log("[EmitToCustomer] check in-memory sockets", {
    userId,
    socketCount: sockets.length,
  });

  for (const socket of sockets) {
    if (!socket || !socket.id) continue;
    try {
      customersNamespace.to(socket.id).emit(event, payload);
      emittedSocketIds.add(socket.id);
      emitted = true;
      console.log("[EmitToCustomer] emitted via in-memory", {
        userId,
        event,
        socketId: socket.id,
        payload,
      });
    } catch (err) {
      console.warn("[EmitToCustomer] In-memory emit failed", {
        userId,
        socketId: socket.id,
        err: err?.message || err,
      });
    }
  }

  // Fallback and/or additional sockets from Redis to support multi-instance and stale state
  const redisKey = `socket:uid:customer:${userId}`;
  const redisSocketIds = await getSocketIdsForUser("customer", userId);
  console.log("[EmitToCustomer] check redis socket ids", {
    userId,
    redisKey,
    redisSocketIds,
  });

  if (redisSocketIds && redisSocketIds.length > 0) {
    for (const socketId of redisSocketIds) {
      if (!socketId || emittedSocketIds.has(socketId)) continue;
      try {
        customersNamespace.to(socketId).emit(event, payload);
        emittedSocketIds.add(socketId);
        emitted = true;
        console.log("[EmitToCustomer] emitted via redis", {
          userId,
          event,
          redisKey,
          socketId,
          payload,
        });
      } catch (err) {
        console.warn("[EmitToCustomer] Redis emit failed", {
          userId,
          socketId,
          err: err?.message || err,
        });
      }
    }
  }

  if (emitted) {
    const socketIdList = Array.from(emittedSocketIds);

    const logPayload = {
      userId,
      event,
      payload,
      socketIds: socketIdList,
      count: socketIdList.length,
      source: "emitToCustomer",
    };

    console.log("[EmitToCustomer] emit event", logPayload);
    emitAdminLog("emit", {
      namespace: "/customers",
      ...logPayload,
    });

    sendTelegramLog(
      formatTelegram(
        "INFO",
        "EmitToCustomer",
        "Emitted customer event",
        logPayload,
      ),
    ).catch(() => {});

    return true;
  }

  const noSocketPayload = { userId, event, payload, source: "emitToCustomer" };
  console.warn("[EmitToCustomer] no sockets to emit", noSocketPayload);
  sendTelegramLog(
    formatTelegram(
      "WARN",
      "EmitToCustomer",
      "No customer sockets found to emit",
      noSocketPayload,
    ),
  ).catch(() => {});
  return false;
}

/**
 * Emit tới tất cả customer đã kết nối (broadcast customer namespace)
 */
function emitToAllCustomers(event, payload) {
  customersNamespace.emit(event, payload);
  emitAdminLog("emit", {
    namespace: "/customers",
    target: "all",
    event,
    payload,
  });
}

// Middleware authentication cho namespace /drivers
driversNamespace.use((socket, next) => {
  const headers = socket.handshake.headers;

  const authHeader = headers["authorization"] || headers["Authorization"];
  if (!authHeader) {
    return next(new Error("UnAuthorization: Missing Authorization header"));
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return next(new Error("UnAuthorization: Invalid Authorization format"));
  }

  const accessToken = parts[1];
  if (!accessToken) {
    return next(new Error("UnAuthorization: accessToken invalid"));
  }

  const userId = headers["user_id"] || headers["userId"];
  if (!userId) {
    return next(new Error("UnAuthorization: userId invalid"));
  }

  socket.userId = userId;
  socket.accessToken = accessToken;
  next();
});

driversNamespace.on("connection", async (socket) => {
  const userId = socket.userId;

  const traceId = attachTrace(socket, userId);
  logInfo("DRIVER_CONNECT", "Driver connected", {
    userId,
    socketId: socket.id,
    traceId,
  });

  await sendTelegramLog(
    formatTelegram("Driver Connected", {
      userId,
      socketId: socket.id,
      traceId,
    }),
  );

  // Nếu driver đã có kết nối cũ, ngắt kết nối cũ
  const existingSocket = driversConnected.get(userId);
  if (existingSocket) {
    const logMsg2 = `[Driver] <b>Disconnecting old socket</b> for userId=<code>${userId}</code>`;
    console.log(logMsg2);
    sendTelegramLog(logMsg2);
    existingSocket.disconnect(true);
  }

  // Lưu socket mới
  driversConnected.set(userId, socket);

  // Join room driver_{userId}
  const driverRoom = `driver_${userId}`;
  await socket.join(driverRoom);

  // Lưu vào Redis (sử dụng wrapper để tránh crash khi Redis lỗi)
  // Lưu state socket cho driver (1 driver 1 socket)
  await addUserSocket("driver", userId, socket.id);
  await safeRedisSAdd(`socket:room:${driverRoom}`, socket.id);
  await safeRedisExpire(`socket:room:${driverRoom}`, REDIS_SOCKET_TTL_SECONDS);

  const logMsg3 = `[Driver] userId=<code>${userId}</code> joined room: <code>${driverRoom}</code>`;
  console.log(logMsg3);
  sendTelegramLog(logMsg3);

  // Join trip group
  socket.on("joinTrip", async (data) => {
    try {
      const { tripId } = data;
      if (!tripId) {
        socket.emit("error", { message: "Missing tripId" });
        return;
      }

      const tripRoom = `trip_${tripId}`;
      await socket.join(tripRoom);
      await safeRedisSAdd(`socket:room:${tripRoom}`, socket.id);
      await safeRedisExpire(
        `socket:room:${tripRoom}`,
        REDIS_SOCKET_TTL_SECONDS,
      );

      const logMsg4 = `[Driver] userId=<code>${userId}</code> joined trip room: <code>${tripRoom}</code>`;
      console.log(logMsg4);
      sendTelegramLog(logMsg4);
      socket.emit("joinedTrip", { tripId, room: tripRoom });
    } catch (error) {
      console.error("[Driver] Join trip error:", error);
      socket.emit("error", { message: "Failed to join trip" });
    }
  });

  // Leave trip group
  socket.on("leaveTrip", async (data) => {
    try {
      const { tripId } = data;
      if (!tripId) {
        socket.emit("error", { message: "Missing tripId" });
        return;
      }

      const tripRoom = `trip_${tripId}`;
      await socket.leave(tripRoom);
      await safeRedisSRem(`socket:room:${tripRoom}`, socket.id);

      const logMsg5 = `[Driver] userId=<code>${userId}</code> left trip room: <code>${tripRoom}</code>`;
      console.log(logMsg5);
      sendTelegramLog(logMsg5);
      socket.emit("leftTrip", { tripId });
    } catch (error) {
      console.error("[Driver] Leave trip error:", error);
    }
  });

  // Update location (throttle + validate + safe Redis)
  socket.on("updateLocation", async (data) => {
    try {
      const { latitude, longitude, tripId } = data;

      // Throttle 1s/người (socket) using shared global map
      const now = Date.now();
      const last = locationUpdateThrottle.get(socket.id);
      if (last && now - last < 1000) {
        return;
      }
      locationUpdateThrottle.set(socket.id, now);

      // Validate lat/lng
      const latNum = Number(latitude);
      const lngNum = Number(longitude);
      if (
        Number.isNaN(latNum) ||
        Number.isNaN(lngNum) ||
        latNum < -90 ||
        latNum > 90 ||
        lngNum < -180 ||
        lngNum > 180
      ) {
        console.warn(
          `[Driver] Invalid location update from ${userId}: ${latitude}, ${longitude}`,
        );
        return;
      }

      const locationData = {
        userId,
        userType: "driver",
        latitude: latNum,
        longitude: lngNum,
        timestamp: now,
      };

      // Lưu vị trí vào Redis
      await safeRedisHSet(`location:${userId}`, locationData);
      await safeRedisExpire(`location:${userId}`, 300); // TTL 5 phút

      // Broadcast tới trip room nếu có tripId
      if (tripId) {
        io.of("/").to(`trip_${tripId}`).emit("locationUpdate", locationData);
        driversNamespace
          .to(`trip_${tripId}`)
          .emit("locationUpdate", locationData);
        customersNamespace
          .to(`trip_${tripId}`)
          .emit("locationUpdate", locationData);
      }

      emitAdminLog("location", {
        userId,
        userType: "driver",
        lat: latNum,
        lng: lngNum,
        tripId,
        socketId: socket.id,
        traceId: socket.traceId,
      });

      logDebug("DRIVER_LOCATION", "Update location", {
        userId,
        lat: latNum,
        lng: lngNum,
        tripId,
        socketId: socket.id,
        traceId: socket.traceId,
      });
    } catch (error) {
      console.error("[Driver] Update location error:", error);
    }
  });

  // Disconnect handler
  socket.on("disconnect", async () => {
    try {
      logInfo("DRIVER_DISCONNECT", "Driver disconnected", {
        userId,
        socketId: socket.id,
        traceId: socket.traceId,
      });

      await sendTelegramLog(
        formatTelegram("Driver Disconnected", {
          userId,
          socketId: socket.id,
          traceId: socket.traceId,
        }),
      );

      // Xóa khỏi Map (nếu socket hiện tại là socket đang lưu)
      const currentSocket = driversConnected.get(userId);
      if (currentSocket && currentSocket.id === socket.id) {
        driversConnected.delete(userId);
      }

      // Xóa khỏi Redis (socket mapping theo userType)
      await removeUserSocket("driver", userId, socket.id);

      // Xóa khỏi tất cả các rooms trong Redis
      const rooms = Array.from(socket.rooms);
      for (const room of rooms) {
        await safeRedisSRem(`socket:room:${room}`, socket.id);
      }

      // Clear throttle state
      locationUpdateThrottle.delete(socket.id);
    } catch (error) {
      console.error("[Driver] Disconnect cleanup error:", error);
    }
  });
});

// ===========================================
// NAMESPACE: /admin (monitor + ops)
// ===========================================
if (ADMIN_MONITOR) {
  adminNamespace.use((socket, next) => {
    const token =
      socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    if (!token) {
      return next(new Error("Unauthorized: missing token"));
    }

    const decoded = verifyAdminToken(token);
    if (!decoded || decoded.role !== "admin") {
      return next(new Error("Unauthorized"));
    }

    socket.adminId = decoded.userId || decoded.sub;
    next();
  });

  adminNamespace.on("connection", (socket) => {
    logInfo("ADMIN_CONNECT", "Admin connected", {
      adminId: socket.adminId,
      socketId: socket.id,
    });
    emitAdminLog("control", { event: "connected", adminId: socket.adminId });

    socket.on("disconnect", () => {
      logInfo("ADMIN_DISCONNECT", "Admin disconnected", {
        adminId: socket.adminId,
        socketId: socket.id,
      });
    });

    socket.on("admin:joinTrip", (tripId) => {
      if (!tripId) return;
      socket.join(`trip_${tripId}`);
      emitAdminLog("control", { event: "joinTrip", tripId });
    });

    socket.on("admin:emitTest", (payload) => {
      if (!payload || !payload.room || !payload.event) return;
      io.to(payload.room).emit(payload.event, payload.data);
      emitAdminLog("control", { event: "emitTest", payload });
    });

    socket.on("admin:getDrivers", () => {
      const drivers = Array.from(driversConnected.keys());
      socket.emit("admin:drivers", drivers);
    });

    // Optional: allow filtering logs per admin client
    socket.on("admin:setFilter", (filter) => {
      socket.filter = filter;
      emitAdminLog("control", { event: "setFilter", filter });
    });
  });
}

// ===========================================
// NAMESPACE: /customers
// ===========================================
// Customer có thể có nhiều kết nối (nhiều thiết bị)
const customersNamespace = io.of("/customers");
const customersConnected = new Map(); // userId -> [socket1, socket2, ...]

// Middleware authentication cho namespace /customers
customersNamespace.use((socket, next) => {
  const headers = socket.handshake.headers;

  const authHeader = headers["authorization"] || headers["Authorization"];
  if (!authHeader) {
    return next(new Error("UnAuthorization: Missing Authorization header"));
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return next(new Error("UnAuthorization: Invalid Authorization format"));
  }

  const accessToken = parts[1];
  if (!accessToken) {
    return next(new Error("UnAuthorization: accessToken invalid"));
  }

  const userId = headers["user_id"] || headers["userId"];
  if (!userId) {
    return next(new Error("UnAuthorization: userId invalid"));
  }

  socket.userId = userId;
  socket.accessToken = accessToken;
  next();
});

customersNamespace.on("connection", async (socket) => {
  const userId = socket.userId;
  const logMsg = `[Customer] <b>Connected</b>: userId=<code>${userId}</code>, socketId=<code>${socket.id}</code>`;
  console.log(logMsg);
  sendTelegramLog(logMsg);

  // Lưu socket vào danh sách
  if (!customersConnected.has(userId)) {
    customersConnected.set(userId, []);
  }
  customersConnected.get(userId).push(socket);

  // Join room customer_{userId}
  const customerRoom = `customer_${userId}`;
  await socket.join(customerRoom);

  // Lưu vào Redis (sử dụng wrapper để tránh crash)
  await addUserSocket("customer", userId, socket.id);
  await safeRedisSAdd(`socket:room:${customerRoom}`, socket.id);
  await safeRedisExpire(
    `socket:room:${customerRoom}`,
    REDIS_SOCKET_TTL_SECONDS,
  );

  const logMsg2 = `[Customer] userId=<code>${userId}</code> joined room: <code>${customerRoom}</code>`;
  console.log(logMsg2);
  sendTelegramLog(logMsg2);

  // Join trip group
  socket.on("joinTrip", async (data) => {
    try {
      const { tripId } = data;
      if (!tripId) {
        socket.emit("error", { message: "Missing tripId" });
        return;
      }

      const tripRoom = `trip_${tripId}`;
      await socket.join(tripRoom);
      await safeRedisSAdd(`socket:room:${tripRoom}`, socket.id);
      await safeRedisExpire(
        `socket:room:${tripRoom}`,
        REDIS_SOCKET_TTL_SECONDS,
      );

      const logMsg3 = `[Customer] userId=<code>${userId}</code> joined trip room: <code>${tripRoom}</code>`;
      console.log(logMsg3);
      sendTelegramLog(logMsg3);
      socket.emit("joinedTrip", { tripId, room: tripRoom });
    } catch (error) {
      console.error("[Customer] Join trip error:", error);
      socket.emit("error", { message: "Failed to join trip" });
    }
  });

  // Leave trip group
  socket.on("leaveTrip", async (data) => {
    try {
      const { tripId } = data;
      if (!tripId) {
        socket.emit("error", { message: "Missing tripId" });
        return;
      }

      const tripRoom = `trip_${tripId}`;
      await socket.leave(tripRoom);
      await safeRedisSRem(`socket:room:${tripRoom}`, socket.id);

      const logMsg4 = `[Customer] userId=<code>${userId}</code> left trip room: <code>${tripRoom}</code>`;
      console.log(logMsg4);
      sendTelegramLog(logMsg4);
      socket.emit("leftTrip", { tripId });
    } catch (error) {
      console.error("[Customer] Leave trip error:", error);
    }
  });

  // Update location
  socket.on("updateLocation", async (data) => {
    try {
      const { latitude, longitude, tripId } = data;

      // Throttle 1s
      const now = Date.now();
      const last = locationUpdateThrottle.get(socket.id);
      if (last && now - last < 1000) {
        return;
      }
      locationUpdateThrottle.set(socket.id, now);

      // Validate lat/lng
      const latNum = Number(latitude);
      const lngNum = Number(longitude);
      if (
        Number.isNaN(latNum) ||
        Number.isNaN(lngNum) ||
        latNum < -90 ||
        latNum > 90 ||
        lngNum < -180 ||
        lngNum > 180
      ) {
        console.warn(
          `[Customer] Invalid location update from ${userId}: ${latitude}, ${longitude}`,
        );
        return;
      }

      const locationData = {
        userId,
        userType: "customer",
        latitude: latNum,
        longitude: lngNum,
        timestamp: now,
      };

      // Lưu vị trí vào Redis (safe wrapper)
      await safeRedisHSet(`location:${userId}`, locationData);
      await safeRedisExpire(`location:${userId}`, 300); // TTL 5 phút

      // Broadcast tới trip room nếu có tripId
      if (tripId) {
        io.of("/").to(`trip_${tripId}`).emit("locationUpdate", locationData);
        driversNamespace
          .to(`trip_${tripId}`)
          .emit("locationUpdate", locationData);
        customersNamespace
          .to(`trip_${tripId}`)
          .emit("locationUpdate", locationData);
      }

      emitAdminLog("location", {
        userId,
        userType: "customer",
        lat: latNum,
        lng: lngNum,
        tripId,
        socketId: socket.id,
      });

      console.log(
        `[Customer] Location updated for userId=${userId}: ${latitude}, ${longitude}`,
      );
    } catch (error) {
      console.error("[Customer] Update location error:", error);
    }
  });

  // Disconnect handler
  socket.on("disconnect", async () => {
    try {
      const logMsg5 = `[Customer] <b>Disconnected</b>: userId=<code>${userId}</code>, socketId=<code>${socket.id}</code>`;
      console.log(logMsg5);
      sendTelegramLog(logMsg5);

      // Xóa socket khỏi danh sách
      let sockets = customersConnected.get(userId);
      if (sockets) {
        sockets = sockets.filter((s) => s.id !== socket.id);
        if (sockets.length === 0) {
          customersConnected.delete(userId);
        } else {
          customersConnected.set(userId, sockets);
        }
      }

      // Xóa khỏi Redis
      await removeUserSocket("customer", userId, socket.id);

      // Xóa khỏi tất cả các rooms trong Redis
      const rooms = Array.from(socket.rooms);
      for (const room of rooms) {
        await safeRedisSRem(`socket:room:${room}`, socket.id);
      }

      // Clear throttle state
      locationUpdateThrottle.delete(socket.id);
    } catch (error) {
      console.error("[Customer] Disconnect cleanup error:", error);
    }
  });
});

// ===========================================
// DEFAULT NAMESPACE: / (legacy support)
// ===========================================
// Giữ lại default namespace để tương thích ngược
const userConnections = new Map();

io.on("connection", async (socket) => {
  console.log(`[Default] Client connected: ${socket.id}`);

  // Authenticate và join group
  socket.on("authenticate", async (data) => {
    try {
      const { userId, userType, token } = data;

      if (!userId || !userType) {
        socket.emit("error", { message: "Missing userId or userType" });
        return;
      }

      // Lưu thông tin user
      socket.userId = userId;
      socket.userType = userType;

      // Lưu vào Map
      if (!userConnections.has(userId)) {
        userConnections.set(userId, []);
      }
      userConnections.get(userId).push(socket.id);

      // Join room theo userType và userId
      const userRoom = `${userType}_${userId}`;
      await socket.join(userRoom);

      // Join room chung theo userType
      await socket.join(userType);

      // Lưu vào Redis (socket mapping theo userType)
      await addUserSocket(userType, userId, socket.id);
      await safeRedisSAdd(`socket:room:${userRoom}`, socket.id);
      await safeRedisExpire(
        `socket:room:${userRoom}`,
        REDIS_SOCKET_TTL_SECONDS,
      );

      console.log(
        `[Default] User ${userId} (${userType}) authenticated and joined room: ${userRoom}`,
      );

      socket.emit("authenticated", {
        success: true,
        userId,
        userType,
        rooms: Array.from(socket.rooms),
      });
    } catch (error) {
      console.error("[Default] Authentication error:", error);
      socket.emit("error", { message: "Authentication failed" });
    }
  });

  // Join trip group
  socket.on("joinTrip", async (data) => {
    try {
      const { tripId } = data;
      if (!tripId) {
        socket.emit("error", { message: "Missing tripId" });
        return;
      }

      const tripRoom = `trip_${tripId}`;
      await socket.join(tripRoom);
      await safeRedisSAdd(`socket:room:${tripRoom}`, socket.id);
      await safeRedisExpire(
        `socket:room:${tripRoom}`,
        REDIS_SOCKET_TTL_SECONDS,
      );

      console.log(
        `[Default] Socket ${socket.id} joined trip room: ${tripRoom}`,
      );
      socket.emit("joinedTrip", { tripId, room: tripRoom });
    } catch (error) {
      console.error("[Default] Join trip error:", error);
      socket.emit("error", { message: "Failed to join trip" });
    }
  });

  // Leave trip group
  socket.on("leaveTrip", async (data) => {
    try {
      const { tripId } = data;
      if (!tripId) {
        socket.emit("error", { message: "Missing tripId" });
        return;
      }

      const tripRoom = `trip_${tripId}`;
      await socket.leave(tripRoom);
      await safeRedisSRem(`socket:room:${tripRoom}`, socket.id);

      console.log(`[Default] Socket ${socket.id} left trip room: ${tripRoom}`);
      socket.emit("leftTrip", { tripId });
    } catch (error) {
      console.error("[Default] Leave trip error:", error);
    }
  });

  // Update location
  socket.on("updateLocation", async (data) => {
    try {
      const { latitude, longitude, tripId } = data;

      if (!socket.userId) {
        socket.emit("error", { message: "Not authenticated" });
        return;
      }

      // Throttle 1s
      const now = Date.now();
      const last = locationUpdateThrottle.get(socket.id);
      if (last && now - last < 1000) {
        return;
      }
      locationUpdateThrottle.set(socket.id, now);

      // Validate lat/lng
      const latNum = Number(latitude);
      const lngNum = Number(longitude);
      if (
        Number.isNaN(latNum) ||
        Number.isNaN(lngNum) ||
        latNum < -90 ||
        latNum > 90 ||
        lngNum < -180 ||
        lngNum > 180
      ) {
        console.warn(
          `[Default] Invalid location update from ${socket.userId}: ${latitude}, ${longitude}`,
        );
        return;
      }

      const locationData = {
        userId: socket.userId,
        userType: socket.userType,
        latitude: latNum,
        longitude: lngNum,
        timestamp: now,
      };

      // Lưu vị trí vào Redis (safe wrapper)
      await safeRedisHSet(`location:${socket.userId}`, locationData);
      await safeRedisExpire(`location:${socket.userId}`, 300); // TTL 5 phút

      // Broadcast tới trip room nếu có tripId
      if (tripId) {
        io.to(`trip_${tripId}`).emit("locationUpdate", locationData);
      }

      emitAdminLog("location", {
        userId: socket.userId,
        userType: socket.userType,
        lat: latNum,
        lng: lngNum,
        tripId,
        socketId: socket.id,
      });

      console.log(
        `[Default] Location updated for user ${socket.userId}: ${latNum}, ${lngNum}`,
      );
    } catch (error) {
      console.error("[Default] Update location error:", error);
    }
  });

  // Disconnect handler
  socket.on("disconnect", async () => {
    try {
      console.log(`[Default] Client disconnected: ${socket.id}`);

      if (socket.userId) {
        // Xóa khỏi Map
        const userSockets = userConnections.get(socket.userId);
        if (userSockets) {
          const index = userSockets.indexOf(socket.id);
          if (index > -1) {
            userSockets.splice(index, 1);
          }
          if (userSockets.length === 0) {
            userConnections.delete(socket.userId);
          }
        }

        // Xóa khỏi Redis (socket mapping theo userType)
        await removeUserSocket(
          socket.userType || "unknown",
          socket.userId,
          socket.id,
        );

        // Xóa khỏi tất cả các rooms trong Redis
        const rooms = Array.from(socket.rooms);
        for (const room of rooms) {
          await safeRedisSRem(`socket:room:${room}`, socket.id);
        }

        // Clear throttle state
        locationUpdateThrottle.delete(socket.id);
      }
    } catch (error) {
      console.error("[Default] Disconnect cleanup error:", error);
    }
  });
});

// ===========================================
// EXPRESS API ENDPOINTS
// ===========================================

// Response helper
const sendSuccess = (res, data = null) => {
  return res.status(200).json({ success: true, data });
};

const sendError = (res, statusCode, message) => {
  return res.status(statusCode).json({ success: false, error: message });
};

// API: POST /driver/event
// Headers: user_id
// Body: { trip_id, socket_event }
app.post("/driver/event", async (req, res) => {
  try {
    const userId = req.headers["user_id"];
    const { trip_id: tripId, socket_event: socketEvent } = req.body;

    // Validate input
    if (!userId) {
      return sendError(res, 400, "user_id invalid");
    }
    if (!tripId) {
      return sendError(res, 400, "trip_id invalid");
    }
    if (!socketEvent) {
      return sendError(res, 400, "socket_event invalid");
    }

    // Emit event tới driver (chỉ 1 socket per driver)
    const emitted = await emitToDriver(userId, socketEvent, tripId);
    if (!emitted) {
      return sendError(res, 404, "user_id is not exist");
    }

    const logMsg = `[API] <b>Emit</b> <code>${socketEvent}</code> to driver userId=<code>${userId}</code>, tripId=<code>${tripId}</code>`;
    console.log(logMsg);
    sendTelegramLog(logMsg);
    emitAdminLog("emit", {
      event: socketEvent,
      target: userId,
      tripId,
      source: "api",
    });

    return sendSuccess(res, { userId, tripId, socketEvent });
  } catch (error) {
    console.error("[API] /driver/event error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// API: POST /customer/event
// Headers: user_id
// Body: { trip_id, socket_event }
app.post("/customer/event", async (req, res) => {
  try {
    const userId = req.headers["user_id"];
    const { trip_id: tripId, socket_event: socketEvent } = req.body;

    // Validate input
    if (!userId) {
      return sendError(res, 400, "user_id invalid");
    }
    if (!tripId) {
      return sendError(res, 400, "trip_id invalid");
    }
    if (!socketEvent) {
      return sendError(res, 400, "socket_event invalid");
    }

    // Tìm tất cả socket của customer
    const customerSockets = customersConnected.get(userId);
    if (!customerSockets || customerSockets.length === 0) {
      return sendError(res, 404, "user_id is not exist");
    }

    // Emit event tới tất cả socket của customer
    for (const socket of customerSockets) {
      customersNamespace.to(socket.id).emit(socketEvent, tripId);
    }
    const logMsg = `[API] <b>Emit</b> <code>${socketEvent}</code> to <b>${customerSockets.length}</b> customer socket(s), userId=<code>${userId}</code>, tripId=<code>${tripId}</code>`;
    console.log(logMsg);
    sendTelegramLog(logMsg);
    emitAdminLog("emit", {
      event: socketEvent,
      target: userId,
      tripId,
      source: "api",
      socketCount: customerSockets.length,
    });

    return sendSuccess(res, {
      userId,
      tripId,
      socketEvent,
      socketCount: customerSockets.length,
    });
  } catch (error) {
    console.error("[API] /customer/event error:", error);
    return sendError(res, 500, "Internal server error");
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    connections: {
      drivers: driversConnected.size,
      customers: customersConnected.size,
      default: userConnections.size,
    },
  });
});

// ===========================================
// REDIS PUB/SUB - Nhận sự kiện từ .NET
// ===========================================
redisSub.subscribe("bechill:events", (err) => {
  if (err) {
    logError("REDIS_SUBSCRIBE", "Redis subscribe error", err);
  } else {
    logInfo("REDIS_SUBSCRIBE", "Subscribed to Redis channel", {
      channel: "bechill:events",
    });
  }
});

redisSub.on("message", async (channel, message) => {
  let traceLogs = [];
  try {
    let event;
    try {
      event = JSON.parse(message);
    } catch (err) {
      logError("REDIS_EVENT", "Invalid JSON", err, { raw: message });
      return; // FIX: tránh crash server
    }

    logInfo("REDIS_EVENT", "Received raw message", {
      channel,
      raw: message?.substring?.(0, 200),
    });

    emitAdminLog("redis", event);
    traceLogs.push(`[Redis] Nhận event: ${JSON.stringify(event)}`);
    logInfo("REDIS_EVENT", "Parsed event", {
      eventName: event.eventName,
      type: event.type,
      userId: event.payload?.data || event.payload?.userId,
    });

    logDebug("FLOW", "Start processing event", {
      eventName: event.eventName,
      type: event.type,
    });

    // Chuẩn hóa các event bookingTrip:Request, bookingTrip:Canceled:{tripId}, ...
    if (event.payload && event.payload.data) {
      // Có thể event.eventName là "bookingTrip:Started" hoặc "bookingTrip:Started:{tripId}" (từ backend)
      let baseEventName = event.eventName;
      // payload.data có thể là tripId trực tiếp (string GUID) hoặc object {tripId, ...meta}.
      // Khi là object, lấy tripId field để build event name; nếu không có cũng fallback xuống parts.
      let tripId =
        typeof event.payload.data === "object" && event.payload.data !== null
          ? event.payload.data.tripId
          : event.payload.data;

      // Nếu eventName có kèm tripId, trích tripId từ eventName để đồng bộ
      const parts = (event.eventName || "").split(":");
      if (parts.length >= 3 && parts[0] === "bookingTrip") {
        baseEventName = `${parts[0]}:${parts[1]}`;
        if (!tripId) {
          tripId = parts.slice(2).join(":");
        }
      }

      const tripRoom = `trip_${tripId}`;

      // Helper để push log trace
      const traceEmit = (namespace, room, eventName, payload = undefined) => {
        traceLogs.push(
          `\uD83D\uDE97 Emit <code>${eventName}</code> tới <b>${room}</b> (namespace: <code>${namespace.name}</code>)\nPayload: <code>${JSON.stringify(payload)}</code>`,
        );
        emitAdminLog("emit", {
          namespace: namespace.name,
          room,
          event: eventName,
          payload,
        });
      };

      // Khách tạo chuyến
      if (baseEventName === "bookingTrip:Request") {
        // driverId may come via payload.driverId (newer format) or event.target (legacy format)
        const driverId =
          event.payload?.driverId || event.target || event.payload?.target;
        const payload = event.payload;

        // Log full event info for debugging
        logInfo("SOCKET_EMIT", "Process bookingTrip:Request", {
          event: "bookingTrip:Request",
          tripId,
          driverId,
          payload,
        });

        if (driverId) {
          // Gửi chỉ định tới đúng tài xế (nếu có driverId)
          const sent = await emitToDriver(
            driverId,
            "bookingTrip:Request",
            tripId,
          );
          logInfo(
            "SOCKET_EMIT",
            sent
              ? "Emit bookingTrip:Request to assigned driver"
              : "No connected driver found for assigned driverId (skipping broadcast)",
            {
              event: "bookingTrip:Request",
              room: tripRoom,
              tripId,
              driverId,
              payload,
            },
          );
          traceLogs.push(
            sent
              ? `[Redis] Emitted bookingTrip:Request to driverId=${driverId}`
              : `[Redis] No connected driver found for driverId=${driverId} (skipping broadcast)`,
          );
          if (!sent) {
            // NOTE: Do not broadcast to all drivers. Keeping log for visibility.
            logInfo(
              "SOCKET_EMIT",
              "Skipping broadcast to all drivers for bookingTrip:Request",
              {
                event: "bookingTrip:Request",
                tripId,
                driverId,
                reason: "driver not connected",
              },
            );
            traceLogs.push(
              `[Redis] Skipped broadcasting bookingTrip:Request to all drivers (driver not connected)`,
            );
          }
        } else {
          // NOTE: Do not broadcast to all drivers. Log the decision for debugging.
          logInfo(
            "SOCKET_EMIT",
            "Skip emit bookingTrip:Request to all drivers (no driverId)",
            {
              event: "bookingTrip:Request",
              tripId,
              payload,
            },
          );
          traceLogs.push(
            `[Redis] Skipped broadcasting bookingTrip:Request to all drivers (no driverId)`,
          );
          // driversNamespace.emit("bookingTrip:Request", tripId);
        }

        await sendTelegramLog(traceLogs.join("\n"));
        return;
      }

      // Khách hủy chuyến
      if (baseEventName === "bookingTrip:Canceled") {
        const cancelEvent = `bookingTrip:Canceled:${tripId}`;
        io.to(tripRoom).emit(cancelEvent);
        traceEmit(io, tripRoom, cancelEvent);
        logInfo("SOCKET_EMIT", "Emit to trip room", {
          event: cancelEvent,
          room: tripRoom,
        });
        driversNamespace.to(tripRoom).emit(cancelEvent);
        traceEmit(driversNamespace, tripRoom, cancelEvent);
        customersNamespace.to(tripRoom).emit(cancelEvent);
        traceEmit(customersNamespace, tripRoom, cancelEvent);

        // Gửi trực tiếp cho tài xế nếu có driverId (chỉ 1 socket per driver)
        const driverId = event.payload.driverId;
        if (driverId) {
          const sent = await emitToDriver(driverId, cancelEvent);
          if (sent) {
            traceLogs.push(
              `[Redis] Emitted ${cancelEvent} trực tiếp tới driverId=${driverId} (1 socket)`,
            );
          } else {
            traceLogs.push(
              `[Redis] Không tìm thấy socket kết nối cho driverId=${driverId}`,
            );
          }
        }
        await sendTelegramLog(traceLogs.join("\n"));
        return;
      }

      // Tài xế chấp nhận chuyến
      if (baseEventName === "bookingTrip:AcceptedTrip") {
        const acceptEvent = `bookingTrip:AcceptedTrip:${tripId}`;
        io.to(tripRoom).emit(acceptEvent);
        traceEmit(io, tripRoom, acceptEvent);
        logInfo("SOCKET_EMIT", "Emit to trip room", {
          event: acceptEvent,
          room: tripRoom,
        });

        customersNamespace.to(tripRoom).emit(acceptEvent);
        traceEmit(customersNamespace, tripRoom, acceptEvent);
        console.log(
          `[Redis] Emit ${acceptEvent} to trip room ${tripRoom} and customers namespace${event.target}`,
        );
        // Nếu target customerId được gắn, emit trực tiếp tới tất cả socketId trong room customer_{id}
        if (event.target) {
          await emitToCustomer(event.target, acceptEvent, tripId);
        }

        await sendTelegramLog(traceLogs.join("\n"));
        return;
      }

      // Tài xế đến điểm đón
      if (baseEventName === "bookingTrip:ToPickUp") {
        const toPickupEvent = `bookingTrip:ToPickUp:${tripId}`;
        io.to(tripRoom).emit(toPickupEvent);
        traceEmit(io, tripRoom, toPickupEvent);
        logInfo("SOCKET_EMIT", "Emit to trip room", {
          event: toPickupEvent,
          room: tripRoom,
        });
        driversNamespace.to(tripRoom).emit(toPickupEvent);
        traceEmit(driversNamespace, tripRoom, toPickupEvent);
        customersNamespace.to(tripRoom).emit(toPickupEvent);
        traceEmit(customersNamespace, tripRoom, toPickupEvent);
        // Nếu target customerId được gắn, emit trực tiếp tới tất cả socketId trong room customer_{id}
        if (event.target) {
          await emitToCustomer(event.target, toPickupEvent, tripId);
        }
        await sendTelegramLog(traceLogs.join("\n"));
        return;
      }

      // Tài xế hủy chuyến
      if (baseEventName === "bookingTrip:DriverCanceled") {
        const driverCancelEvent = `bookingTrip:Canceled:${tripId}`;
        io.to(tripRoom).emit(driverCancelEvent);
        traceEmit(io, tripRoom, driverCancelEvent);
        logInfo("SOCKET_EMIT", "Emit to trip room", {
          event: driverCancelEvent,
          room: tripRoom,
        });

        customersNamespace.to(tripRoom).emit(driverCancelEvent);
        traceEmit(customersNamespace, tripRoom, driverCancelEvent);
        // Nếu target customerId được gắn, emit trực tiếp tới tất cả socketId trong room customer_{id}
        if (event.target) {
          await emitToCustomer(event.target, driverCancelEvent, tripId);
        }
        await sendTelegramLog(traceLogs.join("\n"));
        return;
      }

      // Tài xế bắt đầu chuyến
      if (baseEventName === "bookingTrip:Started") {
        const startedEvent = `bookingTrip:Started:${tripId}`;
        io.to(tripRoom).emit(startedEvent, tripId);
        traceEmit(io, tripRoom, startedEvent, tripId);
        logInfo("SOCKET_EMIT", "Emit to trip room", {
          event: startedEvent,
          room: tripRoom,
        });
        driversNamespace.to(tripRoom).emit(startedEvent, tripId);
        traceEmit(driversNamespace, tripRoom, startedEvent, tripId);
        customersNamespace.to(tripRoom).emit(startedEvent, tripId);
        traceEmit(customersNamespace, tripRoom, startedEvent, tripId);
        // Nếu target customerId được gắn, emit trực tiếp tới tất cả socketId trong room customer_{id}
        if (event.target) {
          await emitToCustomer(event.target, startedEvent, tripId);
        }
        await sendTelegramLog(traceLogs.join("\n"));
        return;
      }

      // Tài xế hoàn thành chuyến
      if (baseEventName === "bookingTrip:Completed") {
        const completedEvent = `bookingTrip:Completed:${tripId}`;
        const completedPayload = event.payload?.data ?? tripId;
        io.to(tripRoom).emit(completedEvent, completedPayload);
        traceEmit(io, tripRoom, completedEvent, completedPayload);
        logInfo("SOCKET_EMIT", "Emit to trip room", {
          event: completedEvent,
          room: tripRoom,
        });
        driversNamespace.to(tripRoom).emit(completedEvent, completedPayload);
        traceEmit(driversNamespace, tripRoom, completedEvent, completedPayload);
        customersNamespace.to(tripRoom).emit(completedEvent, completedPayload);
        traceEmit(
          customersNamespace,
          tripRoom,
          completedEvent,
          completedPayload,
        );
        // Nếu target customerId được gắn, emit trực tiếp tới tất cả socketId trong room customer_{id}
        if (event.target) {
          await emitToCustomer(event.target, completedEvent, completedPayload);
        }

        await sendTelegramLog(traceLogs.join("\n"));
        return;
      }

      // Tài xế hoàn thành chuyến với vấn đề
      if (baseEventName === "bookingTrip:CompletedWithProblem") {
        const completedWithProblemEvent = `bookingTrip:CompletedWithProblem:${tripId}`;
        const problemData = event.payload.problemDescription
          ? { tripId, problemDescription: event.payload.problemDescription }
          : tripId;
        io.to(tripRoom).emit(completedWithProblemEvent, problemData);
        traceEmit(io, tripRoom, completedWithProblemEvent, problemData);
        logInfo("SOCKET_EMIT", "Emit to trip room", {
          event: completedWithProblemEvent,
          room: tripRoom,
        });
        driversNamespace
          .to(tripRoom)
          .emit(completedWithProblemEvent, problemData);
        traceEmit(
          driversNamespace,
          tripRoom,
          completedWithProblemEvent,
          problemData,
        );
        customersNamespace
          .to(tripRoom)
          .emit(completedWithProblemEvent, problemData);
        traceEmit(
          customersNamespace,
          tripRoom,
          completedWithProblemEvent,
          problemData,
        );
        // Nếu target customerId được gắn, emit trực tiếp tới tất cả socketId trong room customer_{id}
        if (event.target) {
          await emitToCustomer(event.target, completedWithProblemEvent, tripId);
        }
        await sendTelegramLog(traceLogs.join("\n"));
        return;
      }
    }

    // Giữ nguyên các event khác
    const { type, target, eventName, payload } = event;
    emitAdminLog("emit", { type, target, eventName, payload });
    switch (type) {
      case "user":
        if (target) {
          const userType = payload?.userType || "customer";
          const actualData = payload?.data;

          // Special case: admin monitoring clients
          if (target === "admins" || target === "admin") {
            if (adminNamespace) {
              adminNamespace.emit(eventName, actualData);
              traceLogs.push(
                `[Redis] Emitted ${eventName} to admin namespace (target=${target})`,
              );
              logInfo("SOCKET_EMIT", "Emit to admin namespace", {
                event: eventName,
                target,
              });
            } else {
              traceLogs.push(
                `[Redis] Attempt to emit ${eventName} to admin namespace, but admin monitoring is disabled`,
              );
              logWarn("SOCKET_EMIT", "Admin namespace disabled, can\'t emit", {
                event: eventName,
                target,
              });
            }
            break;
          }

          if (target === "drivers" || target === "customers") {
            const namespace =
              target === "drivers" ? driversNamespace : customersNamespace;
            namespace.emit(eventName, actualData);
            io.emit(eventName, actualData);
            traceLogs.push(`[Redis] Broadcasted ${eventName} to all ${target}`);
            console.log(`[Redis] Broadcasted ${eventName} to all ${target}`);
          } else {
            const userRoom = `${userType}_${target}`;
            // Gửi tới room user
            if (userType === "driver") {
              driversNamespace.to(userRoom).emit(eventName, actualData);
            } else if (userType === "customer") {
              customersNamespace.to(userRoom).emit(eventName, actualData);
            }
            // Gửi trực tiếp cho socketId nếu có
            if (userType === "driver") {
              const sent = await emitToDriver(target, eventName, actualData);
              if (sent) {
                traceLogs.push(
                  `[Redis] Emitted ${eventName} trực tiếp tới driverId=${target} (1 socket)`,
                );
              } else {
                traceLogs.push(
                  `[Redis] Không tìm thấy socket kết nối cho driverId=${target}`,
                );
              }
            } else {
              const keyNew = `socket:uid:${userType}:${target}`;
              let userSocketIds = await redis.smembers(keyNew);
              if (
                (!userSocketIds || userSocketIds.length === 0) &&
                userType === "customer"
              ) {
                // Backward compatibility: legacy key
                userSocketIds = await redis.smembers(`socket:user:${target}`);
              }

              if (userSocketIds && userSocketIds.length > 0) {
                for (const socketId of userSocketIds) {
                  customersNamespace.to(socketId).emit(eventName, actualData);
                  traceLogs.push(
                    `[Redis] Emitted ${eventName} trực tiếp tới userId=${target}, socketId=${socketId}`,
                  );
                }
              } else {
                traceLogs.push(
                  `[Redis] Không tìm thấy socketId cho userId=${target}`,
                );
              }
            }
            traceLogs.push(
              `[Redis] Emitted ${eventName} to user room: ${userRoom} (userType: ${userType})`,
            );
            console.log(
              `[Redis] Emitted ${eventName} to user room: ${userRoom} (userType: ${userType})`,
            );
          }
        }
        break;

      case "trip":
        if (target) {
          const tripRoom = `trip_${target}`;
          io.to(tripRoom).emit(eventName, payload);
          driversNamespace.to(tripRoom).emit(eventName, payload);
          customersNamespace.to(tripRoom).emit(eventName, payload);
          traceLogs.push(
            `[Redis] Emitted ${eventName} to trip room: ${tripRoom}`,
          );
          console.log(`[Redis] Emitted ${eventName} to trip room: ${tripRoom}`);
        }
        break;

      case "broadcast":
        if (target) {
          io.to(target).emit(eventName, payload);
          driversNamespace.to(target).emit(eventName, payload);
          customersNamespace.to(target).emit(eventName, payload);
          traceLogs.push(`[Redis] Broadcasted ${eventName} to ${target}`);
          console.log(`[Redis] Broadcasted ${eventName} to ${target}`);
        } else {
          io.emit(eventName, payload);
          driversNamespace.emit(eventName, payload);
          customersNamespace.emit(eventName, payload);
          traceLogs.push(`[Redis] Broadcasted ${eventName} to all`);
          console.log(`[Redis] Broadcasted ${eventName} to all`);
        }
        break;

      default:
        traceLogs.push(`[Redis] Unknown event type: ${type}`);
        console.warn("[Redis] Unknown event type:", type);
    }
    logDebug("FLOW", "Finished processing event", {
      eventName: event.eventName,
      type: event.type,
    });

    await sendTelegramLog(traceLogs.join("\n"));
  } catch (error) {
    traceLogs.push(`[Redis] Message handler error: ${error?.message || error}`);
    logError("REDIS_EVENT", "Message handler error", error, {
      raw: message,
    });
    await sendTelegramLog(traceLogs.join("\n"));
  }
});

// ===========================================
// START SERVER
// ===========================================
server.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`Socket.io server is running on port ${PORT}`);
  console.log(`Namespaces: /, /drivers, /customers`);
  console.log(
    `Redis: ${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || 6379}`,
  );
  console.log(`===========================================`);

  // Send startup environment info to Telegram (only non-sensitive vars)
  try {
    const startupEnv = {
      PORT: process.env.PORT || PORT,
      REDIS_HOST: process.env.REDIS_HOST || "localhost",
      REDIS_PORT: process.env.REDIS_PORT || 6379,
      ENVIRONMENT:
        process.env.NODE_ENV ||
        process.env.ENVIRONMENT ||
        process.env.ASPNETCORE_ENVIRONMENT ||
        "unknown",
      TELEGRAM_LOG_CHAT_ID: process.env.TELEGRAM_LOG_CHAT_ID || null,
      TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || null,
      TELEGRAM_LEVEL: process.env.TELEGRAM_LEVEL || "INFO",
    };
    sendTelegramLog(
      formatTelegram(
        "INFO",
        "Startup",
        "SocketServer starting with environment",
        startupEnv,
      ),
    ).catch(() => {});
  } catch (err) {
    console.error("[Startup] sendTelegramLog error:", err?.message || err);
  }
});

// ===========================================
// GRACEFUL SHUTDOWN
// ===========================================
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  try {
    // Đóng tất cả kết nối socket
    const allSockets = await io.fetchSockets();
    const driverSockets = await driversNamespace.fetchSockets();
    const customerSockets = await customersNamespace.fetchSockets();

    console.log(
      `Disconnecting ${allSockets.length + driverSockets.length + customerSockets.length} socket(s)...`,
    );

    allSockets.forEach((socket) => socket.disconnect(true));
    driverSockets.forEach((socket) => socket.disconnect(true));
    customerSockets.forEach((socket) => socket.disconnect(true));

    // Đóng Redis connections
    await redis.quit();
    await redisSub.quit();
    console.log("Redis connections closed");

    // Đóng Socket.io server
    io.close(() => {
      console.log("Socket.io server closed");

      // Đóng HTTP server
      server.close(() => {
        console.log("HTTP server closed");
        process.exit(0);
      });
    });

    // Force exit after 10 seconds nếu không thể graceful shutdown
    setTimeout(() => {
      console.error(
        "Could not close connections in time, forcefully shutting down",
      );
      process.exit(1);
    }, 10000);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  shutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  shutdown("UNHANDLED_REJECTION");
});
