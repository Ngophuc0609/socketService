const Redis = require("ioredis");

function createRedisClients(redisConfig) {
  const commandClient = new Redis({
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });

  const subscribeClient = commandClient.duplicate();

  return { commandClient, subscribeClient };
}

module.exports = { createRedisClients };
