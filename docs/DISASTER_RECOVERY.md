# HMS SaaS — Disaster Recovery

> Backup, restore, and recovery plan. Not yet fully operationalized — follow-up items listed at the end.

## Data Assets

- **Primary**: PostgreSQL database `hms_saas` (all tenant + platform data).
- **Code/config**: the monorepo (version-controlled), `.env` (never committed, must be backed up separately).

## Backup Strategy

### Database
- **Dev**: run `pg_dump` periodically (or at least before destructive migrations).
- **Staging/Prod (to implement)**: managed Postgres automated daily backups + WAL/PITR where available.

### Files
- Uploads: patient documents, radiology images (`PatientDocument.filePath`, `RadiologyImage.filePath`). Currently local disk — **move to object storage** for durability.
- `.env` secrets: store in the host secret manager; keep one offline copy with an owner.

## Restore Procedure

### Database
```bash
# Dump
pg_dump -h 127.0.0.1 -U <user> -d hms_saas -Fc -f hms_saas.dump

# Restore to same/named DB
pg_restore -h 127.0.0.1 -U <user> -d hms_saas_restore --clean --if-exists hms_saas.dump
```

### Application
1. Restore DB from dump.
2. Restore uploads from storage/backup.
3. Restore `.env` from secret manager.
4. `npm ci`, `npm run db:generate`, `npm run build`.
5. Start server then web; verify `/api/v1/health` + login + a sample read.

## RPO / RTO Targets

- **RPO**: ≤ 24h (daily backups); ≤ 1h with WAL.
- **RTO**: ≤ 2h for full restore; ≤ 30min for last-known-good backup restore.

## Critical Scenarios

| Scenario | Response |
|----------|----------|
| Node crash / EADDRINUSE | Restart via `Stop-HMS.bat` + `Start-HMS.bat`; ensure only one instance per port |
| DB corruption | Restore from latest dump; replay WAL if available |
| Disk loss (uploads) | Restore from object-storage backup |
| `.env` loss | Recreate from secret manager + documented values |
| Ransomware / malicious change | Restore from last clean backup; audit `AuditLog` for the vector |

## Drill / Verification

- Run a monthly restore drill into a scratch DB (`hms_saas_restore`) and verify row counts + a login.
- After every restore, verify: tenant isolation intact, financial totals match `DailyClosing`, audit log present.

## Gaps / Next Steps

1. Schedule automated backups (cron / managed service) for dev + staging.
2. Move uploads to object storage (S3-compatible) with lifecycle rules.
3. Add `backup-drill.sh` + document a runbook owner.
4. Enable WAL archiving on staging Postgres.
