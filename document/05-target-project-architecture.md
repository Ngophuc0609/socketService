# 05 - Thiết kế lại project theo kiến trúc hoàn chỉnh

## 1) Mục tiêu thiết kế

Thiết kế mới hướng tới 4 tiêu chí:

- Tách lớp rõ ràng để giảm độ phức tạp của server.js.
- Dễ mở rộng thêm namespace/event mới mà không sửa khối code lớn.
- Dễ test theo module (unit/integration/contract).
- Dễ vận hành production (quan sát, rollback, nâng cấp từng phần).

## 2) Kiến trúc đề xuất

Mô hình kiến trúc: Modular Monolith theo hướng Ports and Adapters.

- Domain modules: auth, connection, trip, location, relay.
- Transport adapters: HTTP, Socket.IO, Redis Pub/Sub, Admin monitor.
- Infrastructure adapters: Redis client, logger/telemetry, config.
- Runtime composer: nơi ghép dependency và khởi động service.

## 3) Cấu trúc thư mục đích

```text
SocketServer/
├─ server.js                      # Runtime hiện tại (giữ để tương thích)
├─ src/
│  ├─ index.js                    # Entry của runtime module hóa
│  ├─ app/
│  │  └─ createRuntime.js         # Composition root
│  ├─ config/
│  │  └─ env.js
│  ├─ shared/
│  │  ├─ constants/
│  │  │  ├─ namespaces.js
│  │  │  └─ redisKeys.js
│  │  └─ utils/
│  │     └─ validateLocation.js
│  ├─ infrastructure/
│  │  ├─ logging/loggerPort.js
│  │  ├─ redis/
│  │  │  ├─ createRedisClients.js
│  │  │  └─ safeRedisOps.js
│  │  └─ realtime/connectionRegistry.js
│  ├─ modules/
│  │  ├─ auth/authService.js
│  │  ├─ location/locationService.js
│  │  ├─ trip/tripRoomService.js
│  │  └─ relay/redisRelayService.js
│  └─ transports/
│     ├─ http/registerHttpRoutes.js
│     ├─ socket/
│     │  ├─ registerNamespaces.js
│     │  └─ registerSocketFlows.js
│     └─ redis/subscribeBackendEvents.js
└─ document/
  ├─ README.md
   ├─ 01-project-overview.md
   ├─ 02-architecture.md
   ├─ 03-business-logic-realtime.md
   ├─ 04-api-endpoints-and-event-contracts.md
   ├─ 05-target-project-architecture.md
  ├─ 06-migration-roadmap.md
  └─ 07-architecture-decision-records.md
```

## 3.1) Trạng thái triển khai hiện tại

Đã có sẵn khung source module hóa trong `src/` gồm:

- Composition root và boot runtime (`src/index.js`, `src/app/createRuntime.js`).
- Cấu hình môi trường (`src/config/env.js`).
- Infrastructure cơ bản cho logger, Redis, registry kết nối.
- Module nền tảng: auth, location, trip, relay.
- Transport nền tảng: HTTP, Socket, Redis subscribe.

Chưa hoàn tất ở runtime module hóa:

- Chưa hoàn tất parity edge-cases cho bookingTrip:* (cần contract test payload thực tế backend).
- Đã migrate endpoint emit `/driver/event`, `/customer/event`, cần integration test online/offline.
- Chưa chuyển entrypoint chính sang `src/index.js` cho production.
- Admin transport đã có middleware + handlers cơ bản, còn thiếu monitoring hardening để parity hoàn toàn.
- JWT verify HS256 cho user namespaces đã có theo `JWT_SECRET`, cần xác nhận rollout staging và chính sách bắt buộc secret khi cutover.

## 4) Quy ước thiết kế

- Domain không biết chi tiết thư viện ngoài (Socket.IO/Redis/Express).
- Transport chỉ nhận request/event, gọi module service, trả response/emit.
- Infrastructure chỉ làm việc kỹ thuật (kết nối, log, retry, serialization).
- Không để business rule nằm trực tiếp trong callback của Socket.IO.

## 5) Mapping chức năng từ server.js sang module mới

- Middleware auth cho /, /drivers, /customers -> modules/auth + transports/socket.
- Luồng joinTrip/leaveTrip -> modules/trip + transports/socket.
- Luồng updateLocation -> modules/location + transports/socket.
- Redis subscribe bechill:events -> transports/redis + modules/relay.
- HTTP endpoints /driver/event, /customer/event, /health -> transports/http.
- emitAdminLog và admin namespace -> transports/admin + infrastructure/logging.

## 6) Chuẩn hóa contract

- Duy trì nguyên event name đang chạy để không phá mobile apps.
- Tách DTO riêng cho:
  - HTTP request/response
  - Socket client events
  - Redis inbound event
- Thêm schema validation ở biên (edge): header, body, payload.

## 7) Nâng cấp bảo mật đề xuất

- Bắt buộc verify JWT thật cho user namespaces.
- Chuẩn hóa auth error codes.
- Tách auth strategy cho user và admin.
- Giới hạn rate cho các event có tần suất cao (updateLocation).

## 8) Nâng cấp observability đề xuất

- Chuẩn hóa correlationId/traceId xuyên suốt HTTP, socket, Redis.
- Thêm metrics:
  - số kết nối theo namespace
  - số event vào/ra mỗi loại
  - tỉ lệ lỗi parse/emit
  - độ trễ relay Redis -> socket
- Giữ Telegram như kênh cảnh báo nhanh, nhưng bổ sung dashboard metrics.

## 9) Test strategy đề xuất

- Unit tests: validateLocation, auth parsing, relay routing decision.
- Integration tests: HTTP endpoints, Redis subscribe, room lifecycle.
- Contract tests: bookingTrip events với payload thật từ backend .NET.
- Smoke tests: connect/auth/joinTrip/updateLocation/disconnect.

## 10) Kết luận

Project đã vượt mức blueprint và đã migrate phần lớn flow cốt lõi vào runtime module hóa (HTTP emit, socket join/leave/location, relay bookingTrip chính). Bước tiếp theo là kiểm thử parity chuyên sâu (contract + smoke + soak), hoàn thiện admin/hardening, sau đó mới cutover production theo roadmap.
