# Tài liệu SocketServer

Tài liệu này mô tả đầy đủ cho SocketServer của BeChill (tính năng socket realtime).

## Mục lục

- [01 - Tổng quan project](01-project-overview.md)
- [02 - Kiến trúc hệ thống](02-architecture.md)
- [03 - Logic nghiệp vụ realtime](03-business-logic-realtime.md)
- [04 - API endpoint và event contracts](04-api-endpoints-and-event-contracts.md)
- [05 - Thiết kế lại project theo kiến trúc hoàn chỉnh](05-target-project-architecture.md)
- [06 - Lộ trình migrate sang kiến trúc mới](06-migration-roadmap.md)
- [07 - Architecture Decision Records](07-architecture-decision-records.md)
- [08 - Đánh giá hoàn thiện và kế hoạch đóng gap](08-completion-assessment-and-gap-closure.md)
- [09 - Checklist parity server.js và runtime module hóa](09-parity-checklist-serverjs-vs-modular.md)
- [10 - Phase 6 monitoring, metrics, JWT policy và validation](10-phase6-monitoring-metrics-and-validation.md)
- [11 - Phase 6 observability dashboard và alert rules](11-phase6-observability-dashboard-and-alerts.md)

## Trạng thái tài liệu

- Bộ tài liệu đã được chuẩn hóa theo kiến trúc đích và lộ trình migrate.
- Runtime production hiện tại vẫn là `server.js`.
- Runtime module hóa thử nghiệm nằm trong `src/`.
- Trạng thái hoàn thiện thực tế và điều kiện cutover được tổng hợp tại `document/08-completion-assessment-and-gap-closure.md`.
- Theo dõi tiến độ phase tại `document/06-migration-roadmap.md` (mục `Bảng tracking phase`).

## Chạy thử runtime module hóa

- `npm run start:modular`: chạy runtime module hóa.
- `npm run dev:modular`: chạy runtime module hóa với nodemon.

## Nguồn tham chiếu chính

- [server.js](../server.js)
- [logger.js](../logger.js)
- [README.md](../README.md)
- [package.json](../package.json)
- [AGENTS.md](../AGENTS.md)
