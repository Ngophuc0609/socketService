const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_REDIS_FALLBACK_TTL_SECONDS,
  resolveRedisTtlPolicy,
} = require("../../src/config/env");

test("resolveRedisTtlPolicy keeps configured TTLs when SQL is available", () => {
  const redis = {
    socketTtlSeconds: 30 * 24 * 60 * 60,
    locationTtlSeconds: 300,
    maxFallbackTtlSeconds: MAX_REDIS_FALLBACK_TTL_SECONDS,
  };

  const resolved = resolveRedisTtlPolicy(redis, true);

  assert.equal(resolved.socketTtlSeconds, redis.socketTtlSeconds);
  assert.equal(resolved.locationTtlSeconds, redis.locationTtlSeconds);
});

test("resolveRedisTtlPolicy caps Redis TTLs to seven days when SQL is unavailable", () => {
  const redis = {
    socketTtlSeconds: 30 * 24 * 60 * 60,
    locationTtlSeconds: 10 * 24 * 60 * 60,
    maxFallbackTtlSeconds: 30 * 24 * 60 * 60,
  };

  const resolved = resolveRedisTtlPolicy(redis, false);

  assert.equal(resolved.socketTtlSeconds, MAX_REDIS_FALLBACK_TTL_SECONDS);
  assert.equal(resolved.locationTtlSeconds, MAX_REDIS_FALLBACK_TTL_SECONDS);
});

