function registerHttpRoutes({
  app,
  registry,
  socketEmitter,
  loggerPort,
  runtimeMetrics,
  authService,
  sqlStatus,
}) {
  // Middleware to require secret key or JWT for backend emit APIs
  function requireBackendSecret(req, res, next) {
    // Accept either x-api-key header or Authorization: Bearer <token>
    const headers = req.headers || {};
    const apiKey = headers["x-api-key"] || headers["x-api_key"];
    const bearer = headers["authorization"];
    const userSecret = (authService && authService.userSecret) || undefined;
    let valid = false;
    let reason = "";

    if (userSecret && bearer) {
      // Validate JWT
      const token = authService.parseBearer(bearer);
      const result = authService.verifyUserToken(token);
      valid = result.valid;
      reason = result.reason;
    } else if (userSecret && apiKey) {
      // Accept raw secret for trusted backend
      valid = apiKey === userSecret;
      reason = valid ? "ok" : "invalid_api_key";
    } else if (!userSecret && (apiKey || bearer)) {
      // If no secret configured, allow for backward compatibility
      valid = true;
      reason = "secret_not_configured";
    }

    if (!valid) {
      record(req.path, 401);
      return sendError(
        res,
        401,
        `Unauthorized: ${reason || "missing or invalid secret"}`,
      );
    }
    return next();
  }
  function renderDashboardHtml() {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BeChill Realtime Dashboard</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap");

    :root {
      --bg-0: #08111e;
      --bg-1: #101f36;
      --ink-0: #e9f1ff;
      --ink-1: #9eb2d1;
      --accent-0: #2ee6a6;
      --accent-1: #36c7ff;
      --warn: #ff8f3d;
      --err: #ff5f6d;
      --card: rgba(11, 21, 36, 0.78);
      --border: rgba(117, 155, 216, 0.28);
      --glow: 0 16px 44px rgba(7, 14, 28, 0.55);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Space Grotesk", "Segoe UI", sans-serif;
      color: var(--ink-0);
      background:
        radial-gradient(1200px 700px at -10% -10%, rgba(46, 230, 166, 0.18), transparent 40%),
        radial-gradient(1000px 700px at 110% -10%, rgba(54, 199, 255, 0.2), transparent 42%),
        linear-gradient(145deg, var(--bg-0) 0%, var(--bg-1) 62%, #0b192d 100%);
    }

    .layout {
      width: min(1220px, 94vw);
      margin: 28px auto 40px;
      display: grid;
      gap: 18px;
    }

    .hero {
      border: 1px solid var(--border);
      background: linear-gradient(120deg, rgba(46, 230, 166, 0.12), rgba(54, 199, 255, 0.1));
      backdrop-filter: blur(6px);
      border-radius: 18px;
      padding: 18px 20px;
      box-shadow: var(--glow);
    }

    .hero h1 {
      margin: 0;
      font-size: clamp(1.25rem, 2.8vw, 2rem);
      letter-spacing: 0.01em;
    }

    .hero p {
      margin: 8px 0 0;
      color: var(--ink-1);
      font-size: 0.95rem;
    }

    .alert-banner {
      border: 1px solid rgba(117, 155, 216, 0.35);
      background: rgba(16, 31, 54, 0.84);
      border-radius: 12px;
      padding: 10px 12px;
      color: var(--ink-1);
      font-size: 0.92rem;
    }

    .alert-banner.warn {
      border-color: rgba(255, 143, 61, 0.65);
      color: #ffd7bf;
      background: rgba(78, 42, 21, 0.68);
    }

    .alert-banner.err {
      border-color: rgba(255, 95, 109, 0.65);
      color: #ffd0d5;
      background: rgba(78, 22, 29, 0.68);
    }

    .section {
      border: 1px solid var(--border);
      background: var(--card);
      border-radius: 16px;
      padding: 14px;
      box-shadow: var(--glow);
    }

    .section h2 {
      margin: 0 0 10px;
      font-size: 1rem;
      letter-spacing: 0.04em;
    }

    .filter-row {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }

    .filter-row label {
      color: var(--ink-1);
      font-size: 0.84rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .filter-row select {
      background: rgba(7, 13, 24, 0.9);
      color: var(--ink-0);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px 10px;
      font-family: "Space Grotesk", "Segoe UI", sans-serif;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
      gap: 12px;
    }

    .card {
      border: 1px solid var(--border);
      background: var(--card);
      border-radius: 14px;
      padding: 12px;
      box-shadow: var(--glow);
    }

    .label {
      font-size: 0.78rem;
      color: var(--ink-1);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin: 0 0 8px;
    }

    .value {
      margin: 0;
      font-size: clamp(1.25rem, 2.8vw, 1.95rem);
      font-weight: 700;
    }

    .spark-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 12px;
    }

    .spark-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px;
      background: rgba(8, 16, 29, 0.85);
    }

    .spark-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 6px;
    }

    .spark-title {
      margin: 0;
      font-size: 0.84rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--ink-1);
    }

    .spark-value {
      margin: 0;
      font-family: "IBM Plex Mono", Consolas, monospace;
      font-size: 0.85rem;
      color: var(--ink-0);
    }

    .sparkline {
      width: 100%;
      height: 66px;
      display: block;
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(54, 199, 255, 0.1), rgba(54, 199, 255, 0));
    }

    .ok { color: var(--accent-0); }
    .warn { color: var(--warn); }
    .err { color: var(--err); }

    .table-wrap { overflow-x: auto; }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 420px;
      font-size: 0.92rem;
    }

    th,
    td {
      border-bottom: 1px solid rgba(117, 155, 216, 0.2);
      text-align: left;
      padding: 8px 6px;
    }

    th {
      color: var(--ink-1);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 500;
    }

    .mono {
      font-family: "IBM Plex Mono", Consolas, monospace;
      font-size: 0.85rem;
      color: #c8d8f0;
      overflow-wrap: anywhere;
    }

    .footer {
      color: var(--ink-1);
      font-size: 0.85rem;
      text-align: right;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <main class="layout">
    <section class="hero">
      <h1>BeChill Realtime Metrics Dashboard</h1>
      <p>Live snapshot from /health and /metrics. Auto refresh every 5s.</p>
    </section>

    <section class="section">
      <div class="filter-row">
        <label for="namespaceFilter">Namespace Filter</label>
        <select id="namespaceFilter">
          <option value="all">all</option>
        </select>
      </div>
      <div id="alertBanner" class="alert-banner">HTTP error rate is healthy.</div>
      <section class="grid" id="topCards">
        <article class="card"><p class="label">Service</p><p class="value" id="serviceStatus">...</p></article>
        <article class="card"><p class="label">Active Sockets</p><p class="value" id="activeSockets">0</p></article>
        <article class="card"><p class="label">Socket Events</p><p class="value" id="socketEvents">0</p></article>
        <article class="card"><p class="label">Relay Events</p><p class="value" id="relayEvents">0</p></article>
        <article class="card"><p class="label">Redis Messages</p><p class="value" id="redisMessages">0</p></article>
        <article class="card"><p class="label">HTTP Error Rate</p><p class="value" id="httpErrorRate">0%</p></article>
      </section>
    </section>

    <section class="section">
      <h2>Mini Trend (per 5s)</h2>
      <div class="spark-grid">
        <article class="spark-card">
          <div class="spark-head">
            <p class="spark-title">Socket Events Delta</p>
            <p class="spark-value" id="socketSparkNow">0</p>
          </div>
          <svg id="socketSparkline" class="sparkline" viewBox="0 0 240 66" preserveAspectRatio="none"></svg>
        </article>
        <article class="spark-card">
          <div class="spark-head">
            <p class="spark-title">Redis Messages Delta</p>
            <p class="spark-value" id="redisSparkNow">0</p>
          </div>
          <svg id="redisSparkline" class="sparkline" viewBox="0 0 240 66" preserveAspectRatio="none"></svg>
        </article>
        <article class="spark-card">
          <div class="spark-head">
            <p class="spark-title">HTTP Requests Delta</p>
            <p class="spark-value" id="httpSparkNow">0</p>
          </div>
          <svg id="httpSparkline" class="sparkline" viewBox="0 0 240 66" preserveAspectRatio="none"></svg>
        </article>
      </div>
    </section>

    <section class="section">
      <h2>Connections by Namespace</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Namespace</th><th>Active</th></tr></thead>
          <tbody id="connectionsTable"></tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <h2>HTTP Routes</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Route</th><th>Total</th><th>Errors</th><th>Error %</th></tr></thead>
          <tbody id="httpRoutesTable"></tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <h2>Last Refresh</h2>
      <p class="mono" id="lastRefresh">Waiting for first data...</p>
    </section>

    <p class="footer">Dashboard endpoint: /dashboard</p>
  </main>

  <script>
    const ALERT_WARN_THRESHOLD = 0.05;
    const ALERT_CRITICAL_THRESHOLD = 0.2;
    const MAX_POINTS = 36;
    const historyState = { socket: [], redis: [], http: [] };
    let lastTotals = null;
    let activeNamespace = "all";

    function fmtNumber(value) {
      const n = Number(value || 0);
      return Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
    }

    function fmtPercent(value) {
      return (Number(value || 0) * 100).toFixed(1) + "%";
    }

    function statusClassByRate(rate) {
      if (rate > ALERT_CRITICAL_THRESHOLD) return "err";
      if (rate > ALERT_WARN_THRESHOLD) return "warn";
      return "ok";
    }

    function setText(id, text, extraClass) {
      const el = document.getElementById(id);
      el.textContent = text;
      el.className = "value" + (extraClass ? " " + extraClass : "");
    }

    function syncNamespaceFilter(connections) {
      const select = document.getElementById("namespaceFilter");
      const currentValues = new Set(Array.from(select.options).map((opt) => opt.value));
      Object.keys(connections || {}).forEach((name) => {
        if (!currentValues.has(name)) {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          select.appendChild(opt);
        }
      });

      if (!Array.from(select.options).some((opt) => opt.value === activeNamespace)) {
        activeNamespace = "all";
        select.value = "all";
      }
    }

    function filterConnections(connections) {
      if (activeNamespace === "all") return connections;
      const value = Number((connections || {})[activeNamespace] || 0);
      const filtered = {};
      filtered[activeNamespace] = value;
      return filtered;
    }

    function renderConnections(connections) {
      const tbody = document.getElementById("connectionsTable");
      const rows = Object.entries(connections || {}).map(function(entry) {
        return "<tr><td>" + entry[0] + "</td><td>" + fmtNumber(entry[1]) + "</td></tr>";
      });
      tbody.innerHTML = rows.join("");
    }

    function renderRoutes(routeStats) {
      const tbody = document.getElementById("httpRoutesTable");
      const rows = Object.entries(routeStats || {}).map(function(entry) {
        const route = entry[0];
        const info = entry[1] || {};
        const total = Number(info.total || 0);
        const errors = Number(info.errors || 0);
        const rate = total === 0 ? 0 : errors / total;
        return (
          "<tr><td>" +
          route +
          "</td><td>" +
          fmtNumber(total) +
          "</td><td>" +
          fmtNumber(errors) +
          "</td><td class=\"" +
          statusClassByRate(rate) +
          "\">" +
          fmtPercent(rate) +
          "</td></tr>"
        );
      });
      tbody.innerHTML = rows.join("");
    }

    function parsePrometheusValue(metricsText, metricName) {
      const row = metricsText
        .split("\n")
        .find(function(line) {
          return line.startsWith(metricName + " ");
        });
      if (!row) return 0;
      const raw = row.split(" ").pop();
      const value = Number(raw);
      return Number.isFinite(value) ? value : 0;
    }

    function pushHistory(key, value) {
      const list = historyState[key];
      list.push(Math.max(0, Number(value || 0)));
      if (list.length > MAX_POINTS) list.shift();
    }

    function buildSparkPolyline(values, width, height) {
      if (!values.length) return "";
      if (values.length === 1) {
        const y = height - 4;
        return "0," + y + " " + width + "," + y;
      }

      const max = Math.max.apply(null, values);
      const min = Math.min.apply(null, values);
      const range = Math.max(1, max - min);

      return values
        .map(function(v, index) {
          const x = (index / (values.length - 1)) * width;
          const y = height - ((v - min) / range) * (height - 8) - 4;
          return x.toFixed(2) + "," + y.toFixed(2);
        })
        .join(" ");
    }

    function renderSparkline(svgId, valueId, values, color) {
      const svg = document.getElementById(svgId);
      const nowValue = values.length ? values[values.length - 1] : 0;
      document.getElementById(valueId).textContent = fmtNumber(nowValue);

      const points = buildSparkPolyline(values, 240, 66);
      const areaPoints = points ? points + " 240,66 0,66" : "0,66 240,66";
      svg.innerHTML =
        "<polygon points=\"" +
        areaPoints +
        "\" fill=\"" +
        color +
        "22\"></polygon>" +
        "<polyline points=\"" +
        points +
        "\" fill=\"none\" stroke=\"" +
        color +
        "\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></polyline>";
    }

    function updateAlert(errorRate) {
      const banner = document.getElementById("alertBanner");
      banner.className = "alert-banner " + statusClassByRate(errorRate);

      if (errorRate > ALERT_CRITICAL_THRESHOLD) {
        banner.textContent = "Critical: HTTP error rate is " + fmtPercent(errorRate) + " (threshold > 20%).";
        return;
      }
      if (errorRate > ALERT_WARN_THRESHOLD) {
        banner.textContent = "Warning: HTTP error rate is " + fmtPercent(errorRate) + " (threshold > 5%).";
        return;
      }
      banner.textContent = "HTTP error rate is healthy at " + fmtPercent(errorRate) + ".";
    }

    async function fetchHealth() {
      const response = await fetch("/health", { cache: "no-store" });
      if (!response.ok) throw new Error("/health " + response.status);
      return response.json();
    }

    async function fetchMetrics() {
      const response = await fetch("/metrics", { cache: "no-store" });
      if (!response.ok) throw new Error("/metrics " + response.status);
      return response.text();
    }

    function updateHistoryFromTotals(totals) {
      if (!totals) return;

      if (!lastTotals) {
        lastTotals = {
          socketEvents: Number(totals.socketEvents || 0),
          redisMessages: Number(totals.redisMessages || 0),
          httpRequests: Number(totals.httpRequests || 0),
        };
        return;
      }

      const socketDelta = Number(totals.socketEvents || 0) - lastTotals.socketEvents;
      const redisDelta = Number(totals.redisMessages || 0) - lastTotals.redisMessages;
      const httpDelta = Number(totals.httpRequests || 0) - lastTotals.httpRequests;

      pushHistory("socket", socketDelta);
      pushHistory("redis", redisDelta);
      pushHistory("http", httpDelta);

      lastTotals = {
        socketEvents: Number(totals.socketEvents || 0),
        redisMessages: Number(totals.redisMessages || 0),
        httpRequests: Number(totals.httpRequests || 0),
      };
    }

    function updateUi(health, metricsText) {
      const totals = health.metrics || {};
      const connections = health.connections || {};
      syncNamespaceFilter(connections);

      const filteredConnections = filterConnections(connections);
      const activeSockets = Object.values(filteredConnections).reduce(function(acc, cur) {
        return acc + Number(cur || 0);
      }, 0);

      const httpRequests = Number(totals.httpRequests || 0);
      const httpErrors = Number(totals.httpErrors || 0);
      const errorRate = httpRequests === 0 ? 0 : httpErrors / httpRequests;

      setText("serviceStatus", health.status === "OK" ? "Healthy" : "Degraded", health.status === "OK" ? "ok" : "warn");
      setText("activeSockets", fmtNumber(activeSockets));
      setText("socketEvents", fmtNumber(parsePrometheusValue(metricsText, "socket_events_total")));
      setText("relayEvents", fmtNumber(parsePrometheusValue(metricsText, "relay_events_total")));
      setText("redisMessages", fmtNumber(parsePrometheusValue(metricsText, "redis_messages_total")));
      setText("httpErrorRate", fmtPercent(errorRate), statusClassByRate(errorRate));

      updateAlert(errorRate);
      updateHistoryFromTotals(totals);
      renderSparkline("socketSparkline", "socketSparkNow", historyState.socket, "#2ee6a6");
      renderSparkline("redisSparkline", "redisSparkNow", historyState.redis, "#36c7ff");
      renderSparkline("httpSparkline", "httpSparkNow", historyState.http, "#ff8f3d");

      renderConnections(filteredConnections);
      renderRoutes((health.metricsDetail && health.metricsDetail.byHttpRoute) || {});

      const ts = new Date().toLocaleString("en-US", { hour12: false });
      document.getElementById("lastRefresh").textContent =
        ts + " | startedAt: " + (health.startedAt || "n/a") + " | namespace: " + activeNamespace;
    }

    document.getElementById("namespaceFilter").addEventListener("change", function(event) {
      activeNamespace = event.target.value || "all";
    });

    async function tick() {
      try {
        const results = await Promise.all([fetchHealth(), fetchMetrics()]);
        updateUi(results[0], results[1]);
      } catch (error) {
        setText("serviceStatus", "Unreachable", "err");
        document.getElementById("lastRefresh").textContent = "Fetch failed: " + error.message;
      }
    }

    tick();
    setInterval(tick, 5000);
  </script>
</body>
</html>`;
  }

  function record(route, statusCode) {
    if (!runtimeMetrics) return;
    runtimeMetrics.recordHttpRequest(route, statusCode);
  }

  const sendSuccess = (res, data = null) =>
    res.status(200).json({ success: true, data });
  const sendError = (res, statusCode, message) =>
    res.status(statusCode).json({ success: false, error: message });

  function isSupportedUserType(userType) {
    return userType === "driver" || userType === "customer";
  }

  async function emitToUserCompat(userType, userId, eventName, payload) {
    if (typeof socketEmitter.emitToUser === "function") {
      return socketEmitter.emitToUser(userType, userId, eventName, payload);
    }

    if (userType === "driver") {
      return socketEmitter.emitToDriver(userId, eventName, payload);
    }

    return socketEmitter.emitToCustomer(userId, eventName, payload);
  }

  app.get("/health", (req, res) => {
    record("/health", 200);

    const metricsSnapshot = runtimeMetrics ? runtimeMetrics.snapshot() : null;

    res.status(200).json({
      status: "OK",
      timestamp: new Date().toISOString(),
      startedAt: metricsSnapshot ? metricsSnapshot.startedAt : undefined,
      sql: sqlStatus
        ? {
            available: sqlStatus.available,
            configured: sqlStatus.configured,
            driver: sqlStatus.driver,
            reason: sqlStatus.reason,
          }
        : undefined,
      connections: registry.counters(),
      metrics: metricsSnapshot ? metricsSnapshot.totals : undefined,
      metricsDetail: metricsSnapshot
        ? {
            byEvent: metricsSnapshot.byEvent,
            byHttpRoute: metricsSnapshot.byHttpRoute,
          }
        : undefined,
    });
  });

  function serializeRegistryConnections(map) {
    return Array.from(map.entries()).map(([userId, value]) => {
      let socketIds = [];
      if (Array.isArray(value)) {
        socketIds = value.map((socket) => (socket && socket.id ? socket.id : socket));
      } else if (value && value.id) {
        socketIds = [value.id];
      }
      return { userId, socketIds };
    });
  }

  function buildConnections(type) {
    if (!type) {
      return {
        drivers: serializeRegistryConnections(registry.drivers),
        customers: serializeRegistryConnections(registry.customers),
        default: serializeRegistryConnections(registry.legacy),
      };
    }

    switch (type.toLowerCase()) {
      case "driver":
      case "drivers":
        return { drivers: serializeRegistryConnections(registry.drivers) };
      case "customer":
      case "customers":
        return { customers: serializeRegistryConnections(registry.customers) };
      case "default":
      case "legacy":
      case "user":
        return { default: serializeRegistryConnections(registry.legacy) };
      default:
        return null;
    }
  }

  app.get("/connections", (req, res) => {
    record("/connections", 200);

    const type = req.query.type;
    const connections = buildConnections(type);
    if (connections === null) {
      record("/connections", 400);
      return sendError(
        res,
        400,
        "Invalid type. Supported values are driver, customer, default",
      );
    }

    return sendSuccess(res, {
      type: type || "all",
      connections,
    });
  });

  app.get("/metrics", (req, res) => {
    record("/metrics", 200);

    if (!runtimeMetrics) {
      return res.status(503).json({
        success: false,
        error: "Runtime metrics unavailable",
      });
    }

    res.setHeader("Content-Type", "text/plain; version=0.0.4");
    return res.status(200).send(runtimeMetrics.toPrometheus());
  });

  app.get("/dashboard", (req, res) => {
    record("/dashboard", 200);

    const healthSnapshot = {
      status: "OK",
      startedAt: runtimeMetrics ? runtimeMetrics.snapshot().startedAt : null,
      sql: sqlStatus
        ? {
            available: sqlStatus.available,
            configured: sqlStatus.configured,
            driver: sqlStatus.driver,
            reason: sqlStatus.reason,
          }
        : null,
      connections: registry.counters(),
      metrics: runtimeMetrics ? runtimeMetrics.snapshot().totals : {},
      metricsDetail: runtimeMetrics
        ? { byHttpRoute: runtimeMetrics.snapshot().byHttpRoute }
        : { byHttpRoute: {} },
    };

    const html = renderDashboardHtml().replace(
      "Waiting for first data...",
      `Boot snapshot: ${JSON.stringify(healthSnapshot)}`,
    );

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  });

  app.post("/driver/event", async (req, res) => {
    try {
      const userId = req.headers["user_id"] || req.headers["userid"];
      const { trip_id: tripId, socket_event: socketEvent } = req.body || {};

      if (!userId) {
        record("/driver/event", 400);
        return sendError(res, 400, "user_id invalid");
      }
      if (!tripId) {
        record("/driver/event", 400);
        return sendError(res, 400, "trip_id invalid");
      }
      if (!socketEvent) {
        record("/driver/event", 400);
        return sendError(res, 400, "socket_event invalid");
      }

      const result = await socketEmitter.emitToDriver(
        userId,
        socketEvent,
        tripId,
      );
      if (!result.emitted) {
        record("/driver/event", 404);
        return sendError(res, 404, "user_id is not exist");
      }

      loggerPort.info("HTTP_EMIT", "Emitted driver event", {
        userId,
        tripId,
        socketEvent,
        socketIds: result.socketIds,
      });

      record("/driver/event", 200);
      return sendSuccess(res, { userId, tripId, socketEvent });
    } catch (error) {
      loggerPort.error("HTTP_EMIT", "Failed to emit driver event", error);
      record("/driver/event", 500);
      return sendError(res, 500, "Internal server error");
    }
  });

  app.post("/customer/event", async (req, res) => {
    try {
      const userId = req.headers["user_id"] || req.headers["userid"];
      const { trip_id: tripId, socket_event: socketEvent } = req.body || {};

      if (!userId) {
        record("/customer/event", 400);
        return sendError(res, 400, "user_id invalid");
      }
      if (!tripId) {
        record("/customer/event", 400);
        return sendError(res, 400, "trip_id invalid");
      }
      if (!socketEvent) {
        record("/customer/event", 400);
        return sendError(res, 400, "socket_event invalid");
      }

      const result = await socketEmitter.emitToCustomer(
        userId,
        socketEvent,
        tripId,
      );
      if (!result.emitted) {
        record("/customer/event", 404);
        return sendError(res, 404, "user_id is not exist");
      }

      loggerPort.info("HTTP_EMIT", "Emitted customer event", {
        userId,
        tripId,
        socketEvent,
        socketIds: result.socketIds,
      });

      record("/customer/event", 200);
      return sendSuccess(res, {
        userId,
        tripId,
        socketEvent,
        socketCount: result.socketIds.length,
      });
    } catch (error) {
      loggerPort.error("HTTP_EMIT", "Failed to emit customer event", error);
      record("/customer/event", 500);
      return sendError(res, 500, "Internal server error");
    }
  });

  app.post("/emit/user", requireBackendSecret, async (req, res) => {
    try {
      const { userType, userId, eventName, payload = null } = req.body || {};

      if (!isSupportedUserType(userType)) {
        record("/emit/user", 400);
        return sendError(res, 400, "userType invalid (driver|customer)");
      }

      if (!userId) {
        record("/emit/user", 400);
        return sendError(res, 400, "userId invalid");
      }

      if (!eventName) {
        record("/emit/user", 400);
        return sendError(res, 400, "eventName invalid");
      }

      const result = await emitToUserCompat(
        userType,
        userId,
        eventName,
        payload,
      );
      if (!result.emitted) {
        record("/emit/user", 404);
        return sendError(res, 404, "user_id is not exist");
      }

      loggerPort.info("HTTP_EMIT", "Emitted backend user event", {
        userType,
        userId,
        eventName,
        socketIds: result.socketIds,
      });

      record("/emit/user", 200);
      return sendSuccess(res, {
        userType,
        userId,
        eventName,
        socketCount: Array.isArray(result.socketIds)
          ? result.socketIds.length
          : 0,
      });
    } catch (error) {
      loggerPort.error("HTTP_EMIT", "Failed to emit backend user event", error);
      record("/emit/user", 500);
      return sendError(res, 500, "Internal server error");
    }
  });

  app.post("/emit/trip", requireBackendSecret, async (req, res) => {
    try {
      const { tripId, eventName, payload = null } = req.body || {};

      if (!tripId) {
        record("/emit/trip", 400);
        return sendError(res, 400, "tripId invalid");
      }

      if (!eventName) {
        record("/emit/trip", 400);
        return sendError(res, 400, "eventName invalid");
      }

      if (typeof socketEmitter.emitToTrip !== "function") {
        record("/emit/trip", 501);
        return sendError(
          res,
          501,
          "Trip emit is not supported by current runtime",
        );
      }

      const result = await socketEmitter.emitToTrip(tripId, eventName, payload);

      loggerPort.info("HTTP_EMIT", "Emitted backend trip event", {
        tripId,
        eventName,
        room: result.room,
      });

      record("/emit/trip", 200);
      return sendSuccess(res, {
        tripId,
        eventName,
        room: result.room || `trip_${tripId}`,
      });
    } catch (error) {
      loggerPort.error("HTTP_EMIT", "Failed to emit backend trip event", error);
      record("/emit/trip", 500);
      return sendError(res, 500, "Internal server error");
    }
  });

  app.post("/emit/broadcast", requireBackendSecret, async (req, res) => {
    try {
      const {
        eventName,
        payload = null,
        userType = "all",
        targetRoom = null,
      } = req.body || {};

      const allowedUserTypes = ["all", "driver", "customer", "admin"];
      if (!allowedUserTypes.includes(userType)) {
        record("/emit/broadcast", 400);
        return sendError(
          res,
          400,
          "userType invalid (all|driver|customer|admin)",
        );
      }

      if (!eventName) {
        record("/emit/broadcast", 400);
        return sendError(res, 400, "eventName invalid");
      }

      if (typeof socketEmitter.emitBroadcast !== "function") {
        record("/emit/broadcast", 501);
        return sendError(
          res,
          501,
          "Broadcast emit is not supported by current runtime",
        );
      }

      await socketEmitter.emitBroadcast(eventName, payload, {
        userType,
        targetRoom,
      });

      loggerPort.info("HTTP_EMIT", "Emitted backend broadcast event", {
        eventName,
        userType,
        targetRoom,
      });

      record("/emit/broadcast", 200);
      return sendSuccess(res, {
        eventName,
        userType,
        targetRoom,
      });
    } catch (error) {
      loggerPort.error(
        "HTTP_EMIT",
        "Failed to emit backend broadcast event",
        error,
      );
      record("/emit/broadcast", 500);
      return sendError(res, 500, "Internal server error");
    }
  });
}

module.exports = { registerHttpRoutes };
