# 02 - Kiến trúc hệ thống

## Tổng quan component

1. HTTP Layer
- Express app chứa health check và 2 endpoint emit event cho driver/customer.

2. Realtime Layer
- Socket.IO server với các namespace:
  - /
  - /drivers
  - /customers
  - /admin (chỉ khi ADMIN_MONITOR=true)

3. Data/State Layer
- Redis cho mapping socket-user, room membership và location cache.
- Redis Pub/Sub channel để nhận sự kiện từ .NET backend.

4. Observability Layer
- Structured logs (JSON) ra console.
- Telegram logs theo queue, batch, level filter.
- Admin monitor event stream qua /admin.

## Luồng dữ liệu chính

1. Client kết nối namespace, đi qua middleware auth.
2. Socket join room theo user và trip.
3. Khi có updateLocation, server validate + throttle + cache Redis.
4. Backend .NET publish event lên bechill:events.
5. SocketServer parse event, route đến đúng namespace/room/user.

## Namespace và model kết nối

- /drivers:
  - Mỗi driver chỉ được 1 kết nối active.
  - Nếu kết nối mới, socket cũ bị disconnect.

- /customers:
  - Customer có thể có nhiều socket song song.
  - Được fanout đến tất cả socket của cùng user.

- / (default, legacy):
  - Để tương thích ngược với client cũ.
  - Authenticate bằng event authenticate thay vì handshake header.

- /admin:
  - Monitoring/ops namespace.
  - Auth bằng token HMAC SHA256 (secret từ ADMIN_JWT_SECRET/JWT_SECRET).

## Redis schema và conventions

1. User-socket mapping
- socket:uid:{userType}:{userId} -> Set(socketId)
- socket:info:{socketId} -> Hash metadata

2. Room tracking
- socket:room:{roomName} -> Set(socketId)

3. Location cache
- location:{userId} -> Hash { userId, userType, latitude, longitude, timestamp }
- TTL 300 giây

4. TTL policy
- Mapping socket/room dùng TTL 30 ngày.

## Error handling và resilience

- Safe wrappers cho Redis operations:
  - safeRedisHSet
  - safeRedisSAdd
  - safeRedisSRem
  - safeRedisDel
  - safeRedisExpire
- Lỗi Redis được log + Telegram, tránh crash process.
- JSON parse lỗi từ Redis message được catch và bỏ qua message lỗi.
- Graceful shutdown:
  - Disconnect sockets
  - Quit Redis clients
  - Close Socket.IO + HTTP server
  - Force exit sau 10 giây nếu treo

## Security model hiện tại

- Namespace /drivers, /customers, / (global middleware) yêu cầu:
  - Authorization: Bearer <token>
  - user_id hoặc userId trong headers
- Lưu ý:
  - Token Bearer hiện tại chưa verify JWT thực sự trong flow user.
  - /admin có verify chữ ký HMAC, yêu cầu role=admin.

## Monitoring và logging

- logInfo, logWarn, logError, logDebug trong logger.js
- Telegram batch flush mỗi 2 giây, mỗi lần gửi tối đa 5 messages
- TELEGRAM_LEVEL điều khiển ngưỡng gửi
- emitAdminLog ghi nhận event emit/location/control/redis cho admin namespace
