function subscribeBackendEvents({
  subscribeClient,
  channel,
  loggerPort,
  relayService,
  runtimeMetrics,
}) {
  subscribeClient.subscribe(channel, (error) => {
    if (error) {
      loggerPort.error("REDIS_SUBSCRIBE", "Subscribe failed", error, {
        channel,
      });
      return;
    }

    loggerPort.info("REDIS_SUBSCRIBE", "Subscribed to backend events", {
      channel,
    });
  });

  subscribeClient.on("message", (receivedChannel, message) => {
    try {
      const event = JSON.parse(message);
      if (runtimeMetrics) {
        runtimeMetrics.recordRedisMessage(true);
      }
      relayService.relayGenericEvent(event);
    } catch (error) {
      if (runtimeMetrics) {
        runtimeMetrics.recordRedisMessage(false);
      }
      loggerPort.error("REDIS_EVENT", "Invalid backend message", error, {
        channel: receivedChannel,
      });
    }
  });
}

module.exports = { subscribeBackendEvents };
