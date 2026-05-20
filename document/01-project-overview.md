# 01 - Overview

Cap nhat: 2026-05-20. Tai lieu nay mo ta source hien tai cua BeChill Socket Service, khong dua tren thiet ke mong muon neu khong thay trong code.

## Pham vi service

BeChill Socket Service la Node.js realtime gateway dung Express, Socket.IO va Redis. Service nhan ket noi tu driver/customer/admin, luu mapping socket trong memory + Redis, nhan event tu backend qua HTTP hoac Redis Pub/Sub, roi emit den user, room chuyen di hoac broadcast.

Service hien khong phai CRUD API cho booking/trip/user. Source chi the hien realtime delivery, monitoring va cac API emit event.

## Dan chung source chinh

| Hang muc | File/function cu the | Ket luan |
| --- | --- | --- |
| Bootstrap | `server.js`, `src/index.js:start()` | `server.js` load `.env` va require `./src/index`; `start()` tao runtime va goi `runtime.start()`. |
| Runtime composition | `src/app/createRuntime.js:createRuntime()` | Tao Express app, HTTP server, Socket.IO server, Redis clients, safe Redis ops, registry, metrics, services, routes, socket flows va Redis subscriber. |
| HTTP routes | `src/transports/http/registerHttpRoutes.js:registerHttpRoutes()` | Dinh nghia `/health`, `/connections`, `/metrics`, `/dashboard`, `/driver/event`, `/customer/event`, `/emit/user`, `/emit/trip`, `/emit/broadcast`. |
| Socket flows | `src/transports/socket/registerSocketFlows.js:registerSocketFlows()` | Dinh nghia namespace `/`, `/drivers`, `/customers`, optional `/admin` va cac event `authenticate`, `joinTrip`, `leaveTrip`, `updateLocation`, `admin:*`. |
| Redis relay | `src/transports/redis/subscribeBackendEvents.js:subscribeBackendEvents()` va `src/modules/relay/redisRelayService.js:relayGenericEvent()` | Subscribe channel backend, parse JSON va route event `bookingTrip:*`, `type=user`, `type=trip`, `type=broadcast`. |
| Redis state | `src/shared/constants/redisKeys.js` | Key conventions: `socket:uid:*`, `socket:info:*`, `socket:room:*`, `location:*`. |
| Optional SQL | `src/infrastructure/sql/createSqlDatabase.js:createSqlDatabase()` | Thu ket noi SQL neu co config; loi/thieu DB duoc log/Telegram va runtime tiep tuc chay Redis fallback. |
| Auth | `src/modules/auth/authService.js:createAuthService()` | Tu verify JWT HS256 bang secret local, khong dung thu vien JWT. |
| Logging | `logger.js:writeLog()`, `logger.js:flushTelegram()` | Log JSON ra console va batch Telegram neu co `TELEGRAM_CHAT_ID`. |
| Tests/scripts | `test/**/*.test.js`, `scripts/phase6/*.js` | Co node:test cho auth, routes, socket flows, relay, metrics; co preflight/contract/soak scripts cho staging. |

## Stack va package

Dan chung: `package.json`.

- Runtime dependencies: `express`, `socket.io`, `ioredis`, `dotenv`, `axios`.
- Dev dependencies: `nodemon`, `socket.io-client`.
- Scripts chinh: `npm start`, `npm run dev`, `npm run start:modular`, `npm run dev:modular`, `npm test`, `npm run test:phase6:gate`.

Ghi chu: `server.js` hien da chay runtime modular trong `src/index.js`, vi vay `npm start` va `npm run start:modular` deu di vao cung luong modular.

## Nguoi dung va actor nghiep vu

Dan chung: `src/transports/socket/registerSocketFlows.js` va `src/modules/relay/redisRelayService.js`.

- Driver app: ket noi namespace `/drivers`, moi driver chi giu 1 socket active trong memory registry.
- Customer app: ket noi namespace `/customers`, mot customer co the co nhieu socket active.
- Legacy client: ket noi namespace `/`, authenticate bang socket event `authenticate`.
- Admin monitor: namespace `/admin` chi duoc tao khi `ADMIN_MONITOR=true`.
- Backend service: goi HTTP emit APIs hoac publish Redis message vao channel runtime `bechill:events`.

## Capabilities hien co

- Monitoring HTTP: `/health`, `/metrics`, `/dashboard`, `/connections`.
- Legacy backend push: `/driver/event`, `/customer/event`.
- Backend push co auth: `/emit/user`, `/emit/trip`, `/emit/broadcast`.
- Socket events tu client: `authenticate`, `joinTrip`, `leaveTrip`, `updateLocation`.
- Admin socket events: `admin:joinTrip`, `admin:emitTest`, `admin:getDrivers`, `admin:setFilter`.
- Redis relay cho `bookingTrip:*` va generic `{ type, target, eventName, payload }`.
- Runtime metrics noi bo va Prometheus text format.

## Database va state

Source hien co optional SQL connectivity/config, nhung chua co schema, migration hay repository ghi/doc business data vao SQL. Redis van la state/cache/pub-sub layer dang duoc dung truc tiep cho socket runtime.

Dan chung:

- `src/infrastructure/redis/createRedisClients.js:createRedisClients()` tao `commandClient` va `subscribeClient`.
- `src/infrastructure/redis/safeRedisOps.js:createSafeRedisOps()` boc Redis command va log loi thay vi throw.
- `src/shared/constants/redisKeys.js` dinh nghia key.
- `src/infrastructure/sql/createSqlDatabase.js:createSqlDatabase()` ket noi optional `mysql|postgres|mssql` neu dependency driver duoc cai va env SQL duoc cau hinh.
- `src/config/env.js:resolveRedisTtlPolicy()` cap Redis TTL toi da 7 ngay khi SQL unavailable.

Redis dang dung cho:

- user -> socket set: `socket:uid:{userType}:{userId}`.
- socket metadata: `socket:info:{socketId}`.
- room membership tracking: `socket:room:{roomName}`.
- location cache: `location:{userId}`.
- Pub/Sub backend event channel: `bechill:events`.

## Monitoring va observability

Dan chung:

- Metrics state: `src/infrastructure/monitoring/runtimeMetrics.js:createRuntimeMetrics()`.
- Prometheus output: `runtimeMetrics.toPrometheus()`.
- Dashboard HTML: `src/transports/http/registerHttpRoutes.js:renderDashboardHtml()`.
- Logger adapter: `src/infrastructure/logging/loggerPort.js:createLoggerPort()`.
- Telegram batching: `logger.js:flushTelegram()`.

## Chua tim thay trong source

- Khong thay schema database ben vung, migration, ORM model, repository SQL/MongoDB.
- Khong thay OpenAPI/Swagger spec cho HTTP routes.
- Khong thay API CRUD cho trip, booking, driver, customer.
- Khong thay Socket.IO Redis adapter de dong bo room emit giua nhieu instance.
- Khong thay health/readiness route ping Redis truc tiep; `/health` chi tra snapshot registry/metrics va SQL status neu co runtime.
- Khong thay queue worker rieng ngoai Redis Pub/Sub subscriber trong cung process.
- Khong thay co che doi chieu `user_id` header voi `sub/userId` trong JWT payload.
