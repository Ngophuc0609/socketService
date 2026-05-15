const { userSocketKey } = require("../../shared/constants/redisKeys");

function createSocketEmitterService({
  io,
  namespaces,
  registry,
  safeRedisOps,
}) {
  async function getSocketIdsForUser(userType, userId) {
    const key = userSocketKey(userType, userId);
    const ids = await safeRedisOps.smembers(key);
    return Array.isArray(ids) ? ids : [];
  }

  async function emitToDriver(userId, event, payload) {
    if (!userId) return { emitted: false, socketIds: [] };

    const socketIds = new Set();
    const socket = registry.drivers.get(userId);

    if (socket && socket.id) {
      namespaces.drivers.to(socket.id).emit(event, payload);
      socketIds.add(socket.id);
    }

    const redisSocketIds = await getSocketIdsForUser("driver", userId);
    for (const socketId of redisSocketIds) {
      if (socketIds.has(socketId)) continue;
      namespaces.drivers.to(socketId).emit(event, payload);
      socketIds.add(socketId);
    }

    return {
      emitted: socketIds.size > 0,
      socketIds: Array.from(socketIds),
    };
  }

  async function emitToCustomer(userId, event, payload) {
    if (!userId) return { emitted: false, socketIds: [] };

    const socketIds = new Set();
    const sockets = registry.customers.get(userId) || [];

    for (const socket of sockets) {
      if (!socket || !socket.id) continue;
      namespaces.customers.to(socket.id).emit(event, payload);
      socketIds.add(socket.id);
    }

    const redisSocketIds = await getSocketIdsForUser("customer", userId);
    for (const socketId of redisSocketIds) {
      if (socketIds.has(socketId)) continue;
      namespaces.customers.to(socketId).emit(event, payload);
      socketIds.add(socketId);
    }

    return {
      emitted: socketIds.size > 0,
      socketIds: Array.from(socketIds),
    };
  }

  async function emitToUser(userType, userId, event, payload) {
    if (userType === "driver") {
      return emitToDriver(userId, event, payload);
    }
    if (userType === "customer") {
      return emitToCustomer(userId, event, payload);
    }

    return { emitted: false, socketIds: [] };
  }

  async function emitToTrip(tripId, event, payload) {
    if (!tripId || !event) {
      return { emitted: false, room: null };
    }

    const room = `trip_${tripId}`;
    if (io) {
      io.to(room).emit(event, payload);
    }
    namespaces.drivers.to(room).emit(event, payload);
    namespaces.customers.to(room).emit(event, payload);

    return {
      emitted: true,
      room,
      namespaces: ["drivers", "customers", ...(io ? ["legacy"] : [])],
    };
  }

  async function emitBroadcast(event, payload, options = {}) {
    const { targetRoom = null, userType = "all" } = options;
    if (!event) {
      return { emitted: false, userType, targetRoom };
    }

    const emitWithRoom = (namespace) => {
      if (!namespace) return;
      if (targetRoom) {
        namespace.to(targetRoom).emit(event, payload);
      } else {
        namespace.emit(event, payload);
      }
    };

    if (userType === "driver") {
      emitWithRoom(namespaces.drivers);
    } else if (userType === "customer") {
      emitWithRoom(namespaces.customers);
    } else if (userType === "admin") {
      emitWithRoom(namespaces.admin);
    } else {
      emitWithRoom(namespaces.drivers);
      emitWithRoom(namespaces.customers);
      emitWithRoom(namespaces.admin);
      if (io) {
        if (targetRoom) {
          io.to(targetRoom).emit(event, payload);
        } else {
          io.emit(event, payload);
        }
      }
    }

    return {
      emitted: true,
      userType,
      targetRoom,
    };
  }

  return {
    emitToDriver,
    emitToCustomer,
    emitToUser,
    emitToTrip,
    emitBroadcast,
  };
}

module.exports = { createSocketEmitterService };
