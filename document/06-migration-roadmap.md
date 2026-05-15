# 06 - Lộ trình migrate sang kiến trúc mới

## Bảng tracking phase

Quy ước trạng thái:

- `[x]` Done
- `[-]` In-progress
- `[ ]` Not-started

Trạng thái hiện tại:

- `[-]` Phase 0 - Baseline
- `[x]` Phase 1 - Khởi tạo runtime module hóa
- `[-]` Phase 2 - Tách connection và trip flow
- `[-]` Phase 3 - Tách location flow
- `[-]` Phase 4 - Tách Redis relay bookingTrip
- `[-]` Phase 5 - Tách HTTP emit endpoints
- `[-]` Phase 6 - Admin và hardening
- `[ ]` Phase 7 - Chuyển entrypoint chính

## Nguyên tắc rollout

- Không thay đổi behavior đột ngột.
- Mỗi phase đều có tiêu chí kiểm chứng rõ ràng.
- Có khả năng rollback nhanh về server.js hiện tại.

## Trạng thái hiện tại (May 2026)

- Hoàn tất tài liệu kiến trúc đích và ADR.
- Đã dựng khung runtime module hóa trong `src/`.
- Đã thêm script chạy thử `start:modular` và `dev:modular`.
- Chưa cutover production, `server.js` vẫn là runtime chính.
- Đánh giá readiness chi tiết và kế hoạch đóng gap tham chiếu tại `document/08-completion-assessment-and-gap-closure.md`.
- Checklist parity server cũ vs runtime mới tham chiếu tại `document/09-parity-checklist-serverjs-vs-modular.md`.
- Monitoring checklist + metrics + staging validation tham chiếu tại `document/10-phase6-monitoring-metrics-and-validation.md`.
- Dashboard/alert observability tham chiếu tại `document/11-phase6-observability-dashboard-and-alerts.md`.

## Phase 0 - Baseline

**Tracking:** `[-] In-progress`

Mục tiêu:
- Đóng băng contract hiện tại (HTTP + Socket + Redis events).
- Bổ sung test smoke cho 4 flow cốt lõi.

Done khi:
- Test smoke chạy xanh trên runtime hiện tại.

Ghi chú hiện trạng:

- Đã có bộ test tự động cơ bản cho HTTP routes, socket flows, relay bookingTrip trong thư mục `test/`.
- Đã bao phủ thêm ca parity quan trọng: driver single-active socket, customer multi-socket, customer offline 404.
- Chưa thay thế hoàn toàn smoke test tích hợp với môi trường Redis/backend thực.

## Phase 1 - Khởi tạo runtime module hóa

**Tracking:** `[x] Done`

Mục tiêu:
- Dựng src runtime composer, config, infrastructure adapters.
- Chạy song song chế độ dev để đối chiếu logs.

Done khi:
- src có thể boot thành công.
- /health hoạt động ở runtime mới.

Ghi chú hiện trạng:

- Đã có runtime trong `src/index.js` và `src/app/createRuntime.js`.
- `/health` đã có ở `src/transports/http/registerHttpRoutes.js`.

## Phase 2 - Tách connection và trip flow

**Tracking:** `[-] In-progress`

Mục tiêu:
- Migrate handlers joinTrip/leaveTrip cho /drivers và /customers.
- Đồng bộ Redis room tracking qua module tripRoomService.

Done khi:
- joinTrip/leaveTrip cho driver/customer đúng room + Redis keys.

Ghi chú hiện trạng:

- Đã có `registerSocketFlows` cho connect/disconnect driver/customer.
- Đã nối `joinTrip/leaveTrip` vào flow drivers/customers/legacy qua `tripRoomService`.
- Cần kiểm thử contract thực tế với client để xác nhận parity hoàn toàn.

## Phase 3 - Tách location flow

**Tracking:** `[-] In-progress`

Mục tiêu:
- Di chuyển throttle + validate + persist location vào locationService.
- Fanout locationUpdate theo đúng namespace hiện hữu.

Done khi:
- Payload locationUpdate và TTL Redis khớp behavior cũ.

Ghi chú hiện trạng:

- Đã có `locationService` (throttle, normalize, persist).
- Đã nối `updateLocation` vào cả drivers/customers/legacy và fanout room đa namespace.
- Cần smoke test song song 2 runtime để xác nhận không lệch payload thực tế.

## Phase 4 - Tách Redis relay bookingTrip

**Tracking:** `[-] In-progress`

Mục tiêu:
- Chuyển logic parse/normalize/fanout bookingTrip sang relay service.
- Bảo toàn toàn bộ mapping event bookingTrip hiện tại.

Done khi:
- Contract tests bookingTrip chạy xanh.
- Không regression ở mobile nhận event.

Ghi chú hiện trạng:

- Đã có subscribe Redis và relay generic events.
- Đã bổ sung handler đặc thù `bookingTrip:*` trong relay service module hóa.
- Cần contract test với payload backend thực để xác nhận đầy đủ edge cases.

## Phase 5 - Tách HTTP emit endpoints

**Tracking:** `[-] In-progress`

Mục tiêu:
- Di chuyển /driver/event và /customer/event sang HTTP transport mới.
- Chuẩn hóa validation + error payload.

Done khi:
- Endpoint response tương thích ngược.

Ghi chú hiện trạng:

- Đã triển khai `/driver/event` và `/customer/event` trong runtime mới.
- Cần integration test để xác nhận backward-compatible response trên toàn bộ tình huống online/offline.

## Phase 6 - Admin và hardening

**Tracking:** `[-] In-progress`

Mục tiêu:
- Hoàn thiện /admin transport.
- Thêm JWT verify thật cho user namespaces.
- Bổ sung metrics và cảnh báo.

Done khi:
- Security checklist pass.
- Monitoring checklist pass.

Ghi chú hiện trạng:

- Đã triển khai admin middleware + handlers cơ bản trong runtime module hóa (`admin:joinTrip`, `admin:emitTest`, `admin:getDrivers`, `admin:setFilter`).
- Đã bổ sung verify JWT HS256 + role=admin cho namespace `/admin` ở runtime module hóa.
- Đã bổ sung verify JWT HS256 cho user namespaces khi `JWT_SECRET` được cấu hình (giữ fallback tương thích khi chưa cấu hình secret).
- Đã bổ sung runtime metrics endpoint `/metrics` và metrics counters cho HTTP/socket/redis/relay.
- Đã có script kiểm chứng staging: `npm run test:preflight:staging`, `npm run test:contract:staging`, `npm run test:soak:staging`, `npm run test:phase6:gate`.
- Cần hoàn thiện monitoring checklist, metrics và chạy kiểm thử staging để chốt hardening.

## Phase 7 - Chuyển entrypoint chính

**Tracking:** `[ ] Not-started`

Mục tiêu:
- Chuyển script start sang src/index.js.
- Giữ server.js làm fallback trong giai đoạn ổn định.

Done khi:
- Chạy production ổn định 1 chu kỳ release.

Ghi chú hiện trạng:

- Đã có script `start:modular`, `dev:modular` để chạy thử.
- Script `start` chính vẫn trỏ `server.js` (chưa cutover).

## Checklist xác nhận trước khi cutover

- Kết nối: /, /drivers, /customers, /admin hoạt động.
- Event chính: bookingTrip:* không đổi contract.
- Endpoint: /driver/event, /customer/event, /health đúng response.
- Redis keys và TTL đúng quy ước cũ.
- Shutdown graceful không rò rỉ kết nối.
- Logs/trace đầy đủ cho incident investigation.

## Ưu tiên thực thi ngay (next actions)

1. Chạy smoke test song song 2 runtime cho luồng connect/auth/joinTrip/updateLocation/disconnect.
2. Chạy `npm run test:preflight:staging` để xác nhận health/metrics/redis trước khi test chuyên sâu.
3. Chạy integration test cho `/driver/event` và `/customer/event` trên tình huống online/offline.
4. Chạy `npm run test:contract:staging` với fixture payload backend thực để chốt parity edge-cases.
5. Chạy `npm run test:soak:staging` (>= 24h theo nhiều đợt) và đối chiếu dashboard/alerts.
