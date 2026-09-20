# HMS SaaS — Security

> Security posture and controls for the platform. Treat this as authoritative — if code disagrees, fix the code.

## Authentication

- **Passwords**: bcryptjs hashing; never stored plaintext.
- **JWT access token**: 30-minute expiry in an HttpOnly, Secure cookie in production.
- **Refresh token**: 7-day default expiry in an HttpOnly cookie scoped to auth routes; hashed in the database and rotated on refresh.
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
- CORS is restricted to explicit origins from `CORS_ORIGIN`; production accepts only HTTPS origins and credentials are allowed.
- Production startup fails closed unless database, HTTPS app URL, signing credentials, explicit CORS, and `ENABLE_RLS=true` are configured.
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

- Env vars (`.env`, not committed): `DATABASE_URL`, `JWT_ACCESS_PRIVATE_KEY`/`JWT_ACCESS_SECRET`, `CORS_ORIGIN`, `APP_URL`, and storage credentials.
- Webhooks/ApiKeys stored server-side with `secret`/`key` hashed or transport-secured.
- Never log secrets.

## Remaining hardening requirements

- Verify every production tenant-scoped table has the expected PostgreSQL RLS policy; Vercel startup does not create policies.
- Upgrade and test all high-severity dependency advisories before the next release.
- Add malware scanning and independent content detection for uploaded PHI/DICOM files.
- Add refresh-token reuse detection and security-event alerting.
- Complete an independent penetration test and healthcare compliance review.
