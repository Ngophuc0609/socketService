# Risk And Improvement

Cap nhat: 2026-05-20. Danh sach nay dua tren source hien tai, sap xep theo rui ro van hanh/bao mat/maintainability.

## Dan chung source chinh

| Hang muc | File/function cu the |
| --- | --- |
| Auth fallback | `src/modules/auth/authService.js:verifyUserToken()` |
| Backend API auth | `src/transports/http/registerHttpRoutes.js:requireBackendSecret()` |
| Public monitoring routes | `src/transports/http/registerHttpRoutes.js:registerHttpRoutes()` |
| Redis scale behavior | `src/modules/connection/socketEmitterService.js`, `src/modules/relay/redisRelayService.js` |
| Env config | `src/config/env.js:readEnv()`, `.env.*` |
| Optional SQL | `src/infrastructure/sql/createSqlDatabase.js:createSqlDatabase()` |
| Redis safe ops | `src/infrastructure/redis/safeRedisOps.js:createSafeRedisOps()` |
| Metrics/readiness | `src/infrastructure/monitoring/runtimeMetrics.js`, `/health` route |
| Redis Pub/Sub parsing | `src/transports/redis/subscribeBackendEvents.js`, `src/modules/relay/redisRelayService.js` |

## Risks va improvements

| Priority | Risk | Dan chung | Improvement de xuat |
| --- | --- | --- | --- |
| High | Secret co ve da nam trong `.env.production`/`.env.*`. | Env files trong repo. | Rotate Redis/Telegram/JWT secrets, dua env thuc ra secret manager, chi commit `.env.example`. |
| High | User JWT fallback chap nhan token bat ky khi `JWT_SECRET` rong. | `authService.verifyUserToken()` tra valid voi `secret_not_configured`. | Bat buoc `JWT_SECRET` o moi env production/staging va theo doi rollout cho legacy clients. |
| High | `user_id` header khong duoc doi chieu voi JWT claim. | `parseAuthFromHandshake()` verify token rieng, doc user id rieng. | Enforce `user_id === payload.sub/userId` hoac claim tuong duong. |
| High | `/driver/event` va `/customer/event` khong co backend auth middleware. | `registerHttpRoutes()` gan handler truc tiep. | Them auth tuong tu `/emit/*` hoac deprecate legacy routes sau migration. |
| High | Chua thay Socket.IO Redis adapter cho multi-instance. | Emit room/user dang dung local `io`/namespace va Redis socket ids. | Neu can scale ngang, them adapter va test fanout cross-instance. |
| Medium | `/health` khong ping Redis nen co the bao OK khi Redis down. | `app.get("/health")` chi tra registry/metrics. | Them readiness route hoac health detail co Redis ping timeout ngan. |
| Medium | `/metrics`, `/dashboard`, `/connections` public trong source. | Routes khong co auth. | Gioi han network, reverse proxy auth, hoac them token cho ops endpoints. |
| Medium | SQL optional moi chi check connectivity, chua co schema/persistence. | `createSqlDatabase()` chi connect/ping va close. | Thiet ke schema chat/notification/audit neu can luu ben vung. |
| Medium | Redis Pub/Sub message schema khong validate. | `subscribeBackendEvents()` chi JSON.parse; `relayGenericEvent()` doc field truc tiep. | Dung schema validator nhe cho `{type,target,eventName,payload}` va booking payloads. |
| Medium | Redis safe ops swallow loi co the lam emit/registry sai ma request van thanh cong. | `createSafeRedisOps().run()` log va tra `null`. | Giu safety behavior nhung tang metrics/alert Redis error, phan loai loi critical. |
| Medium | Khong thay idempotency/dedup cho backend events. | `relayGenericEvent()` emit ngay khi nhan message. | Neu backend retry Redis/HTTP, them event id va dedup TTL. |
| Low | `logger.js:attachTrace()` ton tai nhung khong thay duoc goi trong runtime socket flow. | `logger.js`, `registerSocketFlows.js`. | Gan trace id cho socket/request neu can correlation. |
| Low | Khong co lint/format script. | `package.json`. | Them `lint`/`format` de giam drift khi team mo rong. |
| Low | Dashboard HTML inline rat lon trong route file. | `registerHttpRoutes.js:renderDashboardHtml()`. | Tach static asset/template neu dashboard tiep tuc phat trien. |

## Improvement roadmap de xuat

1. Bao mat secret va auth: rotate secrets, bat buoc `JWT_SECRET`, protect legacy emit routes.
2. Readiness/observability: them Redis readiness, Redis error metrics, alert dashboard/metrics neu can.
3. Multi-instance readiness: quyet dinh co scale ngang hay khong; neu co, them Socket.IO Redis adapter va integration tests.
4. Contract hardening: schema validate HTTP/Redis payloads, version event contracts.
5. SQL persistence: them migration va repository cho chat/notification/audit khi business can.
6. Developer experience: them `.env.example`, lint/format/CI, OpenAPI hoac route contract docs tu source.

## Chua tim thay trong source

- Khong thay bang risk/ADR ve quyet dinh chap nhan auth fallback hien tai ngoai docs cu trong `document/`.
- Khong thay issue tracker/roadmap trong repo de biet uu tien business.
- Khong thay SLO/SLA production chinh thuc.
- Khong thay alerting config thuc te cho Prometheus/Grafana/Telegram ngoai logger Telegram.
- Khong thay deployment topology, nen rui ro multi-instance la suy luan tu viec khong co adapter trong source.
- Khong thay SQL schema/migration nen chua danh gia duoc retention/persistence business data.
