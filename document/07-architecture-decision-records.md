# 07 - Architecture Decision Records (ADR)

## ADR-001: Giữ mô hình Modular Monolith

Quyết định:
- Không tách microservices ở giai đoạn này.

Lý do:
- Domain realtime tập trung, phụ thuộc chặt event contracts.
- Giảm overhead vận hành so với microservices.

Hệ quả:
- Cần kỷ luật module boundary trong cùng repository.

## ADR-002: Redis là trung tâm relay liên service

Quyết định:
- Giữ Redis Pub/Sub channel bechill:events làm cơ chế bridge với backend .NET.

Lý do:
- Hạ tầng hiện tại đã ổn định với Redis.
- Latency phù hợp nhu cầu realtime.

Hệ quả:
- Cần cơ chế parse lỗi an toàn và log đầy đủ khi message sai định dạng.

## ADR-003: Duy trì namespace legacy /

Quyết định:
- Giữ namespace / để tương thích client cũ trong giai đoạn chuyển đổi.

Lý do:
- Tránh rollout đồng thời trên tất cả mobile/web clients.

Hệ quả:
- Tăng chi phí bảo trì tạm thời, cần lộ trình deprecate rõ ràng.

## ADR-004: Driver 1-kết-nối, Customer đa-kết-nối

Quyết định:
- Giữ chính sách kết nối hiện tại.

Lý do:
- Phù hợp nghiệp vụ dispatch và theo dõi trạng thái tài xế.

Hệ quả:
- Cần xử lý disconnect socket cũ an toàn khi driver reconnect.

## ADR-005: Ưu tiên phát đúng đích, hạn chế broadcast

Quyết định:
- Với bookingTrip:Request, không broadcast toàn driver nếu thiếu target rõ.

Lý do:
- Tránh nhiễu event và sai luồng nghiệp vụ.

Hệ quả:
- Cần theo dõi log để phát hiện các message thiếu driverId từ backend.
