# Testing And Compliance Checklist

Cap nhat: 2026-05-20. Checklist nay dung de kiem thu lai sau moi thay doi runtime, socket flow, HTTP emit API, Redis, SQL optional hoac demo tooling.

## Nguyen tac chung

- [ ] Khong doi ten event/socket payload contract neu khong co yeu cau breaking change ro rang.
- [ ] Kiem tra ca 3 namespace user: `/`, `/drivers`, `/customers`.
- [ ] Neu sua auth/admin, kiem tra them `/admin`.
- [ ] Redis loi khong lam crash process; loi phai duoc log.
- [ ] SQL database la optional; thieu DB hoac connect loi khong duoc chan startup.
- [ ] Neu SQL unavailable, Redis TTL runtime khong vuot 7 ngay.
- [ ] Logger/Telegram dung helper hien co, khong them `console.log` runtime tuy tien.
- [ ] Khong commit secret that vao docs/env/example.

## Local startup

- [ ] `npm install` da chay thanh cong khi co dependency moi.
- [ ] `.env` co Redis reachable.
- [ ] Neu khong test SQL, dat `SQL_ENABLED=false` hoac de SQL unavailable va xac nhan service van start.
- [ ] `npm start` start service thanh cong.
- [ ] Log boot co port va environment.
- [ ] Neu SQL unavailable, co log scope `SQL` thong bao fallback.
- [ ] Neu `TELEGRAM_CHAT_ID` va `TELEGRAM_LEVEL` phu hop, SQL unavailable/error se duoc dua vao Telegram queue.

## Automated tests

- [ ] Chay `npm test`.
- [ ] Tat ca test pass.
- [ ] Neu sua HTTP routes, co test trong `test/transports/http/registerHttpRoutes.test.js`.
- [ ] Neu sua socket flows, co test trong `test/transports/socket/registerSocketFlows.test.js`.
- [ ] Neu sua auth, co test trong `test/modules/auth/authService.test.js`.
- [ ] Neu sua Redis relay, co test trong `test/modules/relay/redisRelayService.test.js`.
- [ ] Neu sua metrics, co test trong `test/infrastructure/monitoring/runtimeMetrics.test.js`.
- [ ] Neu sua config/TTL, co test trong `test/config/env.test.js`.
- [ ] Neu sua SQL optional, co test trong `test/infrastructure/sql/createSqlDatabase.test.js`.

## HTTP monitoring routes

- [ ] `GET /health` tra `status: "OK"`.
- [ ] `/health.connections` co `drivers`, `customers`, `default`.
- [ ] `/health.metrics` co socket/http/redis counters.
- [ ] `/health.sql` phan anh dung `available`, `configured`, `driver`, `reason`.
- [ ] `GET /metrics` tra content type `text/plain; version=0.0.4`.
- [ ] `/metrics` co `socket_connections_active`, `socket_events_total`, `redis_messages_total`, `http_requests_total`.
- [ ] `GET /connections` tra danh sach theo all.
- [ ] `GET /connections?type=driver` chi tra drivers.
- [ ] `GET /connections?type=invalid` tra 400.
- [ ] `GET /dashboard` render HTML.
- [ ] `GET /demo/socket-demo.html` render demo HTML.

## HTTP emit APIs

- [ ] `POST /emit/user` reject 401 khi thieu `x-api-key`/Bearer neu `JWT_SECRET` configured.
- [ ] `POST /emit/user` validate `userType=driver|customer`.
- [ ] `POST /emit/user` tra 404 khi user offline/khong co mapping.
- [ ] `POST /emit/trip` validate `tripId`.
- [ ] `POST /emit/trip` emit den room `trip_{tripId}`.
- [ ] `POST /emit/broadcast` validate `userType=all|driver|customer|admin`.
- [ ] Legacy `POST /driver/event` van giu payload `trip_id` va `socket_event`.
- [ ] Legacy `POST /customer/event` van giu payload `trip_id` va `socket_event`.
- [ ] Response success giu format `{ success: true, data }`.
- [ ] Response error giu format `{ success: false, error }`.

## Socket namespace `/`

- [ ] Client connect duoc legacy namespace `/`.
- [ ] `updateLocation` truoc `authenticate` tra `error` voi `"Not authenticated"`.
- [ ] `authenticate { userId, userType }` tra `authenticated`.
- [ ] Sau authenticate, socket join user room `${userType}_${userId}`.
- [ ] `joinTrip { tripId }` tra `joinedTrip`.
- [ ] `leaveTrip { tripId }` tra `leftTrip`.
- [ ] `updateLocation` hop le broadcast `locationUpdate` den room trip.
- [ ] Disconnect cleanup memory registry va Redis mapping.

## Socket namespace `/drivers`

- [ ] Handshake header `Authorization: Bearer <token>` + `user_id` hoat dong.
- [ ] Browser handshake `auth.token` + `auth.userId` hoat dong.
- [ ] Thieu token bi reject.
- [ ] Thieu user id bi reject.
- [ ] JWT invalid bi reject khi `JWT_SECRET` configured.
- [ ] Moi driver chi co 1 active socket; socket moi disconnect socket cu.
- [ ] Driver join room `driver_{userId}`.
- [ ] `joinTrip`, `leaveTrip`, `updateLocation` hoat dong.
- [ ] Disconnect cleanup registry, Redis user key, socket info va room membership.

## Socket namespace `/customers`

- [ ] Handshake header Bearer + `user_id` hoat dong.
- [ ] Browser handshake `auth.token` + `auth.userId` hoat dong.
- [ ] Customer co the co nhieu active sockets.
- [ ] Customer join room `customer_{userId}`.
- [ ] Emit den customer fanout den tat ca socket cung user.
- [ ] `joinTrip`, `leaveTrip`, `updateLocation` hoat dong.
- [ ] Disconnect 1 socket khong xoa customer registry neu con socket khac.

## Socket namespace `/admin`

- [ ] Khi `ADMIN_MONITOR=false`, `/admin` khong duoc tao.
- [ ] Khi `ADMIN_MONITOR=true`, token admin hop le connect duoc.
- [ ] Admin token phai co JWT HS256 hop le va `role=admin`.
- [ ] Token non-admin bi reject.
- [ ] `admin:joinTrip` join room `trip_{tripId}`.
- [ ] `admin:getDrivers` tra `admin:drivers`.
- [ ] `admin:emitTest` emit event vao room chi dinh.
- [ ] Disconnect admin ghi metrics/log.

## Redis behavior

- [ ] Redis client tao duoc command/subscriber clients.
- [ ] `socket:uid:{userType}:{userId}` duoc set TTL.
- [ ] `socket:info:{socketId}` duoc set TTL.
- [ ] `socket:room:{roomName}` duoc set TTL.
- [ ] `location:{userId}` duoc set TTL.
- [ ] Neu SQL unavailable, TTL socket/user/room khong vuot `604800` giay.
- [ ] Neu SQL available, TTL dung config `REDIS_SOCKET_TTL_SECONDS` va `REDIS_LOCATION_TTL_SECONDS`.
- [ ] Redis operation loi duoc safe wrapper log va khong throw ra handler.
- [ ] Redis message invalid JSON tang invalid metrics va log loi.

## Redis Pub/Sub relay

- [ ] Subscribe dung `REDIS_CHANNEL` hoac default `bechill:events`.
- [ ] `bookingTrip:Request` emit den driver target.
- [ ] `bookingTrip:Canceled` emit `bookingTrip:Canceled:{tripId}`.
- [ ] `bookingTrip:AcceptedTrip` emit `bookingTrip:AcceptedTrip:{tripId}`.
- [ ] `bookingTrip:ToPickUp` emit `bookingTrip:ToPickUp:{tripId}`.
- [ ] `bookingTrip:DriverCanceled` map thanh `bookingTrip:Canceled:{tripId}`.
- [ ] `bookingTrip:Started` emit `bookingTrip:Started:{tripId}`.
- [ ] `bookingTrip:Completed` emit `bookingTrip:Completed:{tripId}`.
- [ ] `bookingTrip:CompletedWithProblem` emit `bookingTrip:CompletedWithProblem:{tripId}`.
- [ ] Generic `type=user` route dung target/userType.
- [ ] Generic `type=trip` emit den `trip_{target}`.
- [ ] Generic `type=broadcast` emit namespace/room dung contract.

## SQL optional database

- [ ] `SQL_ENABLED=false` bo qua SQL va service van start.
- [ ] Thieu SQL config log error va service van start.
- [ ] Sai/khong cai driver package log error va service van start.
- [ ] Connect SQL loi log error va service van start.
- [ ] Connect SQL thanh cong log info va Redis TTL khong bi cap 7 ngay.
- [ ] Shutdown goi `sqlDatabase.close()`.
- [ ] Log SQL khong in password/connection string secret.

## Socket demo HTML

- [ ] Mo duoc `http://localhost:8605/demo/socket-demo.html`.
- [ ] Connect all ket noi duoc legacy, driver, customer voi token demo khi `JWT_SECRET` empty/backward-compatible.
- [ ] Neu `JWT_SECRET` configured, token demo phai thay bang JWT hop le.
- [ ] Join trip tu demo co `joinedTrip`.
- [ ] Update location tu demo co `locationUpdate`.
- [ ] Trip buttons emit duoc `bookingTrip:*`.
- [ ] Chat tab emit duoc `chat:message`, `chat:typing`, `chat:read`.
- [ ] Notification tab emit duoc `notification:new`.
- [ ] Broadcast tab emit duoc `system:notice`.
- [ ] Custom tab emit duoc body JSON tuy chinh.
- [ ] Admin tab hoat dong khi `ADMIN_MONITOR=true` va admin token hop le.

## Security checks

- [ ] Khong log `JWT_SECRET`, `ADMIN_JWT_SECRET`, `SQL_PASSWORD`, `REDIS_PASSWORD`, `TELEGRAM_BOT_TOKEN`.
- [ ] HTTP `/emit/*` khong pass khi secret sai.
- [ ] Admin token non-admin bi reject.
- [ ] User namespace reject token invalid khi co `JWT_SECRET`.
- [ ] Neu dung browser auth fallback, token van di qua `verifyUserToken()`.
- [ ] CORS/origin deployment duoc cau hinh bang `CORS_ORIGIN`, khong de `*` neu moi truong yeu cau han che.

## Documentation

- [ ] Cap nhat `document/01-project-overview.md` neu them capability moi.
- [ ] Cap nhat `document/02-architecture.md` neu doi dependency graph/layer.
- [ ] Cap nhat `document/04-api-endpoints-and-event-contracts.md` neu doi route/event contract.
- [ ] Cap nhat `document/data-flow.md` neu doi luong runtime.
- [ ] Cap nhat `document/auth-security.md` neu doi auth/secret.
- [ ] Cap nhat `document/config-env.md` neu them env.
- [ ] Cap nhat `document/developer-guide.md` neu doi cach run/test/demo.
- [ ] Cap nhat checklist nay neu them tinh nang/chinh sach moi.

