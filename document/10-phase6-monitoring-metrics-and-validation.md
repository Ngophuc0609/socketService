# 10 - Phase 6 Monitoring, Metrics, JWT Policy, Soak/Contract Validation

## Muc tieu

Tai lieu nay chot 3 gate bat buoc truoc khi mo Phase 7:

1. Monitoring checklist va metrics da duoc bat trong runtime module hoa.
2. Chinh sach JWT_SECRET bat buoc tren staging duoc rollout an toan.
3. Soak test va contract test voi payload backend thuc da duoc thuc thi va pass.

## Monitoring checklist (Phase 6)

### A. Runtime health va metrics endpoint

1. `GET /health` tra `status=OK`.
2. `GET /metrics` tra Prometheus text format.
3. Cac metric co du lieu tang theo luong thuc:
- `socket_connections_active`
- `socket_events_total`
- `redis_messages_total`
- `redis_invalid_messages_total`
- `relay_events_total`
- `http_requests_total`
- `http_request_errors_total`

### B. Redis relay va parse safety

1. Publish 1 message JSON hop le vao channel `bechill:events` va xac nhan `redis_messages_total` tang.
2. Publish 1 message sai JSON va xac nhan `redis_invalid_messages_total` tang.

### C. Admin monitoring namespace

1. Bat `ADMIN_MONITOR=true`.
2. Ket noi `/admin` voi token role admin hop le.
3. Thu cac event:
- `admin:joinTrip`
- `admin:emitTest`
- `admin:getDrivers`
- `admin:setFilter`
4. Xac nhan nhan duoc `admin:log` va `admin:drivers`.

## JWT rollout policy tren staging

## Policy

- Tren `NODE_ENV=staging`, runtime module hoa se fail startup neu:
1. `REQUIRE_JWT_SECRET_ON_STAGING=true` (mac dinh)
2. `JWT_SECRET` khong duoc cau hinh

- Truong hop can rollback policy tam thoi:
- Dat `REQUIRE_JWT_SECRET_ON_STAGING=false`

## Cac bien moi truong can xac nhan tren staging

- `NODE_ENV=staging`
- `JWT_SECRET=<staging-secret>`
- `ADMIN_MONITOR=true|false` theo nhu cau
- `ADMIN_JWT_SECRET=<admin-secret>` (neu tach rieng)
- `REQUIRE_JWT_SECRET_ON_STAGING=true`

## Rollout steps khuyen nghi

1. Deploy staging voi `JWT_SECRET` da set.
2. Chay smoke test connect/auth cho `/drivers` va `/customers`.
3. Chay preflight: `npm run test:preflight:staging`.
4. Chay contract test: `npm run test:contract:staging`.
5. Chay soak test: `npm run test:soak:staging`.
6. Hoac chay gate tong hop: `npm run test:phase6:gate`.
7. Neu tat ca pass, giu policy `REQUIRE_JWT_SECRET_ON_STAGING=true`.

## Contract test voi payload backend thuc

Dieu kien truoc khi chay:

1. Runtime module hoa dang chay va truy cap duoc qua `SERVICE_URL`.
2. Redis truy cap duoc voi `REDIS_HOST/REDIS_PORT`.
3. Driver/customer test account co token hop le cho moi truong staging.

Script: `npm run test:contract:staging`

Script nay:

1. Ket noi socket `/drivers` va `/customers`.
2. Publish payload vao Redis channel backend.
3. Kiem tra event nhan duoc khop ky vong trong fixture.

Fixture mac dinh:
- `document/fixtures/backend-bookingtrip-payloads.sample.json`

Khuyen nghi:

1. Tao file fixture rieng tu payload backend that (khong dung sample).
2. Truyen qua env `CONTRACT_FIXTURE=...`.

### Bien moi truong cho contract test

- `SERVICE_URL` (vi du: `http://staging-socket:8605`)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `REDIS_CHANNEL` (mac dinh `bechill:events`)
- `CONTRACT_DRIVER_USER_ID`
- `CONTRACT_CUSTOMER_USER_ID`
- `CONTRACT_DRIVER_BEARER`
- `CONTRACT_CUSTOMER_BEARER`
- `CONTRACT_TIMEOUT_MS` (mac dinh 10000)
- `CONTRACT_FIXTURE`

## Soak test truoc Phase 7

Dieu kien truoc khi chay:

1. Runtime module hoa dang chay on dinh tren staging.
2. `/health` va `/metrics` truy cap duoc tu may chay script.
3. Redis publish channel truy cap duoc tu may chay script.

Script: `npm run test:soak:staging`

Script nay:

1. Poll `/health` va `/metrics` dinh ky.
2. Publish nhom event heartbeat vao Redis.
3. Fail neu co bat ky lan check nao loi.

### Bien moi truong cho soak test

- `SERVICE_URL`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `REDIS_CHANNEL`
- `SOAK_DURATION_SECONDS` (mac dinh 300)
- `SOAK_INTERVAL_MS` (mac dinh 2000)

## Exit criteria truoc Phase 7

Mo Phase 7 chi khi dat du cac dieu kien sau:

1. Monitoring checklist A/B/C pass tren staging.
2. `test:contract:staging` pass voi payload backend thuc.
3. `test:soak:staging` pass trong thoi luong toi thieu 24h (chay nhieu dot lien tiep).
4. Khong co regression ve HTTP contracts, bookingTrip contracts, va auth flow.

## Lenh run nhanh de checklist

```bash
npm run test:preflight:staging
npm run test:contract:staging
npm run test:soak:staging
```

Hoac 1 lenh:

```bash
npm run test:phase6:gate
```
