param(
    [ValidateSet("backup", "restore", "list")]
    [string]$Action = "backup",
    [string]$RestoreFile = "",
    [int]$RetentionDays = 14
)

# Backup / restore drill for the HMS SaaS PostgreSQL database.
# Usage:
#   .\scripts\backup.ps1 backup          # dump DB to .\backups\ with timestamp
#   .\scripts\backup.ps1 list            # list existing backups
#   .\scripts\backup.ps1 restore -RestoreFile .\backups\file.dump

$ErrorActionPreference = "Stop"

$DbUrl = $env:DATABASE_URL
if (-not $DbUrl) {
    $DbUrl = "postgresql://postgres:postgres@127.0.0.1:5432/hms_saas?schema=public"
}

# Parse postgres://user:pass@host:port/dbname
if ($DbUrl -notmatch '^postgres(ql)?://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)') {
    throw "Could not parse DATABASE_URL"
}
$PgUser = $Matches[2]
$PgPass = $Matches[3]
$PgHost = $Matches[4]
$PgPort = $Matches[5]
$PgDb = $Matches[6].TrimEnd('/')

$env:PGPASSWORD = $PgPass

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
    # Common install locations on Windows
    $candidates = @(
        "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe",
        "C:\Program Files\PostgreSQL\*\bin\pg_restore.exe"
    )
    $pgDumpExe = (Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue | Sort-Object { [version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1)
    if ($pgDumpExe) {
        $pgDump = $pgDumpExe.FullName
        $Script:pgRestore = (Join-Path $pgDumpExe.DirectoryName "pg_restore.exe")
    }
}
if (-not $pgDump) {
    throw "pg_dump not found. Install PostgreSQL and ensure it is on PATH."
}

$backupDir = Join-Path $PSScriptRoot "..\backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

function Get-Timestamp {
    return Get-Date -Format "yyyyMMdd_HHmmss"
}

switch ($Action) {
    "list" {
        Get-ChildItem $backupDir -Filter *.dump | Sort-Object Name -Descending | ForEach-Object {
            "{0}  {1:N2} MB" -f $_.Name, ($_.Length / 1MB)
        }
        break
    }

    "backup" {
        $stamp = Get-Timestamp
        $out = Join-Path $backupDir "$($PgDb)_$stamp.dump"
        Write-Host "Backing up '$PgDb' to $out ..."
        if ($pgDump -is [string]) {
            & $pgDump --host $PgHost --port $PgPort --username $PgUser --format=custom --file $out $PgDb
        } else {
            & $pgDump.Source --host $PgHost --port $PgPort --username $PgUser --format=custom --file $out $PgDb
        }
        if ($LASTEXITCODE -ne 0) { throw "Backup failed" }

        # Retention cleanup
        $old = Get-ChildItem $backupDir -Filter *.dump | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) }
        foreach ($f in $old) {
            Write-Host "Pruning old backup: $($f.Name)"
            Remove-Item $f.FullName
        }

        $size = (Get-Item $out).Length / 1MB
        Write-Host "Backup complete: {0:N2} MB" -f $size
        break
    }

    "restore" {
        if (-not $RestoreFile) { throw "restore requires -RestoreFile <path>" }
        if (-not (Test-Path -LiteralPath $RestoreFile)) { throw "Backup file not found: $RestoreFile" }
        if (-not $Script:pgRestore) {
            $pgRestoreExe = Get-Command pg_restore -ErrorAction SilentlyContinue
            if (-not $pgRestoreExe) { throw "pg_restore not found" }
            $Script:pgRestore = $pgRestoreExe.Source
        }
        Write-Warning "This will DROP and recreate database '$PgDb'. Are you sure? (y/N)"
        $confirm = Read-Host
        if ($confirm -notmatch '^y') { Write-Host "Aborted."; exit 0 }

        & psql --host $PgHost --port $PgPort --username $PgUser -d postgres -c "DROP DATABASE IF EXISTS $PgDb"
        & psql --host $PgHost --port $PgPort --username $PgUser -d postgres -c "CREATE DATABASE $PgDb"
        & $Script:pgRestore --host $PgHost --port $PgPort --username $PgUser --dbname $PgDb $RestoreFile
        if ($LASTEXITCODE -ne 0) { throw "Restore failed" }
        Write-Host "Restore complete."
        break
    }
}
