# Strango Production Readiness

## What Is Implemented

- Admin routes and `admin.html` require HTTP Basic authentication.
- Reports, bans, ratings, appeals, and audit events persist to a JSON store by default, or Postgres when `DATABASE_URL` is set.
- Durable guest identity uses a local device ID so moderation survives socket reconnects.
- Socket.IO can use Redis adapter when `REDIS_URL` is configured.
- WebRTC ICE config is served by `/config/rtc`, with optional TURN credentials.
- Admin dashboard renders user data with DOM APIs instead of unsafe `innerHTML`.
- Automated tests now cover matchmaking, persistent moderation state, ban expiry, ratings, and origin validation.

## Production Environment

Copy `.env.example` into your deployment secret manager and set at least:

- `NODE_ENV=production`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ALLOWED_ORIGINS`
- `REDIS_URL` for clustered deployments
- `DATABASE_URL` for Postgres-backed persistence
- `ADMIN_API_TOKEN` to protect admin writes (optional)
- `HTTP_RATE_LIMIT_PER_MIN`
- `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL` for reliable voice calls

The JSON store is a safe fallback for one process. For high traffic or multi-region production, replace it with a real database while keeping the same moderation concepts: durable users/devices, reports, bans, appeals, ratings, and audit events.

## Cluster Notes

PM2 cluster mode needs Redis:

- All app workers must share the same `REDIS_URL`.
- The load balancer must support WebSocket upgrades.
- Keep sticky sessions enabled unless the Socket.IO deployment is fully tested without them.

## Verification

Run:

```bash
npm test
npm run check
```

Before accepting large traffic, add a staged load test with real Socket.IO clients and verify matchmaking, reconnects, memory, and WebRTC signaling across multiple workers.
