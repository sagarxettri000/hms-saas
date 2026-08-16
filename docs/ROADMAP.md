# HMS SaaS — Roadmap

> Rough priority order. Items move up when validated by real usage.

## Done (see [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md))
- Monorepo setup, auth (JWT + refresh), RBAC, tenancy core
- Core modules: patients, appointments, encounters, admissions, billing, pharmacy, laboratory, radiology, OT, emergency, blood bank
- Support modules: accounting, HR, insurance, membership, doctor-share, CRM, procurement, settings, notifications (SSE), audit, webhooks
- Frontend: AppShell + ModulePage/EntityPage CRUD framework, auth pages, receipts, discharge flow

## In Progress
- Stabilize billing flows (discount approval, deposits, daily closing)
- Frontend module coverage for all 24 backend modules
- Backend test coverage (see [TESTING_STRATEGY.md](TESTING_STRATEGY.md))

## Next (short term)
1. Reports module — financial, clinical, inventory dashboards.
2. Patient portal (self-service: bookings, results, payments).
3. Integration settings UI (email/SMS/webhook provider config).
4. 2FA enforcement and session revocation hardening.

## Later (medium term)
5. FHIR-ready export layer (see [INTEROPERABILITY.md](INTEROPERABILITY.md)).
6. Telemedicine / video consult hooks.
7. Mobile-friendly PWA build.
8. Multi-branch dashboard and cross-branch analytics.

## Vision (long term)
- Regional multi-tenant HMS network with patient records portability (Nepal-first).
- AI-assisted coding/billing, inventory forecasting, clinical decision support.
- Instrument/LIS integration for labs.

## Priorities Rule
- Clinical safety > financial correctness > UX > performance.
- Never ship a billing or clinical change without tests (see [TESTING_STRATEGY.md](TESTING_STRATEGY.md)).
