# Tai lieu Socket Service

Cap nhat: 2026-05-20. Bo tai lieu nay duoc cap nhat theo source hien tai cua repo Node.js Socket.IO service. Moi phan deu co dan chung file/function cu the va muc "Chua tim thay trong source".

## Bo tai lieu source-audit hien tai

- [Overview](01-project-overview.md)
- [Business Domain Realtime](03-business-logic-realtime.md)
- [Architecture](02-architecture.md)
- [API Routes And Event Contracts](04-api-endpoints-and-event-contracts.md)
- [Data Flow](data-flow.md)
- [Auth And Security](auth-security.md)
- [Config And Environment](config-env.md)
- [Developer Guide](developer-guide.md)
- [Risk And Improvement](risk-and-improvement.md)
- [Testing And Compliance Checklist](testing-compliance-checklist.md)

## Tai lieu ke hoach/migration da co tu truoc

Cac file sau van duoc giu lai de tham chieu lich su migration/phase:

- [05 - Target project architecture](05-target-project-architecture.md)
- [06 - Migration roadmap](06-migration-roadmap.md)
- [07 - Architecture decision records](07-architecture-decision-records.md)
- [08 - Completion assessment and gap closure](08-completion-assessment-and-gap-closure.md)
- [09 - Parity checklist server.js vs modular](09-parity-checklist-serverjs-vs-modular.md)
- [10 - Phase 6 monitoring, metrics and validation](10-phase6-monitoring-metrics-and-validation.md)
- [11 - Phase 6 observability dashboard and alerts](11-phase6-observability-dashboard-and-alerts.md)

## Nguon source chinh

- `server.js`
- `src/index.js`
- `src/app/createRuntime.js`
- `src/transports/http/registerHttpRoutes.js`
- `src/transports/socket/registerNamespaces.js`
- `src/transports/socket/registerSocketFlows.js`
- `src/transports/redis/subscribeBackendEvents.js`
- `src/modules/**`
- `src/infrastructure/**`
- `src/shared/**`
- `logger.js`
- `package.json`
- `test/**/*.test.js`
- `scripts/phase6/*.js`

## Ghi chu quan trong

- `server.js` hien load `./src/index`, nen runtime chinh la modular runtime trong `src/`.
- Redis la state/cache/pub-sub layer chinh cua socket runtime.
- SQL hien la optional connectivity/config layer; neu SQL unavailable, service log/Telegram va Redis TTL fallback bi cap toi da 7 ngay.
- Runtime doc `REDIS_CHANNEL`, default `bechill:events`.
- Tai lieu khong lap lai gia tri secret trong `.env.*`; cac file env co ve chua secret that va nen duoc xu ly nhu thong tin nhay cam.
