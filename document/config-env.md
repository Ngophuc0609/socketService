# Config And Environment

Cap nhat: 2026-05-20. Tai lieu nay ghi lai bien moi truong thuc su duoc source doc, cong voi bien chi duoc scripts dung.

## Dan chung source chinh

| Nhom config | File/function cu the |
| --- | --- |
| Runtime config | `src/config/env.js:readEnv()` |
| Bootstrap dotenv | `server.js`, `src/config/env.js` |
| Logger/Telegram config | `logger.js` |
| Phase 6 preflight | `scripts/phase6/runPreflightCheck.js:readConfig()` |
| Phase 6 contract | `scripts/phase6/runContractTest.js:main()` |
| Phase 6 soak | `scripts/phase6/runSoakTest.js:main()` |
| Example env | `.env.staging.example` |

## Runtime env duoc `readEnv()` doc

| Bien | Default/source | Runtime use |
| --- | --- | --- |
| `NODE_ENV` | `development` | Xac dinh `environment`; neu `staging` co policy bat buoc JWT secret. |
| `PORT` | `8605` | HTTP server listen port. |
| `CORS_ORIGIN` | `*` | Socket.IO CORS origin. |
| `REDIS_HOST` | `localhost` | Redis command/subscriber host. |
| `REDIS_PORT` | `6379` | Redis port. |
| `REDIS_PASSWORD` | `undefined` neu rong | Redis password. |
| `REDIS_CHANNEL` | `bechill:events` | Redis Pub/Sub channel runtime va scripts. |
| `REDIS_SOCKET_TTL_SECONDS` | `2592000` | TTL socket/user/room Redis khi SQL available. |
| `REDIS_LOCATION_TTL_SECONDS` | `300` | TTL location cache. |
| `REDIS_MAX_FALLBACK_TTL_SECONDS` | `604800`, hard cap toi da 7 ngay | Max TTL Redis khi SQL unavailable. |
| `SQL_ENABLED` | enabled unless `"false"` | Bat/tat optional SQL check. |
| `SQL_DRIVER` / `DB_CLIENT` | infer tu URL neu co | `mysql`, `postgres`, hoac `mssql`. |
| `SQL_URL` / `DATABASE_URL` | none | Connection string optional. |
| `SQL_HOST` / `DB_HOST` | none | SQL host neu khong dung URL. |
| `SQL_PORT` | driver default | SQL port. |
| `SQL_DATABASE` / `DB_DATABASE` / `DB_NAME` | none | Database name. |
| `SQL_USER` / `DB_USER` | none | Database user. |
| `SQL_PASSWORD` / `DB_PASSWORD` | none | Database password. |
| `SQL_ENCRYPT` | false | MSSQL encrypt option. |
| `SQL_TRUST_SERVER_CERTIFICATE` | true | MSSQL trust server certificate option. |
| `SQL_CONNECTION_TIMEOUT_MS` | `5000` | SQL connection timeout. |
| `ADMIN_MONITOR` | false unless `"true"` | Bat/tat namespace `/admin`. |
| `ADMIN_JWT_SECRET` | fallback `JWT_SECRET`, default `""` | Admin JWT HS256 secret. |
| `JWT_SECRET` | `""` | User JWT HS256 secret va fallback admin secret. |
| `REQUIRE_JWT_SECRET_ON_STAGING` | true unless `"false"` | Neu staging va thieu `JWT_SECRET`, runtime fail startup. |

Dan chung: `src/config/env.js:readEnv()`.

Driver package can cai theo database dung thuc te:

- MySQL/MariaDB: `mysql2`
- PostgreSQL: `pg`
- SQL Server: `mssql`

Neu driver package chua cai, `createSqlDatabase()` xem SQL la unavailable, log/Telegram va runtime van chay voi Redis fallback TTL.

## Runtime config hard-code trong source

| Config | Gia tri | Source |
| --- | --- | --- |
| Socket TTL | `30 * 24 * 60 * 60` giay | `readEnv().redis.socketTtlSeconds` |
| Location TTL | `300` giay | `readEnv().redis.locationTtlSeconds` |
| Pub/Sub channel runtime | `process.env.REDIS_CHANNEL || "bechill:events"` | `readEnv().redis.pubSubChannel` |
| Socket.IO transports | `websocket`, `polling` | `createRuntime()` |
| Socket.IO CORS methods | `GET`, `POST` | `createRuntime()` |

Neu SQL unavailable, `resolveRedisTtlPolicy()` cap TTL Redis toi da 7 ngay. Bien `REDIS_MAX_FALLBACK_TTL_SECONDS` co the giam thap hon 7 ngay nhung khong the nang cao hon 7 ngay trong source.

## Logger env

| Bien | Default/source | Use |
| --- | --- | --- |
| `DEBUG_SOCKET` | false unless `"true"` | Bat `logDebug()`. |
| `TELEGRAM_BOT_TOKEN` | `"DEBUG_TOKEN"` neu khong set | Token dung de goi Telegram API neu enabled. |
| `TELEGRAM_CHAT_ID` | none | Co gia tri thi enable Telegram sending. |
| `TELEGRAM_LEVEL` | `ERROR` | Nguong gui Telegram: `DEBUG|INFO|WARN|ERROR` theo order trong `shouldSendTelegram()`. |

Dan chung: `logger.js`.

## Script/env cho validation

### Preflight

`scripts/phase6/runPreflightCheck.js` doc:

- `SERVICE_URL` default `http://localhost:8605`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `REQUIRE_JWT_SECRET_ON_STAGING`
- `NODE_ENV`
- `JWT_SECRET`

### Contract test

`scripts/phase6/runContractTest.js` doc:

- `SERVICE_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `REDIS_CHANNEL` default `bechill:events`
- `CONTRACT_DRIVER_USER_ID`
- `CONTRACT_CUSTOMER_USER_ID`
- `CONTRACT_DRIVER_BEARER`
- `CONTRACT_CUSTOMER_BEARER`
- `CONTRACT_TIMEOUT_MS`
- `CONTRACT_FIXTURE`
- `CONTRACT_TRIP_ID`

### Soak test

`scripts/phase6/runSoakTest.js` doc:

- `SERVICE_URL`
- `SOAK_DURATION_SECONDS`
- `SOAK_INTERVAL_MS`
- `REDIS_CHANNEL`
- Redis connection env.

## Env mismatch/unused trong source runtime

| Bien | Tim thay o dau | Tinh trang |
| --- | --- | --- |
| `LOG_LEVEL` | `.env.development`, `.env.production`, `.env.testing` | Khong thay source runtime/logger doc bien nay. |
| `TELEGRAM_LOG_CHAT_ID` | `.env.development`, `.env.production`, `.env.testing` | Khong thay `logger.js` doc; logger dung `TELEGRAM_CHAT_ID`. |

## File env hien co

- `.env`: file local hien tai, khong nen dua gia tri vao tai lieu.
- `.env.development`: co Redis local va Telegram config.
- `.env.production`: co Redis remote/password va Telegram config; can xem la sensitive.
- `.env.testing`: co Redis local va Telegram config.
- `.env.staging.example`: example staging va validation scripts.

## Chua tim thay trong source

- Khong thay loader rieng cho `.env.production`, `.env.development`, `.env.testing`; `src/config/env.js` chi `dotenv.config({ path: path.resolve(process.cwd(), ".env") })`, `server.js` cung `dotenv.config()`.
- Khong thay schema validation/casting loi day du cho env; source chi co helper number/boolean co fallback.
- Khong thay secret manager integration.
- Khong thay SQL migration/schema/table config.
