const { roomSocketKey } = require("../../shared/constants/redisKeys");

function createTripRoomService({ safeRedisOps, socketTtlSeconds }) {
  async function joinTrip(socket, tripId) {
    const room = `trip_${tripId}`;
    await socket.join(room);
    await safeRedisOps.sadd(roomSocketKey(room), socket.id);
    await safeRedisOps.expire(roomSocketKey(room), socketTtlSeconds);
    return room;
  }

  async function leaveTrip(socket, tripId) {
    const room = `trip_${tripId}`;
    await socket.leave(room);
    await safeRedisOps.srem(roomSocketKey(room), socket.id);
    return room;
  }

  return {
    joinTrip,
    leaveTrip,
  };
}

module.exports = { createTripRoomService };
