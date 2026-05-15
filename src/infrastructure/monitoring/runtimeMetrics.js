function createRuntimeMetrics() {
  const state = {
    startedAt: new Date().toISOString(),
    connections: {
      drivers: 0,
      customers: 0,
      legacy: 0,
      admin: 0,
    },
    totals: {
      socketConnections: 0,
      socketDisconnections: 0,
      socketEvents: 0,
      redisMessages: 0,
      redisInvalidMessages: 0,
      relayEvents: 0,
      httpRequests: 0,
      httpErrors: 0,
    },
    byEvent: {},
    byHttpRoute: {},
  };

  function inc(obj, key, amount = 1) {
    obj[key] = (obj[key] || 0) + amount;
  }

  function normalizeNamespace(namespace) {
    if (namespace === "/drivers") return "drivers";
    if (namespace === "/customers") return "customers";
    if (namespace === "/admin") return "admin";
    return "legacy";
  }

  function recordSocketConnect(namespace) {
    const key = normalizeNamespace(namespace);
    state.connections[key] += 1;
    state.totals.socketConnections += 1;
  }

  function recordSocketDisconnect(namespace) {
    const key = normalizeNamespace(namespace);
    state.connections[key] = Math.max(0, state.connections[key] - 1);
    state.totals.socketDisconnections += 1;
  }

  function recordSocketEvent(eventName) {
    state.totals.socketEvents += 1;
    inc(state.byEvent, eventName || "unknown");
  }

  function recordRedisMessage(valid) {
    state.totals.redisMessages += 1;
    if (!valid) {
      state.totals.redisInvalidMessages += 1;
    }
  }

  function recordRelayEvent(eventName) {
    state.totals.relayEvents += 1;
    inc(state.byEvent, eventName || "unknown");
  }

  function recordHttpRequest(route, statusCode) {
    state.totals.httpRequests += 1;
    if (statusCode >= 400) {
      state.totals.httpErrors += 1;
    }

    if (!state.byHttpRoute[route]) {
      state.byHttpRoute[route] = {
        total: 0,
        errors: 0,
      };
    }

    state.byHttpRoute[route].total += 1;
    if (statusCode >= 400) {
      state.byHttpRoute[route].errors += 1;
    }
  }

  function snapshot() {
    return {
      startedAt: state.startedAt,
      connections: { ...state.connections },
      totals: { ...state.totals },
      byEvent: { ...state.byEvent },
      byHttpRoute: { ...state.byHttpRoute },
    };
  }

  function toPrometheus() {
    const lines = [];

    lines.push(
      "# HELP socket_connections_active Active socket connections by namespace",
    );
    lines.push("# TYPE socket_connections_active gauge");
    Object.entries(state.connections).forEach(([namespace, value]) => {
      lines.push(
        `socket_connections_active{namespace=\"${namespace}\"} ${value}`,
      );
    });

    lines.push("# HELP socket_events_total Total socket events processed");
    lines.push("# TYPE socket_events_total counter");
    lines.push(`socket_events_total ${state.totals.socketEvents}`);

    lines.push("# HELP redis_messages_total Total redis messages consumed");
    lines.push("# TYPE redis_messages_total counter");
    lines.push(`redis_messages_total ${state.totals.redisMessages}`);

    lines.push(
      "# HELP redis_invalid_messages_total Total invalid redis messages",
    );
    lines.push("# TYPE redis_invalid_messages_total counter");
    lines.push(
      `redis_invalid_messages_total ${state.totals.redisInvalidMessages}`,
    );

    lines.push("# HELP relay_events_total Total relayed events");
    lines.push("# TYPE relay_events_total counter");
    lines.push(`relay_events_total ${state.totals.relayEvents}`);

    lines.push("# HELP http_requests_total Total HTTP requests by route");
    lines.push("# TYPE http_requests_total counter");
    Object.entries(state.byHttpRoute).forEach(([route, info]) => {
      lines.push(`http_requests_total{route=\"${route}\"} ${info.total}`);
      lines.push(
        `http_request_errors_total{route=\"${route}\"} ${info.errors}`,
      );
    });

    return lines.join("\n") + "\n";
  }

  return {
    recordSocketConnect,
    recordSocketDisconnect,
    recordSocketEvent,
    recordRedisMessage,
    recordRelayEvent,
    recordHttpRequest,
    snapshot,
    toPrometheus,
  };
}

module.exports = { createRuntimeMetrics };
