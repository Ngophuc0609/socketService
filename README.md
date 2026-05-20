# BeChill Socket Service

A Socket.IO-based realtime service for BeChill. This repo supports both a monolithic startup (`server.js`) and a modular runtime in `src/`.

## Why this service exists

- Real-time location updates for drivers/customers
- Trip event delivery over socket namespaces
- HTTP backend APIs for emitting socket events
- Redis pub/sub consumption from backend systems
- Monitoring and metrics for health, socket activity, and relay events

## Quick start

```bash
cd d:\1_WorkSpace\Workspace_\socketService
npm install
npm start
```

For modular runtime development:

```bash
npm run dev:modular
npm run start:modular
```

## Environment configuration

Copy or edit `.env`:

```env
PORT=8605
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
CORS_ORIGIN=*
```

If using the modular runtime, common config is loaded from `src/config/env.js`.

## Hướng dẫn sử dụng project

### 1. Chuẩn bị môi trường

- Cài Node.js 18+.
- Đảm bảo Redis đang chạy và service có thể kết nối tới `REDIS_HOST:REDIS_PORT`.
- Cài dependencies:

```powershell
npm install
```

Nếu chạy Redis bằng Docker trong môi trường local:

```powershell
docker run --name bechill-redis -p 6379:6379 -d redis:7
```

### 2. Cấu hình `.env`

Tạo hoặc cập nhật file `.env` ở thư mục gốc project:

```env
PORT=8605
CORS_ORIGIN=*

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_CHANNEL=bechill:events

JWT_SECRET=
ADMIN_MONITOR=false
ADMIN_JWT_SECRET=

SQL_ENABLED=false

DEBUG_SOCKET=false
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_LEVEL=ERROR
```

Ghi chú:

- `JWT_SECRET` dùng cho JWT HS256 của `/drivers`, `/customers` và các API `/emit/*`.
- Nếu `JWT_SECRET` để trống, service vẫn giữ chế độ tương thích cũ, nhưng client namespace vẫn phải gửi `Authorization: Bearer <token>`.
- Đặt `SQL_ENABLED=false` khi không dùng SQL để service chạy bằng Redis fallback mode.
- Telegram chỉ gửi log khi có `TELEGRAM_CHAT_ID`.

### 3. Chạy service

Chạy production mode:

```powershell
npm start
```

Chạy development mode với auto reload:

```powershell
npm run dev
```

Chạy trực tiếp modular runtime:

```powershell
npm run dev:modular
```

Sau khi chạy thành công, service lắng nghe tại:

```text
http://localhost:8605
```

### 4. Kiểm tra service

Kiểm tra health:

```powershell
curl.exe http://localhost:8605/health
```

Mở dashboard runtime:

```text
http://localhost:8605/dashboard
```

Xem danh sách connection hiện tại:

```powershell
curl.exe "http://localhost:8605/connections"
curl.exe "http://localhost:8605/connections?type=driver"
curl.exe "http://localhost:8605/connections?type=customer"
```

Bạn cũng có thể import `postman_collection.json` vào Postman để test các HTTP API như `/health`, `/emit/user`, `/emit/trip`, `/emit/broadcast`.

### 5. Test socket client cơ bản

Cài `socket.io-client` đã có sẵn trong dev dependencies. Tạo một script test nhanh hoặc chạy trong Node REPL:

```js
const { io } = require("socket.io-client");

const socket = io("http://localhost:8605", {
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log("connected", socket.id);

  socket.emit("authenticate", {
    userId: "driver-1",
    userType: "driver",
    token: "local-token",
  });
});

socket.on("authenticated", () => {
  socket.emit("joinTrip", { tripId: "trip-1" });
  socket.emit("updateLocation", {
    tripId: "trip-1",
    latitude: 10.762622,
    longitude: 106.660172,
  });
});

socket.on("joinedTrip", console.log);
socket.on("locationUpdate", console.log);
socket.on("error", console.error);
```

Với namespace theo role, client cần truyền token và user id ngay trong handshake. Ví dụ dưới đây phù hợp cho local dev khi `JWT_SECRET` để trống; nếu đã cấu hình `JWT_SECRET`, thay `local-token` bằng JWT HS256 hợp lệ.

```js
const { io } = require("socket.io-client");

const driverSocket = io("http://localhost:8605/drivers", {
  transports: ["websocket"],
  extraHeaders: {
    Authorization: "Bearer local-token",
    user_id: "driver-1",
  },
});

driverSocket.on("connect", () => {
  driverSocket.emit("joinTrip", { tripId: "trip-1" });
  driverSocket.emit("updateLocation", {
    tripId: "trip-1",
    latitude: 10.762622,
    longitude: 106.660172,
  });
});
```

### 6. Gửi event từ backend HTTP API

Các API `/emit/user`, `/emit/trip`, `/emit/broadcast` yêu cầu `x-api-key` hoặc `Authorization: Bearer <jwt>`. Nếu đã cấu hình `JWT_SECRET`, `x-api-key` phải bằng giá trị `JWT_SECRET`; nếu `JWT_SECRET` để trống trong local dev, service vẫn chấp nhận header này theo chế độ tương thích.

Ví dụ gửi event tới một user:

```powershell
curl.exe -X POST "http://localhost:8605/emit/user" `
  -H "Content-Type: application/json" `
  -H "x-api-key: local-secret" `
  -d "{\"userType\":\"driver\",\"userId\":\"driver-1\",\"eventName\":\"bookingTrip:Started\",\"payload\":{\"tripId\":\"trip-1\"}}"
```

Ví dụ gửi event tới một trip room:

```powershell
curl.exe -X POST "http://localhost:8605/emit/trip" `
  -H "Content-Type: application/json" `
  -H "x-api-key: local-secret" `
  -d "{\"tripId\":\"trip-1\",\"eventName\":\"bookingTrip:ToPickUp\",\"payload\":{\"status\":\"to_pick_up\"}}"
```

### 7. Chạy test

```powershell
npm test
```

Các script kiểm thử staging/phase 6:

```powershell
npm run test:contract:staging
npm run test:preflight:staging
npm run test:soak:staging
npm run test:phase6:gate
```

## Project structure overview

- `server.js` — lightweight bootstrap wrapper that loads `src/index.js`
- `src/index.js` — runtime entrypoint for the modular implementation
- `src/app/createRuntime.js` — builds and wires dependencies
- `src/transports/http/registerHttpRoutes.js` — HTTP API definitions
- `src/transports/socket/registerNamespaces.js` — socket namespace registration
- `src/transports/socket/registerSocketFlows.js` — socket event flows and handlers
- `src/transports/redis/subscribeBackendEvents.js` — Redis event relay consumer
- `src/modules/auth/authService.js` — auth parsing and verification
- `src/modules/location/locationService.js` — location validation + persistence logic
- `src/modules/trip/tripRoomService.js` — join/leave trip room logic
- `src/modules/connection/socketEmitterService.js` — cross-namespace emit helpers
- `src/infrastructure/redis/createRedisClients.js` — Redis client setup
- `src/infrastructure/redis/safeRedisOps.js` — safe Redis wrappers
- `src/infrastructure/realtime/connectionRegistry.js` — in-memory socket registry

## HTTP API endpoints

### Monitoring and diagnostics

- `GET /health`
  - Returns service status, connection counts, and runtime metrics snapshot
  - Implemented in `src/transports/http/registerHttpRoutes.js`
- `GET /metrics`
  - Prometheus metrics body for scraping
- `GET /dashboard`
  - Built-in HTML dashboard for live metrics and runtime state
- `GET /connections`
  - Returns current socket connection IDs grouped by type
  - Optional query: `?type=driver|customer|default`

### Backend socket emit APIs

- `POST /driver/event`
  - Emit an event to a specific driver via `user_id` header
- `POST /customer/event`
  - Emit an event to all sockets of a specific customer
- `POST /emit/user`
  - Backend API to emit events to one user based on `userType` and `userId`
- `POST /emit/trip`
  - Emit an event to a trip room (`trip_<tripId>`) across namespaces
- `POST /emit/broadcast`
  - Broadcast an event to a namespace or room

## Socket namespaces and client contract

### Namespace `/` (legacy)

Clients connect without namespace-specific auth.

Client -> server events:
- `authenticate` `{ userId, userType, token }`
- `joinTrip` `{ tripId }`
- `leaveTrip` `{ tripId }`
- `updateLocation` `{ latitude, longitude, tripId }`

Server -> client events:
- `authenticated`
- `joinedTrip`
- `leftTrip`
- `locationUpdate`
- `error`

### Namespace `/drivers`

Handshake requires headers:
- `Authorization: Bearer <token>`
- `user_id` or `userId`

Client -> server:
- `joinTrip` `{ tripId }`
- `leaveTrip` `{ tripId }`
- `updateLocation` `{ latitude, longitude, tripId }`

Server -> client:
- `joinedTrip`
- `leftTrip`
- `locationUpdate`
- dynamic trip events under `bookingTrip:*`

### Namespace `/customers`

Same handshake requirements as `/drivers`.

Client -> server and server -> client flows are similar to `/drivers`, plus trip broadcasts.

### Namespace `/admin` (optional)

Enabled when `ADMIN_MONITOR=true`.

Use `Authorization` or `auth.token` in the handshake payload. Events include `admin:log`, `admin:joinTrip`, and `admin:emitTest`.

## Where to find logic

If you need to trace a specific API or socket flow:

- HTTP routing and backend emit APIs: `src/transports/http/registerHttpRoutes.js`
- Socket flow implementation: `src/transports/socket/registerSocketFlows.js`
- Redis pub/sub backend events: `src/transports/redis/subscribeBackendEvents.js`
- Location processing: `src/modules/location/locationService.js`
- Trip room handling: `src/modules/trip/tripRoomService.js`
- Emit helpers and fallback behavior: `src/modules/connection/socketEmitterService.js`
- Redis helpers: `src/infrastructure/redis/safeRedisOps.js`
- Connection counters: `src/infrastructure/realtime/connectionRegistry.js`

## Notes for search

Search keywords useful for finding logic:
- `app.post("/driver/event"` or `app.post("/customer/event"`
- `registerSocketFlows`
- `emitToDriver`, `emitToCustomer`, `emitToUser`, `emitToTrip`
- `bookingTrip:` event names
- `safeRedisOps.hset`, `safeRedisOps.sadd`, `roomSocketKey`
- `GET /connections` for current online socket IDs

## Validation and testing

The repo already contains phase 6 test scripts:

```bash
npm run test:contract:staging
npm run test:preflight:staging
npm run test:soak:staging
npm run test:phase6:gate
```
