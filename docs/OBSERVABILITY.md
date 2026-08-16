# HMS SaaS — Observability

> How we see what the system is doing: logs, audit, notifications, health.

## Logging

- NestJS default logger + `dev_server.log` / `server-output.log` (dev).
- Log structured, actionable messages: who, what, tenant, request path. **No PHI, no secrets.**
- Error responses return sanitized `{ statusCode, message, error }` via `HttpExceptionFilter` — stack traces never reach the client.

## Audit Trail

`AuditLog` (see [SECURITY.md](SECURITY.md)) is the compliance/forensic record:

| Field | Meaning |
|-------|---------|
| `userId`, `userRole` | Who acted |
| `entity`, `entityId` | What was changed |
| `action` | CREATE / UPDATE / DELETE / VIEW / APPROVE / REJECT / LOGIN / LOGOUT / EXPORT / PRINT |
| `previousValue` / `newValue` | Before/after JSON |
| `ipAddress`, `deviceId`, `userAgent` | Where from |
| `timestamp` | When |

- Logged on: auth events, clinical changes, financial events, permission changes, exports/prints.
- Queried via `/audit` endpoint (filter by entity/action/user/date).

## Notifications (User-Facing)

- In-app notifications via SSE stream: `GET /notifications/stream` (auto-reconnect).
- In-memory pub/sub hub broadcasts; client reconnects automatically on drop.
- Channels: IN_APP, EMAIL, SMS, WHATSAPP, PUSH (delivery providers not fully wired yet).

## Health

- `GET /api/v1/health` — liveness for the API; ready probe in production.
- Prisma DB reachability should be reflected in readiness (to implement).

## Metrics (Usage)

- `UsageMetric` (tenant × date × metric) for plan limits (users, patients, storage).
- Backfill views/dashboard KPIs from this table.

## Incident Signals

- 5xx spikes → check `HttpExceptionFilter` logs + DB connection pool.
- `EADDRINUSE` → duplicate server instance (see [DEPLOYMENT.md](DEPLOYMENT.md) — one instance per port).
- Payment failures → check `Payment.status` (PENDING/FAILED) + `FinancialTransaction` trail.

## Gaps / Next Steps

1. Structured JSON logging + correlation IDs across requests.
2. Centralized log sink (Sentry / ELK / hosted) for staging/prod.
3. Alerting on: health 5xx, login lockouts, failed payments, daily-closing mismatches.
4. Notifications: wire real email/SMS providers behind `IntegrationSetting`.
