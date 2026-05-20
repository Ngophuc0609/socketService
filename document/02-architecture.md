# 02 - Architecture

Cap nhat: 2026-05-20. Tai lieu nay mo ta kien truc dang co trong source runtime modular.

## Dan chung source chinh

| Component | File/function cu the | Vai tro |
| --- | --- | --- |
| Runtime root | `src/app/createRuntime.js:createRuntime()` | Noi dependency graph va dang ky HTTP, Socket.IO, Redis subscriber. |
| HTTP transport | `src/transports/http/registerHttpRoutes.js:registerHttpRoutes()` | Express routes va dashboard. |
| Socket namespace | `src/transports/socket/registerNamespaces.js:registerNamespaces()` | Tao namespace `/`, `/drivers`, `/customers`, optional `/admin`. |
| Socket flow | `src/transports/socket/registerSocketFlows.js:registerSocketFlows()` | Middleware auth, connect/disconnect, room, location, admin events. |
| Redis subscriber | `src/transports/redis/subscribeBackendEvents.js:subscribeBackendEvents()` | Subscribe channel va chuyen message sang relay service. |
| Redis relay | `src/modules/relay/redisRelayService.js:createRedisRelayService()` | Map backend events sang socket emits. |
| Optional SQL | `src/infrastructure/sql/createSqlDatabase.js:createSqlDatabase()` | Ket noi SQL optional va tra status, khong chan startup neu loi. |
| Connection registry | `src/infrastructure/realtime/connectionRegistry.js:createConnectionRegistry()` | Memory maps cho driver/customer/legacy. |
| Redis ops | `src/infrastructure/redis/createRedisClients.js:createRedisClients()`, `src/infrastructure/redis/safeRedisOps.js:createSafeRedisOps()` | Redis clients va wrapper an toan. |
| Metrics | `src/infrastructure/monitoring/runtimeMetrics.js:createRuntimeMetrics()` | Counters, snapshot va Prometheus output. |

## Runtime dependency graph

`createRuntime()` thuc hien theo thu tu:

1. Doc config bang `readEnv()` trong `src/config/env.js`.
2. Tao logger port bang `createLoggerPort()`.
3. Neu `NODE_ENV=staging`, `REQUIRE_JWT_SECRET_ON_STAGING` khong false va thieu `JWT_SECRET`, runtime throw loi startup.
4. Tao Express app va HTTP server.
5. Tao Socket.IO server voi CORS tu `CORS_ORIGIN`, transports `websocket` va `polling`.
6. Thu ket noi SQL optional; neu SQL thieu/loi thi log/Telegram va dung Redis fallback TTL policy.
7. Tao Redis command/subscriber clients.
8. Tao `safeRedisOps`, metrics, registry va domain services.
9. Dang ky namespaces, HTTP routes, socket flows va Redis backend event subscriber.
10. Tra ve `start()` va `stop()`.

Dan chung: `src/app/createRuntime.js:createRuntime()`, `start()`, `stop()`.

## Layering hien tai

### App layer

- `src/index.js:start()` la runtime entry.
- `src/app/createRuntime.js:createRuntime()` la composition root.

### Transport layer

- HTTP: Express routes trong `registerHttpRoutes()`.
- Socket.IO: namespace registration trong `registerNamespaces()` va event handlers trong `registerSocketFlows()`.
- Redis Pub/Sub input: `subscribeBackendEvents()`.

### Module/domain layer

- Auth: `createAuthService()`.
- Trip room: `createTripRoomService()`.
- Location: `createLocationService()`.
- Connection emit helpers: `createSocketEmitterService()`.
- Redis relay mapping: `createRedisRelayService()`.

### Infrastructure/shared layer

- Redis clients/safe ops: `createRedisClients()`, `createSafeRedisOps()`.
- Runtime metrics: `createRuntimeMetrics()`.
- In-memory registry: `createConnectionRegistry()`.
- Key constants: `redisKeys.js`.
- Namespace constants: `namespaces.js`.
- Location validation: `validateLocation()`.

## Namespaces

Dan chung: `src/shared/constants/namespaces.js`, `registerNamespaces()`, `registerSocketFlows()`.

- `/`: legacy namespace, khong co middleware auth handshake; client goi `authenticate`.
- `/drivers`: middleware yeu cau `Authorization: Bearer <token>` va `user_id`/`userId`; moi driver chi co 1 socket active trong registry.
- `/customers`: middleware yeu cau Bearer + user id; moi customer co the co nhieu socket active.
- `/admin`: chi tao neu `ADMIN_MONITOR=true`; token can verify admin role.

## State model

### In-memory registry

Dan chung: `src/infrastructure/realtime/connectionRegistry.js:createConnectionRegistry()`.

- `drivers`: `Map<userId, socket>`.
- `customers`: `Map<userId, socket[]>`.
- `legacy`: `Map<userId, socketId[]>`.
- `counters()` tra so key trong moi map.

### Redis state

Dan chung: `src/shared/constants/redisKeys.js`.

- `socket:uid:{userType}:{userId}` -> Set socket ids, TTL 30 ngay.
- `socket:info:{socketId}` -> Hash `{ userId, userType, socketId, connectedAt }`, TTL 30 ngay.
- `socket:room:{roomName}` -> Set socket ids, TTL 30 ngay.
- `location:{userId}` -> Hash location, TTL 300 giay.

TTL source: `src/config/env.js:readEnv()` dat `socketTtlSeconds = 30 * 24 * 60 * 60`, `locationTtlSeconds = 300`.

Neu SQL khong available, `src/config/env.js:resolveRedisTtlPolicy()` cap moi TTL Redis runtime ve toi da 7 ngay (`604800` giay). Location TTL mac dinh 300 giay nen khong doi; socket/user/room TTL mac dinh 30 ngay se giam xuong 7 ngay.

### Optional SQL state

`createSqlDatabase()` ho tro driver `mysql`, `postgres`, `mssql` bang dynamic require. Neu package driver chua cai, SQL config thieu, sai driver hoac connect loi, runtime log error qua logger/Telegram va tiep tuc chay. Source hien chua ghi/doc business data vao SQL.

## Redis Pub/Sub architecture

Runtime tao 2 clients:

- `commandClient` cho read/write mapping va location.
- `subscribeClient` la duplicate cua command client cho Pub/Sub.

Dan chung: `src/infrastructure/redis/createRedisClients.js:createRedisClients()`.

`subscribeBackendEvents()` subscribe channel runtime `bechill:events`, parse JSON va goi `relayService.relayGenericEvent(event)`. JSON parse loi duoc log va tang invalid metrics.

Dan chung: `src/transports/redis/subscribeBackendEvents.js:subscribeBackendEvents()`.

## Emit architecture

- Emit den driver/customer dung memory registry truoc, sau do fallback Redis socket ids: `socketEmitterService.emitToDriver()`, `emitToCustomer()`.
- Emit den trip room di qua legacy root `io.to(room)` va role namespaces `/drivers`, `/customers`: `emitToTrip()`.
- Broadcast co the target theo namespace hoac room: `emitBroadcast()`.

Can luu y: source khong co Socket.IO Redis adapter. Redis socket ids fallback chi co y nghia chac chan trong mot instance; neu scale multi-instance, `namespace.to(socketId)` khong tu dong di qua process khac.

## Error handling va shutdown

Dan chung:

- Redis safe wrapper: `src/infrastructure/redis/safeRedisOps.js:createSafeRedisOps()`.
- Redis Pub/Sub parse handling: `subscribeBackendEvents()`.
- Process handlers va `stop()`: `src/app/createRuntime.js:installProcessHandlers()`, `stop()`.

Hanh vi:

- Redis command loi bi log va tra `null`, khong lam crash handler.
- Redis message invalid JSON bi catch/log.
- `stop()` disconnect tat ca sockets, quit Redis clients, close Socket.IO va HTTP server bang `Promise.allSettled`.
- Handlers cho `SIGINT`, `SIGTERM`, `uncaughtException`, `unhandledRejection` duoc cai sau khi server listen thanh cong.

## Observability architecture

- `/health` tra status, timestamp, counters, metrics snapshot.
- `/metrics` tra Prometheus text tu `runtimeMetrics.toPrometheus()`.
- `/dashboard` la HTML dashboard built-in fetch `/health` va `/metrics`.
- Logger base la JSON console + Telegram batch.

Dan chung: `registerHttpRoutes()`, `runtimeMetrics.js`, `logger.js`.

## Chua tim thay trong source

- Khong thay process manager/deployment descriptor nhu Dockerfile, docker-compose, PM2 ecosystem, systemd unit hay Kubernetes manifest.
- Khong thay Socket.IO Redis adapter cho scale ngang.
- Khong thay circuit breaker/backoff rieng cho Telegram; `flushTelegram()` log loi va tiep tuc.
- Khong thay readiness endpoint rieng co Redis ping.
- Khong thay tracing distributed ID duoc gan vao moi request/socket flow; `logger.js:attachTrace()` co ton tai nhung source runtime hien khong goi trong socket flow.
- Khong thay graceful shutdown hard timeout; `stop()` cho cac promise close/quit hoan tat bang `Promise.allSettled`.
- Khong thay SQL schema/migration/table mapping; SQL moi la optional connectivity layer.
