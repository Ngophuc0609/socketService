# AGENTS

## Purpose

- This repository is a Node.js Socket.IO service for BeChill real-time communication.
- Main entry point: [server.js](server.js).
- Logging and Telegram batching utilities: [logger.js](logger.js).
- Basic project usage and client event examples: [README.md](README.md).

## Quick Start

- Install dependencies: `npm install`
- Run production mode: `npm start`
- Run development mode (auto reload): `npm run dev`

## Runtime Requirements

- Node.js (project docs mention Node 18 in deployment environment).
- Redis must be reachable before socket features are considered healthy.
- Required environment values are loaded via `.env`.

## Environment Variables

- `PORT` (default `8605`)
- `REDIS_HOST` (default `localhost`)
- `REDIS_PORT` (default `6379`)
- `REDIS_PASSWORD` (optional)
- `CORS_ORIGIN` (default `*`)
- `DEBUG_SOCKET=true` enables debug logs
- Telegram logging:

  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_CHAT_ID`
  - `TELEGRAM_LEVEL` (`DEBUG|INFO|WARN|ERROR`)

- Optional admin monitoring namespace:

  - `ADMIN_MONITOR=true`
  - `ADMIN_JWT_SECRET` (or fallback `JWT_SECRET`)

## Architecture Notes

- Express HTTP server wraps Socket.IO server.
- Socket.IO supports `websocket` and `polling` transports.
- Redis is used for:

  - socket/user mapping keys (`socket:uid:*`, `socket:info:*`)
  - pub/sub and state fanout patterns in [server.js](server.js)

- Service defines graceful shutdown for SIGINT/SIGTERM and uncaught errors.

## Agent Working Rules

- Keep edits minimal and focused; avoid broad refactors unless requested.
- Preserve existing event names and payload contracts unless task explicitly requires a breaking change.
- When changing socket flows, validate both root namespace and role namespaces behavior.
- Prefer adding narrow helper functions over rewriting large handlers in [server.js](server.js).
- Reuse logger helpers from [logger.js](logger.js) instead of adding ad-hoc `console.log` noise.

## Validation Checklist

- Start service successfully with expected port log.
- Verify Redis connectivity (no startup or runtime Redis errors).
- Test a basic client flow from [README.md](README.md):

  - connect
  - authenticate
  - join trip
  - update location

- For auth or namespace edits, test disconnect and reconnect behavior.

## Common Pitfalls

- Admin namespace auth depends on HMAC token validation and configured secret.
- Redis wrappers intentionally swallow failures after logging; do not remove this safety behavior casually.
- Telegram token default value is non-empty; rely on `TELEGRAM_CHAT_ID` to determine real send enablement.

## Reference

- Usage and event examples: [README.md](README.md)
- Scripts and dependencies: [package manifest](package.json)
