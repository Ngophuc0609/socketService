# 01 - Tổng quan project

## Mục tiêu

SocketServer cung cấp giao tiếp realtime giữa:

- Ứng dụng tài xế
- Ứng dụng khách hàng
- Backend .NET (qua Redis Pub/Sub)
- Namespace giám sát admin (tùy chọn)

Service được xây dựng để đồng bộ sự kiện chuyến đi theo thời gian thực, bao gồm:

- Trạng thái đặt xe
- Vị trí tài xế/khách hàng
- Emit sự kiện đến user cụ thể, trip room hoặc broadcast

## Công nghệ sử dụng

- Node.js
- Express
- Socket.IO
- Redis (ioredis)
- dotenv
- Axios (gửi Telegram logs)

## Khởi động nhanh

1. Cài dependencies

```bash
npm install
```

2. Chạy production

```bash
npm start
```

3. Chạy development

```bash
npm run dev
```

## Biến môi trường cơ bản

- PORT (mặc định 8605)
- REDIS_HOST (mặc định localhost)
- REDIS_PORT (mặc định 6379)
- REDIS_PASSWORD (tùy chọn)
- CORS_ORIGIN (mặc định *)
- DEBUG_SOCKET (true để mở debug logs)
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID
- TELEGRAM_LEVEL
- ADMIN_MONITOR (true để mở namespace /admin)
- ADMIN_JWT_SECRET hoặc JWT_SECRET

## Cấu trúc file trong project

- server.js: Runtime chính, socket namespaces, endpoint HTTP, Redis subscriber
- logger.js: Logging JSON + Telegram queueing
- package.json: Scripts và dependencies
- README.md: Hướng dẫn kết nối client cơ bản
- AGENTS.md: Hướng dẫn cho AI coding agent

## Phạm vi API

Service này không phải API CRUD đầy đủ. Service tập trung vào:

- HTTP endpoints điều khiển emit event
- Socket event handlers realtime
- Redis event consumer từ backend .NET
