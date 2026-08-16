# HMS SaaS — Project Status

> Snapshot of the current state. Update after meaningful milestones.

**Last updated:** 2026-08-15

## Health

| Area | Status |
|------|--------|
| Frontend (:3000) | Running — login works (admin@nbmaitri.com) |
| Backend (:4000) | Running — `/api/v1` responds, Swagger at `/api/docs` |
| Database | PostgreSQL `hms_saas` — schema seeded |
| Typecheck / Tests | See [TESTING_STRATEGY.md](TESTING_STRATEGY.md); coverage gaps remain |

## What Works

- Auth (register, login, refresh, logout, forgot/reset/change password, me).
- RBAC + tenant isolation guard pipeline.
- Patient registration + MRN + documents; appointments; encounters; admissions; discharge flow.
- Billing (invoice/items, payments, refunds, deposits, credit, daily closing), pharmacy, laboratory, radiology.
- HR, insurance, membership, doctor-share, accounting, procurement, CRM, notifications (SSE), audit.
- Frontend CRUD framework covering the main modules via ModulePage/EntityPage.

## What Needs Work

1. **Testing coverage**: many modules lack unit tests (see [TESTING_STRATEGY.md](TESTING_STRATEGY.md) "Gaps").
2. **Frontend coverage**: not all 24 backend modules have full UI flows (e.g. audit, webhooks, settings, reports).
3. **Billing hardening**: discount approval, deposits application, daily closing flows.
4. **Reports module**: dashboards (financial, clinical, inventory).
5. **2FA enforcement** and session revocation.
6. **Uploads** on local disk — move to object storage ([DISASTER_RECOVERY.md](DISASTER_RECOVERY.md)).
7. **Staging/prod** deployment not yet set up ([DEPLOYMENT.md](DEPLOYMENT.md)).

## Notable Risks

- No automated web tests; refactors could silently break UI.
- Cross-tenant leak risk if any query omits `tenantId` — prioritize tenant-scope audit.
- Financial code correctness is high-stakes; needs regression suite before go-live.

## Next Milestone

Stabilize billing + add the Reports dashboard; then expand frontend module coverage.
