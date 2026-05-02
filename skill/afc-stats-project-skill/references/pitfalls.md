# Pitfalls and Recovery

## Local Tooling

- `rg.exe` and `node.exe` may fail locally with `Access is denied`.
- Use PowerShell `Select-String` instead of `rg` if blocked.
- Use VPS `node --check` for validation if local Node is blocked.
- `git` may not be installed in the local PowerShell environment.

## Do Not Destroy User Data

Before modifying `server/data/*.json`, make a backup.

Examples:

- `weekly-report-analysis.json` can contain user-imported weekly reports.
- Cleaning monthly history can make page content “disappear” if only a template-generated report remains.

## Weekly Report Recovery

If weekly content disappears:

1. List files: `ls -lah server/data | grep weekly`.
2. Inspect `weekly-report-analysis*.json` backups.
3. Restore the latest real DOCX report, but remove old auto-generated `daily_patrol`, `other_tasks`, and `scheduled_repairs` sections if they came from incorrect logic.
4. Verify:
   - `/api/weekly-reports/latest?month=YYYY-MM`
   - `/api/weekly-reports/monthly?month=YYYY-MM`

Known good restored April 2026 shape:

- `weekly_faults`: 70
- `safety_checks`: 16
- `hazards`: 37
- `morning_briefings`: 8
- `daily_patrol`: 0
- `other_tasks`: 0
- `scheduled_repairs`: 0

## Mojibake

When reading remote JSON through shell, Chinese may appear as mojibake depending on terminal encoding. Prefer writing to a file and reading with Python/Node using UTF-8.

## Frontend Design

The user prefers a polished “大屏驾驶舱” feel:

- dark cockpit background
- gold/blue/green accents
- strong current navigation state
- slide-like home dashboard modules
- Chinese labels everywhere

Avoid generic white-card admin UI unless requested.

