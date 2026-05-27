function createSafeRedisOps(redis, loggerPort) {
  async function run(opName, fn, details = {}) {
    try {
      return await fn();
    } catch (error) {
      loggerPort.error("REDIS", `${opName} failed`, error, details);
      return null;
    }
  }

  return {
    hset: (key, value) => {
      const args = typeof value === "object" && value !== null && !(value instanceof Map)
        ? Object.entries(value).flat()
        : [value];
      return run("hset", () => redis.hset(key, ...args), { key });
    },
    sadd: (key, ...values) =>
      run("sadd", () => redis.sadd(key, ...values), { key }),
    srem: (key, ...values) =>
      run("srem", () => redis.srem(key, ...values), { key }),
    del: (key) => run("del", () => redis.del(key), { key }),
    expire: (key, ttl) =>
      run("expire", () => redis.expire(key, ttl), { key, ttl }),
    smembers: (key) => run("smembers", () => redis.smembers(key), { key }),
    scard: (key) => run("scard", () => redis.scard(key), { key }),
  };
}

module.exports = { createSafeRedisOps };
