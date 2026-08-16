# HMS SaaS — Clinical Safety

> Guardrails for features that touch patient care. Safety first — clinical correctness outranks UX (see [ROADMAP.md](ROADMAP.md)).

## Principles

1. **Do no harm** — features that affect treatment/medication/diagnosis must have explicit confirmation steps and audit trails.
2. **Accountability** — every clinical action records who did it (`createdBy`/`updatedBy`/`verifiedBy`/`approvedBy`) and when.
3. **Verification before reporting** — lab and radiology results require verify + approve before a patient sees them.
4. **No destructive deletes** — clinical records are soft-deleted (`deletedAt`) or cancelled with reason, never hard-deleted.

## Per-Area Controls

### Medication (5 Rights)
`MedicationAdministration` enforces: right patient, right medicine, right dose, right route, right time (`scheduledTime` vs `givenTime`, `givenBy`). Status: SCHEDULED / DUE / GIVEN / MISSED / HELD / REFUSED.

- Prescription items link to `Medicine` catalog where possible; dosage/frequency/route captured.
- Pharmacy dispensing is separate from prescribing (`Prescription.status`: DRAFT → APPROVED → DISPENSED).

### Lab
- State machine: ORDERED → SAMPLE_COLLECTED → RECEIVED → PROCESSING → RESULT_READY → VERIFIED → APPROVED → REPORTED (or REJECTED with `SampleRejectionReason`).
- Flag `isAbnormal` / `isCritical` on results; critical values must not be silent.
- Verified/approved results only become reportable.

### Radiology
- ORDERED → SCHEDULED → IN_PROGRESS → IMAGES_UPLOADED → REPORTED → VERIFIED → APPROVED → DELIVERED.
- Images tracked (`RadiologyImage`) with uploader; report requires verification.

### Emergency / OT
- `EmergencyCase`: triage level, MLC (`isMLC`, `mlcNumber`) and police-case flags preserved; admit routing to wards.
- `OTCase`: pre-anesthesia assessment, checklist (WHO-style), anesthesia type, surgeon/assistant/anesthetist attribution.

### Allergies & Conditions
- `PatientAllergy` and `PatientCondition` are first-class; pharmacy/dispensing should warn on known allergies (to strengthen: automatic interaction checks).

### Consent
- `Patient.consentGiven` / `consentDate` / `consentNotes` recorded at registration; documents support privacy (`isPrivate`).

## Process Requirements

- **Discharge**: 4-step flow (discharge → dispense → billing → receipt) so nothing is skipped.
- **Orders**: only qualified roles (DOCTOR, NURSE per rules.md role groups) create clinical orders.
- **Results disclosure**: verified/approved results only; patient portal (future) must respect `isPrivate` and status gates.

## Known Gaps / To Do

- Automatic drug-allergy and drug-drug interaction checking at prescription entry.
- Critical lab value alerting (notification + dashboard).
- Signature capture for clinical documents.
- Adverse-event reporting record.
