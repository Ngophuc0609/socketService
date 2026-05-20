# 04 - API Routes And Event Contracts

Cap nhat: 2026-05-20. Tai lieu nay ghi lai contract tim thay trong source hien tai.

## Dan chung source chinh

| Nhom contract | File/function cu the |
| --- | --- |
| HTTP route registration | `src/transports/http/registerHttpRoutes.js:registerHttpRoutes()` |
| Backend secret middleware | `src/transports/http/registerHttpRoutes.js:requireBackendSecret()` |
| Socket event handlers | `src/transports/socket/registerSocketFlows.js:registerSocketFlows()` |
| Emit helpers | `src/modules/connection/socketEmitterService.js:createSocketEmitterService()` |
| Redis relay contract | `src/modules/relay/redisRelayService.js:relayGenericEvent()` |
| Tests tham chieu | `test/transports/http/registerHttpRoutes.test.js`, `test/transports/socket/registerSocketFlows.test.js`, `test/modules/relay/redisRelayService.test.js` |
| Postman collection | `postman_collection.json` |

## HTTP routes

Tat ca HTTP routes nam trong `registerHttpRoutes()`.

| Method | Path | Auth trong source | Handler behavior | Source |
| --- | --- | --- | --- | --- |
| `GET` | `/health` | Khong thay auth | Tra `status`, `timestamp`, registry counters, metrics snapshot. | `app.get("/health")` |
| `GET` | `/connections` | Khong thay auth | Tra socket ids theo `type=driver|customer|default` hoac all. | `app.get("/connections")`, `buildConnections()` |
| `GET` | `/metrics` | Khong thay auth | Tra Prometheus text tu `runtimeMetrics.toPrometheus()`. | `app.get("/metrics")` |
| `GET` | `/dashboard` | Khong thay auth | Tra HTML dashboard fetch `/health` va `/metrics`. | `app.get("/dashboard")`, `renderDashboardHtml()` |
| `POST` | `/driver/event` | Khong thay `requireBackendSecret` | Emit event den driver id trong header `user_id`/`userid`, payload la `trip_id`. | `app.post("/driver/event")` |
| `POST` | `/customer/event` | Khong thay `requireBackendSecret` | Emit event den customer id trong header `user_id`/`userid`, payload la `trip_id`. | `app.post("/customer/event")` |
| `POST` | `/emit/user` | `requireBackendSecret` | Emit den mot user `driver|customer`. | `app.post("/emit/user")` |
| `POST` | `/emit/trip` | `requireBackendSecret` | Emit den room `trip_{tripId}` tren legacy/drivers/customers. | `app.post("/emit/trip")` |
| `POST` | `/emit/broadcast` | `requireBackendSecret` | Broadcast theo `userType=all|driver|customer|admin` va optional `targetRoom`. | `app.post("/emit/broadcast")` |

## Response shape

Helper source:

- Success: `sendSuccess(res, data)` tra `{ success: true, data }`.
- Error: `sendError(res, statusCode, message)` tra `{ success: false, error: message }`.

Dan chung: `src/transports/http/registerHttpRoutes.js`.

## Monitoring routes

### `GET /health`

Response gom:

- `status: "OK"`.
- `timestamp`: ISO now.
- `startedAt`: tu metrics snapshot neu co.
- `connections`: `registry.counters()`.
- `metrics`: totals tu `runtimeMetrics.snapshot()`.
- `metricsDetail.byEvent`, `metricsDetail.byHttpRoute`.

Chua thay Redis ping trong route nay.

### `GET /connections`

Query:

- Khong truyen `type`: tra `drivers`, `customers`, `default`.
- `type=driver|drivers`: chi tra drivers.
- `type=customer|customers`: chi tra customers.
- `type=default|legacy|user`: chi tra default legacy.
- Gia tri khac: 400 `"Invalid type. Supported values are driver, customer, default"`.

Dan chung: `serializeRegistryConnections()`, `buildConnections()`.

### `GET /metrics`

Content-Type: `text/plain; version=0.0.4`.

Metric names:

- `socket_connections_active{namespace="..."}`
- `socket_events_total`
- `redis_messages_total`
- `redis_invalid_messages_total`
- `relay_events_total`
- `http_requests_total{route="..."}`
- `http_request_errors_total{route="..."}`

Dan chung: `src/infrastructure/monitoring/runtimeMetrics.js:toPrometheus()`.

## Backend HTTP emit routes

### `POST /driver/event`

Headers:

- `user_id` hoac `userid`: driver id.

Body:

```json
{
  "trip_id": "trip-1",
  "socket_event": "bookingTrip:Started"
}
```

Validation source:

- Thieu user id -> 400 `"user_id invalid"`.
- Thieu `trip_id` -> 400 `"trip_id invalid"`.
- Thieu `socket_event` -> 400 `"socket_event invalid"`.
- Khong emit duoc -> 404 `"user_id is not exist"`.

Emit source: `socketEmitter.emitToDriver(userId, socketEvent, tripId)`.

### `POST /customer/event`

Headers:

- `user_id` hoac `userid`: customer id.

Body:

```json
{
  "trip_id": "trip-2",
  "socket_event": "bookingTrip:AcceptedTrip"
}
```

Validation tuong tu `/driver/event`. Thanh cong tra them `socketCount`.

Emit source: `socketEmitter.emitToCustomer(userId, socketEvent, tripId)`.

### `POST /emit/user`

Auth:

- `x-api-key` bang `JWT_SECRET`, hoac
- `Authorization: Bearer <JWT>` verify bang user secret, hoac
- neu user secret khong cau hinh ma co api key/bearer, source cho phep vi backward compatibility.

Body:

```json
{
  "userType": "driver",
  "userId": "driver-123",
  "eventName": "bookingTrip:Started",
  "payload": {
    "tripId": "trip-1"
  }
}
```

Validation:

- `userType` chi nhan `driver|customer`.
- `userId` bat buoc.
- `eventName` bat buoc.
- User offline/khong co mapping -> 404.

Dan chung: `requireBackendSecret()`, `emitToUserCompat()`, `socketEmitter.emitToUser()`.

### `POST /emit/trip`

Auth: `requireBackendSecret`.

Body:

```json
{
  "tripId": "trip-1",
  "eventName": "bookingTrip:ToPickUp",
  "payload": {
    "eta": 180
  }
}
```

Validation:

- `tripId` bat buoc.
- `eventName` bat buoc.
- Neu emitter khong support `emitToTrip`, tra 501.

Emit room: `trip_{tripId}`.

### `POST /emit/broadcast`

Auth: `requireBackendSecret`.

Body:

```json
{
  "eventName": "system:notice",
  "payload": {
    "message": "maintenance"
  },
  "userType": "all",
  "targetRoom": null
}
```

Validation:

- `userType`: `all|driver|customer|admin`.
- `eventName` bat buoc.
- Neu emitter khong support `emitBroadcast`, tra 501.

## Socket namespace contracts

### Namespace `/drivers`

Handshake headers:

- `authorization` hoac `Authorization`: `Bearer <token>`.
- `user_id` hoac `userId`.

Browser demo fallback:

- `handshake.auth.token` hoac `handshake.auth.accessToken`.
- `handshake.auth.userId` hoac `handshake.auth.user_id`.

Client -> server:

- `joinTrip` `{ "tripId": "trip-1" }`
- `leaveTrip` `{ "tripId": "trip-1" }`
- `updateLocation` `{ "latitude": 10.1, "longitude": 106.1, "tripId": "trip-1" }`

Server -> client:

- `joinedTrip` `{ tripId, room }`
- `leftTrip` `{ tripId }`
- `locationUpdate` `{ userId, userType, latitude, longitude, timestamp }`
- `error` `{ message }`
- Dynamic backend events nhu `bookingTrip:*`.

### Namespace `/customers`

Handshake va events giong `/drivers`, nhung registry cho phep nhieu sockets cho cung `userId`.

### Namespace `/`

Client -> server:

- `authenticate` `{ "userId": "customer-1", "userType": "customer" }`
- `joinTrip` `{ "tripId": "trip-1" }`
- `leaveTrip` `{ "tripId": "trip-1" }`
- `updateLocation` `{ "latitude": 10.1, "longitude": 106.1, "tripId": "trip-1" }`

Server -> client:

- `authenticated` `{ success, userId, userType, rooms }`
- `joinedTrip`, `leftTrip`, `locationUpdate`, `error`.

Chua thay verify token trong legacy `authenticate` payload.

### Namespace `/admin`

Dieu kien: `ADMIN_MONITOR=true`.

Handshake token:

- `socket.handshake.auth.token`, hoac
- header `authorization`/`Authorization`.

Auth rule: `authService.verifyAdminToken()` can JWT HS256 hop le va `payload.role === "admin"`.

Client -> server:

- `admin:joinTrip` `(tripId)`
- `admin:emitTest` `({ room, event, data })`
- `admin:getDrivers` `()`
- `admin:setFilter` `(filter)`

Server -> client:

- `admin:log`
- `admin:drivers`

## Redis Pub/Sub contract

Runtime channel hien hard-code trong config: `bechill:events`.

Dan chung: `src/config/env.js:readEnv()`, `subscribeBackendEvents()`.

Generic message:

```json
{
  "type": "user",
  "target": "customer-1",
  "eventName": "eventName",
  "payload": {
    "userType": "customer",
    "data": {}
  }
}
```

Supported generic `type` in source:

- `user`
- `trip`
- `broadcast`

Special booking prefix:

- `bookingTrip:Request`
- `bookingTrip:Canceled`
- `bookingTrip:AcceptedTrip`
- `bookingTrip:ToPickUp`
- `bookingTrip:DriverCanceled`
- `bookingTrip:Started`
- `bookingTrip:Completed`
- `bookingTrip:CompletedWithProblem`

## Chua tim thay trong source

- Khong thay OpenAPI/Swagger file.
- Khong thay request schema validator nhu Joi/Zod/AJV.
- Khong thay auth cho `/health`, `/metrics`, `/dashboard`, `/connections`.
- Khong thay `requireBackendSecret` tren `/driver/event` va `/customer/event`.
- Khong thay payload schema bat buoc cho Redis messages ngoai JSON parse va field access truc tiep.
- Khong thay versioning cho socket event contract.
