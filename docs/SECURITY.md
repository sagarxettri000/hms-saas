# HMS SaaS — Security

> Security posture and controls for the platform. Treat this as authoritative — if code disagrees, fix the code.

## Authentication

- **Passwords**: bcryptjs hashing; never stored plaintext.
- **JWT access token**: 15-minute expiry, stored client-side in `localStorage.accessToken`.
- **Refresh token**: 7-day expiry in `localStorage.refreshToken`; rotated on refresh; single-use.
- **Sessions**: tracked in `Session` table (token, refreshToken, device, IP, expiry, revoke).
- **Password reset**: tokenized `PasswordResetToken` with expiry; `forgot-password` + `reset-password`.
- **First-login enforcement**: `MustChangePasswordGuard` blocks until password changed.
- **Lockout**: `failedLoginCount` + `lockedUntil` on `User`; `ThrottlerGuard` on login/register/reset.

## Authorization (RBAC)

Enforced by three guards (in order) in `apps/server/src/common/guards/`:

1. **JwtAuthGuard** — verifies JWT via passport-jwt. Skips when route is `@Public()`.
2. **TenantGuard** — resolves/validates tenant context from `X-Tenant-ID` header; `PLATFORM_SUPER_ADMIN` auto-assigns first ACTIVE tenant; others must have `tenantId`.
3. **PermissionsGuard** — checks route `@Permissions(...)` against `user.permissions`; `PLATFORM_SUPER_ADMIN` bypasses.

Permissions defined in `packages/shared/src/permissions/index.ts`:
```ts
import { ROLE_PERMISSIONS, PermissionAction } from '@hms/shared';
if (ROLE_PERMISSIONS[userRole].includes(PermissionAction.DELETE)) { ... }
```

## Multi-Tenant Isolation

- Every domain table has `tenantId`; all tenant-scoped queries are filtered by it.
- Do **not** trust client data for cross-tenant reads — always scope by `request.user.tenantId`.
- Soft delete (`deletedAt`) on `Tenant`, `User`, `Patient`; deletions are auditable, not destructive.

## HTTP & Transport

- `helmet()` active on the Nest app.
- CORS restricted to `CORS_ORIGIN` env (default `http://localhost:3000`), credentials allowed.
- Global `ValidationPipe`: `whitelist: true`, `forbidNonWhitelisted: true` — unknown fields rejected.
- `HttpExceptionFilter` returns `{ statusCode, message, error }` — no stack traces leaked.
- Global prefix `api/v1`.

## Data Protection (PHI)

- Patient data is sensitive. Access is role-scoped (clinical/reception/finance groups only).
- `PatientDocument` supports `isPrivate`; documents default to private.
- Audit logging (`AuditLog`) records who/action/entity/values/IP for clinical and financial actions.
- No PHI in logs, error messages, or URLs.

## Audit

`AuditLog` model captures `action`, `entity`, `entityId`, `previousValue`, `newValue`, `ipAddress`, `userAgent`, `userId`. See [OBSERVABILITY.md](OBSERVABILITY.md).

## Secrets

- Env vars (`.env`, not committed): `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`.
- Webhooks/ApiKeys stored server-side with `secret`/`key` hashed or transport-secured.
- Never log secrets.

## Known Gaps / To Do

- 2FA enabled flag + `twoFactorSecret` exist on `User` but enforcement is not wired end-to-end.
- Refresh token rotation revocation is tracked but add immediate-revoke on password change.
- Add rate limiting on all tenant-scoped bulk endpoints (beyond auth).
- Consider per-field masking for PHI in list responses.
