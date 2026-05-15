# Socket.io Server for BeChill

## Cài đặt

```bash
cd SocketServer
npm install
```

## Chạy

```bash
npm start
```

Hoặc chạy với nodemon (auto-reload):

```bash
npm run dev
```

Chạy runtime module hoa (khuyen nghi cho Phase 6+):

```bash
npm run start:modular
```

## Cấu hình

Chỉnh sửa file `.env`:

```
PORT=8605
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
CORS_ORIGIN=*
```

## Kết nối từ client

```javascript
import io from "socket.io-client";

const socket = io("http://localhost:8605", {
  transports: ["websocket", "polling"],
});

// Authenticate
socket.emit("authenticate", {
  userId: "user-guid-here",
  userType: "driver", // hoặc 'customer', 'admin'
  token: "jwt-token-here",
});

socket.on("authenticated", (data) => {
  console.log("Authenticated:", data);
});

// Join trip
socket.emit("joinTrip", { tripId: "trip-guid-here" });

// Update location
socket.emit("updateLocation", {
  latitude: 10.762622,
  longitude: 106.660172,
  tripId: "trip-guid-here",
});

// Listen for events
socket.on("locationUpdate", (data) => {
  console.log("Location update:", data);
});

socket.on("tripStatusChanged", (data) => {
  console.log("Trip status changed:", data);
});
```

## Events từ client

- `authenticate` - Xác thực và join room
- `joinTrip` - Join vào trip group
- `leaveTrip` - Leave trip group
- `updateLocation` - Cập nhật vị trí realtime

## Monitoring Dashboard

- URL: http://localhost:8605/dashboard
- Dashboard lay du lieu tu:
- `GET /health`
- `GET /metrics`

## Events từ server

- `authenticated` - Xác thực thành công
- `joinedTrip` - Đã join trip
- `leftTrip` - Đã leave trip
- `locationUpdate` - Cập nhật vị trí
- `tripStatusChanged` - Trạng thái trip thay đổi
- `error` - Lỗi

## Gửi event từ .NET backend

.NET backend publish event qua Redis channel `bechill:events`:

```json
{
  "type": "user",
  "target": "user-guid",
  "eventName": "tripStatusChanged",
  "payload": {
    "tripId": "trip-guid",
    "status": "Started",
    "timestamp": 1234567890
  }
}
```

Types:

- `user` - Gửi tới một user cụ thể (target = userId)
- `trip` - Gửi tới tất cả users trong trip (target = tripId)
- `broadcast` - Broadcast tới tất cả users (target = userType hoặc null)

## Validation trước cutover (staging)

- Chuẩn bị biến môi trường staging theo mẫu: `.env.staging.example`
- Chạy contract test với payload backend thực:

```bash
npm run test:contract:staging
```

- Chạy preflight check để xác nhận service/metrics/redis trước khi test:

```bash
npm run test:preflight:staging
```

- Chạy soak test + health/metrics gate:

```bash
npm run test:soak:staging
```

- Hoặc chạy gate tổng hợp:

```bash
npm run test:phase6:gate
```
