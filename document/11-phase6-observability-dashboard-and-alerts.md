# 11 - Phase 6 Observability Dashboard va Alert Rules

## Muc tieu

Tai lieu nay cung cap bo query mau cho Prometheus/Grafana de giam sat runtime module hoa truoc khi mo Phase 7.

## Nguon metrics

Metrics endpoint:
- `GET /metrics`

Metric names:
- `socket_connections_active{namespace=...}`
- `socket_events_total`
- `redis_messages_total`
- `redis_invalid_messages_total`
- `relay_events_total`
- `http_requests_total{route=...}`
- `http_request_errors_total{route=...}`

## Grafana dashboard de xuat

### Panel 1 - Active Connections by Namespace (gauge)

PromQL:

```promql
socket_connections_active
```

### Panel 2 - Socket Events Rate (events/s)

PromQL:

```promql
rate(socket_events_total[5m])
```

### Panel 3 - Redis Invalid Message Ratio

PromQL:

```promql
sum(rate(redis_invalid_messages_total[5m])) / clamp_min(sum(rate(redis_messages_total[5m])), 1)
```

### Panel 4 - Relay Event Throughput (events/s)

PromQL:

```promql
rate(relay_events_total[5m])
```

### Panel 5 - HTTP Error Ratio by Route

PromQL:

```promql
sum by (route) (rate(http_request_errors_total[5m])) / clamp_min(sum by (route) (rate(http_requests_total[5m])), 1)
```

### Panel 6 - HTTP Total Requests by Route

PromQL:

```promql
sum by (route) (rate(http_requests_total[5m]))
```

## Alert rules de xuat

### Alert A - Redis invalid ratio cao

Dieu kien:

```promql
(sum(rate(redis_invalid_messages_total[5m])) / clamp_min(sum(rate(redis_messages_total[5m])), 1)) > 0.05
```

For: `10m`

Muc tieu: phat hien payload backend sai format.

### Alert B - HTTP error ratio cao o API emit

Dieu kien:

```promql
sum(rate(http_request_errors_total{route=~"/driver/event|/customer/event"}[5m])) / clamp_min(sum(rate(http_requests_total{route=~"/driver/event|/customer/event"}[5m])), 1) > 0.1
```

For: `10m`

Muc tieu: phat hien regression contract/API.

### Alert C - Relay throughput giam manh

Dieu kien:

```promql
rate(relay_events_total[15m]) < 0.1
```

For: `15m`

Muc tieu: phat hien relay bi treo/giat do ket noi Redis.

### Alert D - Khong co ket noi socket trong gio cao diem

Dieu kien:

```promql
sum(socket_connections_active) == 0
```

For: `5m`

Muc tieu: phat hien service down hoac mat ket noi toan bo namespace.

## Checklist dashboard truoc Phase 7

1. Dashboard co du 6 panel tren.
2. Alert A, B, C, D da duoc tao va gui thong bao den kenh truc.
3. Chay soak test va xac nhan dashboard cap nhat live.
4. Luu snapshot dashboard trong bao cao pre-cutover.
