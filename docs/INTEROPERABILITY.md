# HMS SaaS — Interoperability

> Standards and exchange strategy. Currently minimal — plan outlined for FHIR readiness.

## Current Capabilities

- **Webhooks**: outbound event delivery with signature + retry (`Webhook`, `WebhookDelivery`) — integration hook today.
- **API Keys**: scoped keys for external clients (`ApiKey` with permissions) — partner access today.
- **Integration settings**: `IntegrationSetting` per provider (config JSON, enabled flag) — provider wiring point.
- **ICD-10**: `PatientCondition.icd10Code`, `Encounter.icd10Code`, `Diagnosis.icd10Code` captured but no reference catalog enforced.

## Standards Roadmap

### FHIR (planned)
- Map core resources: Patient, Encounter, Condition, Observation (vitals/lab), DiagnosticReport (lab/radiology), MedicationRequest (prescription), Invoice/Claim, Organization (tenant), Practitioner (doctor/staff).
- Expose read-only FHIR-compatible endpoints (e.g. `/fhir/Patient`, `/fhir/Observation`) gated by API keys.
- Support MRN/UUID mappings for external systems.

### Coding Systems (planned)
- Enforce/reference ICD-10 for diagnoses and procedures.
- Medicine catalog with generic + brand names (SNOMED/AI-atom mapping later).
- Lab test codes consistent with local (NAPML) naming.

### Exchange Formats (planned)
- Export: PDF reports (already print-oriented via ReceiptModal), CSV export on list endpoints (`EXPORT` permission exists).
- Import: patient demography bulk upload (CSV) for onboarding.

## Integration Points Already Present

| Integration | Mechanism | Status |
|-------------|-----------|--------|
| Email/SMS providers | `IntegrationSetting` + `Notification` channels | Provider wiring pending |
| External clients | `ApiKey` + `Webhook` | Implemented, needs docs/UX |
| LIS instruments | Webhook/API | Not yet |
| Insurance TPA | `InsuranceClaim` + API | Not yet |

## Rules

- Never bypass tenant scoping for external integrations — every call is tenant-scoped.
- Audit external access (`AuditLog`) and log webhook deliveries (`WebhookDelivery`).
- Mark PHI-bearing integrations as requiring security review (see [SECURITY.md](SECURITY.md)).
- Keep FHIR endpoint work additive — internal API (`/api/v1`) stays the source of truth.

## Gaps / Next Steps

1. Define FHIR resource map against `schema.prisma` (start with Patient/Observation/DiagnosticReport).
2. Stand up `/fhir` module behind `ApiKey` auth.
3. CSV export + PDF report endpoints for clinical/financial exports.
4. Reference catalogs: ICD-10, lab test codes, medicine master.
