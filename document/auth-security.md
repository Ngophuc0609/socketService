# Auth And Security

Cap nhat: 2026-05-20. Tai lieu nay mo ta co che auth/security tim thay trong source va cac khoang trong chua thay.

## Dan chung source chinh

| Hang muc | File/function cu the |
| --- | --- |
| Auth service | `src/modules/auth/authService.js:createAuthService()` |
| JWT decode/verify | `decodeJwt()`, `verifyHs256Token()`, `verifyUserToken()`, `verifyAdminToken()` |
| Socket handshake auth | `src/transports/socket/registerSocketFlows.js:parseAuthFromHandshake()` |
| Admin namespace auth | `registerSocketFlows()` middleware `/admin` |
| Backend HTTP emit auth | `src/transports/http/registerHttpRoutes.js:requireBackendSecret()` |
| Staging policy | `src/app/createRuntime.js:createRuntime()` va `src/config/env.js:readEnv()` |
| Logger/Telegram secrets | `logger.js` |

## User socket auth

Namespaces `/drivers` va `/customers` yeu cau:

- `Authorization: Bearer <token>` hoac header lowercase `authorization`.
- `user_id` hoac `userId`.

Flow:

1. `parseAuthFromHandshake()` tach Bearer bang `authService.parseBearer()`.
2. Doc user id bang `authService.readUserId()`.
3. Goi `authService.verifyUserToken(token)`.
4. Neu valid, gan `socket.userId`, `socket.accessToken`, `socket.userType`.

JWT rule:

- Neu `JWT_SECRET` co cau hinh, `verifyUserToken()` verify HS256 signature va optional `exp`.
- Neu khong co `JWT_SECRET`, `verifyUserToken()` tra valid voi reason `secret_not_configured` de backward compatibility.

Dan chung: `authService.js:verifyUserToken()`, `registerSocketFlows.js:parseAuthFromHandshake()`.

## Admin auth

Namespace `/admin` chi ton tai khi `ADMIN_MONITOR=true`.

Token source:

- `socket.handshake.auth.token`
- header `authorization`/`Authorization`

Verify:

- `verifyAdminToken()` dung `ADMIN_JWT_SECRET` hoac fallback `JWT_SECRET`.
- Token phai la JWT HS256 hop le.
- Payload phai co `role === "admin"`.
- `socket.adminId` lay tu `payload.userId` hoac `payload.sub`.

Dan chung: `registerSocketFlows.js` admin middleware, `authService.js:verifyAdminToken()`.

## Backend HTTP emit auth

`requireBackendSecret()` chi duoc gan cho:

- `POST /emit/user`
- `POST /emit/trip`
- `POST /emit/broadcast`

Accepted credentials:

- `Authorization: Bearer <token>` verify bang `verifyUserToken()`.
- `x-api-key` hoac `x-api_key` bang raw `JWT_SECRET`.
- Neu user secret khong cau hinh nhung request co api key/bearer, source cho phep de backward compatibility.

Dan chung: `src/transports/http/registerHttpRoutes.js:requireBackendSecret()`.

## Routes khong thay auth

Trong source hien tai khong thay auth middleware cho:

- `GET /health`
- `GET /connections`
- `GET /metrics`
- `GET /dashboard`
- `POST /driver/event`
- `POST /customer/event`

Dan chung: cac route tren duoc register truc tiep trong `registerHttpRoutes()` khong co `requireBackendSecret`.

## Staging startup policy

Neu:

- `NODE_ENV=staging`
- `REQUIRE_JWT_SECRET_ON_STAGING` khong bang `"false"`
- `JWT_SECRET` rong

thi runtime throw loi startup `"JWT_SECRET is required on staging..."`.

Dan chung: `src/app/createRuntime.js:createRuntime()`, `src/config/env.js:readEnv()`.

## CORS va transports

Socket.IO server duoc cau hinh:

- `origin: env.corsOrigin`
- methods `GET`, `POST`
- `credentials: true`
- transports `websocket`, `polling`

Dan chung: `src/app/createRuntime.js:createRuntime()`.

## Secret handling

Source doc/env files co chua cac bien lien quan secret:

- `JWT_SECRET`
- `ADMIN_JWT_SECRET`
- `REDIS_PASSWORD`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Luu y bao mat: trong cac file `.env.*` hien co co gia tri trong nhu secret that. Tai lieu nay khong lap lai cac gia tri do. Nen rotate secret neu chung da tung duoc commit/chia se.

Dan chung: `.env.development`, `.env.production`, `.env.testing`, `.env.staging.example`, `logger.js`, `src/config/env.js`.

## Chua tim thay trong source

- Khong thay so khop `user_id` header voi `sub`, `userId` hoac claim tu JWT payload.
- Khong thay issuer/audience validation cho JWT.
- Khong thay support JWT algorithm ngoai HS256.
- Khong thay secret rotation strategy.
- Khong thay rate limit cho HTTP routes hay socket events.
- Khong thay auth cho dashboard/metrics/connections/health.
- Khong thay CSRF protection cho HTTP routes; day co the khong can neu chi dung server-to-server, nhung source khong the hien.
- Khong thay validation role cho user namespace; role driver/customer duoc suy ra tu namespace, khong tu token claim.
