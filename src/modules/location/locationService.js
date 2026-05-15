const { locationKey } = require("../../shared/constants/redisKeys");
const { validateLocation } = require("../../shared/utils/validateLocation");

function createLocationService({ safeRedisOps, locationTtlSeconds }) {
  const throttleBySocket = new Map();

  function isThrottled(socketId, now = Date.now()) {
    const last = throttleBySocket.get(socketId);
    if (last && now - last < 1000) return true;
    throttleBySocket.set(socketId, now);
    return false;
  }

  async function persistLocation({
    userId,
    userType,
    latitude,
    longitude,
    timestamp,
  }) {
    await safeRedisOps.hset(locationKey(userId), {
      userId,
      userType,
      latitude,
      longitude,
      timestamp,
    });
    await safeRedisOps.expire(locationKey(userId), locationTtlSeconds);
  }

  function normalize(latitude, longitude) {
    return validateLocation(latitude, longitude);
  }

  function clearSocket(socketId) {
    throttleBySocket.delete(socketId);
  }

  return {
    isThrottled,
    persistLocation,
    normalize,
    clearSocket,
  };
}

module.exports = { createLocationService };
