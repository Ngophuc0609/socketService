# Developer Guide

Cap nhat: 2026-05-20. Huong dan nay dua tren source hien tai va khong yeu cau sua code.

## Dan chung source chinh

| Chu de | File/function cu the |
| --- | --- |
| Scripts | `package.json` |
| Runtime entry | `server.js`, `src/index.js:start()` |
| Runtime composition | `src/app/createRuntime.js:createRuntime()` |
| HTTP routes | `src/transports/http/registerHttpRoutes.js:registerHttpRoutes()` |
| Socket flows | `src/transports/socket/registerSocketFlows.js:registerSocketFlows()` |
| Redis relay | `src/transports/redis/subscribeBackendEvents.js:subscribeBackendEvents()` |
| Tests | `test/**/*.test.js` |
| Validation scripts | `scripts/phase6/*.js` |

## Setup local

1. Cai dependencies:

```bash
npm install
```

2. Chuan bi `.env`:

```env
PORT=8605
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
CORS_ORIGIN=*
JWT_SECRET=
ADMIN_MONITOR=false
SQL_ENABLED=false
```

3. Dam bao Redis reachable truoc khi test socket/relay.

Neu muon test SQL optional, bat `SQL_ENABLED=true`, cau hinh `SQL_DRIVER` va connection env. Cai driver package tuong ung (`mysql2`, `pg`, hoac `mssql`) truoc khi start.

## Run commands

```bash
npm start
npm run dev
npm run start:modular
npm run dev:modular
npm test
```

Ghi chu: `npm start` chay `node server.js`, va `server.js` load `./src/index`; vi vay production script hien di vao runtime modular.

## Socket demo HTML

Runtime serve static demo tai:

```text
http://localhost:8605/demo/socket-demo.html
```

File source: `public/socket-demo.html`.

Demo nay ket noi legacy `/`, `/drivers`, `/customers`, optional `/admin`; co nut test `joinTrip`, `leaveTrip`, `updateLocation`, `/emit/trip`, `/emit/user`, `/emit/broadcast`, cac event demo `chat:*`, `notification:new`, `bookingTrip:*` va `system:notice`. De browser ket noi role namespaces, socket middleware chap nhan them `handshake.auth.token` va `handshake.auth.userId` ngoai headers.

## Staging validation commands

```bash
npm run test:preflight:staging
npm run test:contract:staging
npm run test:soak:staging
npm run test:phase6:gate
```

Dan chung:

- `scripts/phase6/runPreflightCheck.js`
- `scripts/phase6/runContractTest.js`
- `scripts/phase6/runSoakTest.js`
- `scripts/phase6/runPhase6Gate.js`

## Tim logic theo task

| Task | Noi bat dau doc |
| --- | --- |
| Them/sua HTTP route | `src/transports/http/registerHttpRoutes.js` |
| Them/sua socket event | `src/transports/socket/registerSocketFlows.js` |
| Sua auth token | `src/modules/auth/authService.js` |
| Sua join/leave trip | `src/modules/trip/tripRoomService.js` |
| Sua update location | `src/modules/location/locationService.js`, `src/shared/utils/validateLocation.js` |
| Sua backend Redis event mapping | `src/modules/relay/redisRelayService.js` |
| Sua emit den driver/customer/trip | `src/modules/connection/socketEmitterService.js` |
| Sua Redis key convention | `src/shared/constants/redisKeys.js` |
| Sua metrics | `src/infrastructure/monitoring/runtimeMetrics.js` |
| Sua env | `src/config/env.js` |
| Sua logs/Telegram | `logger.js`, `src/infrastructure/logging/loggerPort.js` |

## Cach doc mot flow moi

1. Bat dau tu transport entry: HTTP route, socket event, hoac Redis subscriber.
2. Lan sang service/module duoc inject trong `createRuntime()`.
3. Kiem tra Redis keys neu co state.
4. Kiem tra metrics/logging side effects.
5. Tim test gan nhat trong `test/`.

Vi du luong booking Redis:

- `subscribeBackendEvents()` nhan message.
- `relayGenericEvent()` detect `bookingTrip:*`.
- `relayBookingEvent()` map event.
- `socketEmitterService` emit den user neu can.

## Validation nen lam khi thay doi socket flow

- Test namespace `/drivers` va `/customers` vi auth/registry khac nhau.
- Test namespace `/` neu event co backward compatibility.
- Test disconnect/reconnect de dam bao cleanup Redis va memory registry.
- Test customer multi-socket va driver single-active.
- Test Redis outage neu thay doi safe Redis behavior.

Dan chung: `test/transports/socket/registerSocketFlows.test.js`.

## Validation nen lam khi thay doi HTTP routes

- Test status code 400/401/404/500 neu co validation/auth.
- Test metrics `recordHttpRequest()`.
- Test response shape `{ success, data/error }`.
- Cap nhat `postman_collection.json` neu them public route.

Dan chung: `test/transports/http/registerHttpRoutes.test.js`.

## Validation nen lam khi thay doi auth/config

- Test `authService.verifyUserToken()` voi valid/expired/invalid token.
- Test missing `JWT_SECRET` behavior neu `NODE_ENV=staging`.
- Test admin token `role=admin`.
- Kiem tra `.env.staging.example` dong bo voi `readEnv()` va scripts.

Dan chung: `test/modules/auth/authService.test.js`, `scripts/phase6/runPreflightCheck.js`.

## Chua tim thay trong source

- Khong thay lint/format command trong `package.json`.
- Khong thay Dockerfile/docker-compose de setup Redis + service.
- Khong thay test integration tu dong khoi dong Redis local.
- Khong thay OpenAPI generation.
- Khong thay CI workflow file trong repo.
