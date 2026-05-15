# 04 - API endpoint và event contracts

## HTTP API endpoints (Express)

### Nhom A - Monitoring va van hanh

### 1) GET /health

Mục đích:
- Health check nhanh cho service va cung cap snapshot metrics phuc vu dashboard/soak test.

Use cases:
- Kiem tra readiness trong preflight script.
- Lay counters ket noi hien tai theo namespace.
- Lay tong so event/requests de tinh delta theo thoi gian.

Response 200 (mau):

```json
{
  "status": "OK",
  "timestamp": "2026-05-15T10:44:07.000Z",
  "startedAt": "2026-05-15T10:44:07.000Z",
  "connections": {
    "drivers": 12,
    "customers": 30,
    "legacy": 2,
    "admin": 1
  },
  "metrics": {
    "socketConnections": 540,
    "socketDisconnections": 494,
    "socketEvents": 12600,
    "redisMessages": 6150,
    "redisInvalidMessages": 3,
    "relayEvents": 6020,
    "httpRequests": 980,
    "httpErrors": 12
  },
  "metricsDetail": {
    "byEvent": {
      "bookingTrip:Started": 120,
      "bookingTrip:Completed": 118
    },
    "byHttpRoute": {
      "/health": { "total": 120, "errors": 0 },
      "/emit/user": { "total": 85, "errors": 2 }
    }
  }
}
```

### 2) GET /metrics

Mục đích:
- Expose metric theo dinh dang Prometheus de scrape bang Prometheus/Grafana.

Headers:
- Content-Type: `text/plain; version=0.0.4`

Metric chinh:
- `socket_connections_active{namespace=...}`
- `socket_events_total`
- `redis_messages_total`
- `redis_invalid_messages_total`
- `relay_events_total`
- `http_requests_total{route=...}`
- `http_request_errors_total{route=...}`

### 3) GET /dashboard

Mục đích:
- Tra ve dashboard HTML built-in de theo doi metrics real-time.

Hien co:
- Sparkline mini theo 5s cho socket/redis/http.
- Namespace filter (all/drivers/customers/legacy/admin).
- Banner canh bao mau khi HTTP error rate vuot nguong.

### Nhom B - Legacy push APIs (giu compatibility)

### 4) POST /driver/event

Mục đích:
- Emit event toi mot driver cu the.

Input:
- Header:
  - `user_id`: driver user id
- Body JSON:
  - `trip_id`: string
  - `socket_event`: string

Validation:
- `user_id` bat buoc
- `trip_id` bat buoc
- `socket_event` bat buoc

Behavior:
- Tim socket driver (uu tien memory, fallback Redis).
- Emit event voi payload = `trip_id`.

Response:
- 200: `{ success: true, data: { userId, tripId, socketEvent } }`
- 400: input invalid
- 404: `user_id is not exist`
- 500: internal server error

### 5) POST /customer/event

Mục đích:
- Emit event toi tat ca socket cua mot customer.

Input:
- Header:
  - `user_id`: customer user id
- Body JSON:
  - `trip_id`: string
  - `socket_event`: string

Behavior:
- Lay danh sach socket customer tu in-memory map va fallback Redis socket mapping.
- Emit den moi socket voi payload = `trip_id`.

Response:
- 200: `{ success: true, data: { userId, tripId, socketEvent, socketCount } }`
- 400: input invalid
- 404: `user_id is not exist`
- 500: internal server error

### Nhom C - Backend push APIs (de xuat moi, khuyen nghi su dung)

### 6) POST /emit/user

Mục đích:
- API tong quat de backend push event den 1 user cu the (driver/customer).

Input body:

```json
{
  "userType": "driver",
  "userId": "driver-123",
  "eventName": "bookingTrip:Started",
  "payload": {
    "tripId": "trip-1",
    "status": "started"
  }
}
```

Validation:
- `userType` bat buoc, chi nhan `driver|customer`
- `userId` bat buoc
- `eventName` bat buoc

Behavior:
- Route den namespace phu hop theo `userType`.
- Fallback Redis socket mapping neu in-memory khong co.

Response:
- 200: `{ success: true, data: { userType, userId, eventName, socketCount } }`
- 400: validation fail
- 404: user offline/khong ton tai mapping
- 500: internal server error

### 7) POST /emit/trip

Mục đích:
- Push event den room trip (`trip_{tripId}`) cho tat ca socket lien quan (legacy + drivers + customers).

Input body:

```json
{
  "tripId": "trip-1",
  "eventName": "bookingTrip:ToPickUp",
  "payload": {
    "tripId": "trip-1",
    "eta": 180
  }
}
```

Validation:
- `tripId` bat buoc
- `eventName` bat buoc

Response:
- 200: `{ success: true, data: { tripId, eventName, room } }`
- 400: validation fail
- 500: internal server error

### 8) POST /emit/broadcast

Mục đích:
- Push thong bao broadcast cho nhieu client cung luc.

Input body:

```json
{
  "eventName": "system:notice",
  "payload": {
    "message": "maintenance in 10 minutes"
  },
  "userType": "all",
  "targetRoom": null
}
```

Ghi chu:
- `userType`: `all|driver|customer|admin`
- `targetRoom`: optional; neu co se emit theo room, neu null se emit toan bo namespace tuong ung.

Response:
- 200: `{ success: true, data: { eventName, userType, targetRoom } }`
- 400: validation fail
- 500: internal server error

## Khuyen nghi de backend goi API push on dinh

- Dung idempotency key tai backend cho cac event quan trong (tranh push duplicate khi retry).
- Luon kem `eventName` theo convention domain (`bookingTrip:*`, `system:*`).
- Gioi han tan suat retry va theo doi 404 ratio cua `/emit/user` de phat hien ty le offline cao.
- Khi can route theo room, uu tien `/emit/trip` hoac `/emit/broadcast` + `targetRoom`.

## Socket namespaces và event map

## Namespace /

Client -> Server:
- authenticate { userId, userType, token }
- joinTrip { tripId }
- leaveTrip { tripId }
- updateLocation { latitude, longitude, tripId }

Server -> Client:
- authenticated
- joinedTrip
- leftTrip
- locationUpdate
- error

## Namespace /drivers

Handshake yêu cầu headers:
- Authorization: Bearer <token>
- user_id hoặc userId

Client -> Server:
- joinTrip { tripId }
- leaveTrip { tripId }
- updateLocation { latitude, longitude, tripId }

Server -> Client:
- joinedTrip
- leftTrip
- locationUpdate
- dynamic trip events (bookingTrip:* theo tripId)
- error

## Namespace /customers

Handshake yêu cầu headers:
- Authorization: Bearer <token>
- user_id hoặc userId

Client -> Server:
- joinTrip { tripId }
- leaveTrip { tripId }
- updateLocation { latitude, longitude, tripId }

Server -> Client:
- joinedTrip
- leftTrip
- locationUpdate
- dynamic trip events (bookingTrip:* theo tripId)
- error

## Namespace /admin (optional)

Điều kiện:
- ADMIN_MONITOR=true
- token hợp lệ role=admin

Client -> Server:
- admin:joinTrip (tripId)
- admin:emitTest ({ room, event, data })
- admin:getDrivers ()
- admin:setFilter (filter)

Server -> Client:
- admin:log
- admin:drivers

Ghi chú trạng thái runtime module hóa:
- Runtime production `server.js` đã có đầy đủ admin flow.
- Runtime module hóa đã có admin middleware và handlers cơ bản; vẫn cần hoàn thiện checklist hardening/monitoring trước cutover.

## Redis Pub/Sub contract

Channel:
- bechill:events

Khuôn mẫu message:

```json
{
  "type": "user | trip | broadcast",
  "target": "...",
  "eventName": "...",
  "payload": {
    "userType": "driver | customer",
    "data": {}
  }
}
```

Booking trip event naming conventions được xử lý đặc biệt:
- bookingTrip:Request
- bookingTrip:Canceled
- bookingTrip:AcceptedTrip
- bookingTrip:ToPickUp
- bookingTrip:DriverCanceled
- bookingTrip:Started
- bookingTrip:Completed
- bookingTrip:CompletedWithProblem

## Redis keys và TTL

- socket:uid:{userType}:{userId} -> set socketIds, TTL 30 ngày
- socket:info:{socketId} -> hash metadata, TTL 30 ngày
- socket:room:{roomName} -> set socketIds, TTL 30 ngày
- location:{userId} -> hash location, TTL 300 giây

## Lưu ý compatibility

- Namespace / là legacy support, không nên xóa nếu chưa migrate hết client.
- Event payload giữa các namespace có thể khác nhau theo luồng backend.
- Nên giữ tên event bookingTrip:* ổn định để tránh vỡ contract với mobile apps.
