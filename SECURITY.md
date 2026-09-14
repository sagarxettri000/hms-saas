# Security Assessment — HMS SaaS Backend

Internal white-hat audit of the platform's attack surface, performed against the
deployed backend (`hms-saas-api-production.up.railway.app`) and localhost.
Severity: High / Medium / Low / Info. Prod was only probed read-only; full PoCs
were executed on localhost.

## Summary

The authN/authZ core is solid: JWT role is derived from the DB (never trusted
from the token), tenant isolation is enforced for every non-super call path
checked, CSRF is required for cookie-authenticated mutations, password changes
revoke sessions, and rate limits are in place. Two High findings relate to how
much outside trust the platform grants by default.

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | High | Unauthenticated self-onboarding created a live `HOSPITAL_ADMIN` | **Fixed** (select v2) |
| 2 | High | `JWT_ACCESS_SECRET` compromise => full backend via token forgery | **Fixed** (RS256 + kid rotation) |
| 3 | Medium | Account enumeration via `register` + login status messages | **Fixed** |
| 4 | Low | Token `permissions` claim is client-asserted | Accepted (role is DB-derived) |

---

## Finding 1 — High: Unauthenticated self-onboarding granted a live admin account

`POST /api/v1/tenants` is `@Public`, throttled (5/min). It created a tenant plus
an **`ACTIVE` `HOSPITAL_ADMIN`** whose password is supplied by the caller
(`tenants.service.ts` `create`). Login never enforced `emailVerifiedAt`, so the
caller could sign in immediately (change-password was an allowed path, then a
full admin session).

**Proof (localhost):** anonymous `POST /tenants` with a chosen password -> login
200 -> `/auth/change-password` -> re-login -> `/auth/me`, `/users`, `/beds` all
200. Prod route confirmed live (rolled-back transaction probe, nothing written).

**Fix:** onboarded admin is now created `PENDING` (login already rejects
`PENDING` with "Account not yet activated"). A platform admin must activate the
account — same contract as `register()`. Email is never claimed verified; admin
sets their own password on first sign-in after activation.

**Residual impact:** an anonymous caller can still create empty TRIAL tenants
(platform pollution / rate-limited abuse). Consider an invite or allowlist for
onboarding if that becomes a problem.

---

## Finding 2 — High: Signing-key compromise equals full backend ownership

JWTs are HS256 (`jwt.strategy.ts`) with a single static secret resolved at boot.

- `validate()` trusts any token with a valid signature; the DB row supplies
  role/tenant by `sub`.
- A forged token for a known user id bypasses password, 2FA, `mustChangePassword`
  and session checks entirely.
- Admin/owner/superadmin roles bypass all permission checks, so minting a token
  for such a user is a full takeover. User CUIDs leak in audit/log responses
  (`createdBy`), making the `sub` easy to obtain once a secret is known.
- No key rotation; tokens signed before a rotation stay valid until expiry.
- Prod secrets live only in Railway env vars (not committed — verified).

**Fix:** Access tokens are now signed with RS256 when `JWT_ACCESS_PRIVATE_KEY`
is set; the strategy verifies via `JWT_ACCESS_PUBLIC_KEYS` (bare PEM or JSON
array). Each signed token carries a `kid` header derived from a SHA-256
fingerprint of the active public key, so the verifier matches the correct key
on rotation — multiple rotated keys coexist in `JWT_ACCESS_PUBLIC_KEYS`. HS256
signing is still available as a fallback when only `JWT_ACCESS_SECRET` is set,
and `JWT_ACCESS_SECRET` is still used for non-access tokens (2FA setup, SSE).

**Rotation procedure:** generate a new RSA key pair, add the new private key to
`JWT_ACCESS_PRIVATE_KEY` (only the server-signing process needs it), and append
the new public key to `JWT_ACCESS_PUBLIC_KEYS`. Existing tokens carry the
fingerprint of the key that signed them and will keep validating against the
matching entry until they expire. Remove old entries once the TTL window has
elapsed. `JWT_ACCESS_SECRET` can be removed entirely once all tokens in the
field were signed with RS256.

**Residual risk:** `JWT_REFRESH_SECRET` is vestigial (unused; refresh tokens are
opaque). Remove it from prod at the next env sweep.

---

## Finding 3 — Medium: Account enumeration

- `register()` throws `ConflictException` for an existing email (public route).
- `login()` returns distinct messages for `PENDING`, `SUSPENDED`, `LOCKED`,
  `INACTIVE`, deleted accounts.

This lets bots enumerate valid emails and account state.

**Fix:** `register()` now always returns the same generic success response
("If the email is valid...") regardless of whether an account exists; the user
id is never returned. `login()` and `checkUserAccessible()` collapse all
failure states into a single `"Invalid email or password"` response — the
server performs a dummy bcrypt comparison when the user is missing to keep
response timing uniform.

---

## Finding 4 — Low: Token `permissions` are client-asserted

`permissions` are read from the signed payload, while `role` is DB-derived and
nullifies the permission check for admin/owner/superadmin. The risk surface is
tied to Finding 2, but note that a low-privilege user's forgotten token grants
exactly the `permissions` claim listed in it; re-derive permissions from the DB
on each request if tighter controls are ever needed.

---

## Confirmed strengths (no action)

- `jwt.strategy.ts` throws at boot when neither `JWT_ACCESS_SECRET` nor
  `JWT_ACCESS_PRIVATE_KEY` is configured; no weak fallback secret; `ignoreExpiration:false`.
- Role comes from the DB, not the token; `TenantGuard` ignores `X-Tenant-ID`
  overrides for non-supers; `resolveTenantId`/`scopeTenantId` clamp every data
  route checked (users, tenants).
- `CsrfCookieGuard` enforces `X-HMS-CSRF` on cookie-authenticated mutations;
  bearer (server-to-server) flows are unaffected.
- `MustChangePasswordGuard` locks down access with a narrow allowed-path escape;
  **password change revokes all sessions**.
- Login throttling (5/min) and global throttle (100/60) are active; observed 429.
- Public `register()` yields `PENDING` accounts that cannot log in.
- No `@Public()` routes on PHI modules (doctor-share, dicom, exports, webhooks).
- Helmet + CORS allowlist from env; Swagger disabled in production.
- `ValidationPipe` whitelist + `forbidNonWhitelisted` + implicit conversion.

## Verification commands

- **Local keygen (transition mode):** set `JWT_ACCESS_PRIVATE_KEY` (PKCS#8 PEM,
  `\n`-escaped) in `apps/server/.env`; optionally set `JWT_ACCESS_PUBLIC_KEY`
  (bare PEM or JSON array). When omitted the public key is derived at boot.
- **RSA-only mode (recommended):** delete `JWT_ACCESS_SECRET` entirely — legacy
  HS256 forged tokens are rejected; only RS256 access tokens are accepted.
- **Transition mode:** `JWT_ACCESS_SECRET` present — legacy HS256 tokens are
  still accepted (allows existing sessions to keep working until expiry).
- Server: `npm test` (Jest), `npm run build`
- Web: `npm run typecheck` (in `apps/web`)