# Deployment

## Production Target

- VPS IP: `104.223.65.237`
- SSH user: `root`
- App directory: `/opt/afc-stats`
- PM2 process: `afc-stats`
- Local key usually exists at project root: `.\codex_deploy_key`

Do not store or repeat plaintext passwords in generated docs or code.

## Common Deploy Pattern

From `C:\Users\AFC检修六工班\Desktop\afc-stats`:

```powershell
scp -i .\codex_deploy_key -o StrictHostKeyChecking=no .\path\to\file root@104.223.65.237:/opt/afc-stats/path/to/file
```

Restart:

```powershell
ssh -i .\codex_deploy_key -o StrictHostKeyChecking=no root@104.223.65.237 "cd /opt/afc-stats && pm2 restart afc-stats --update-env && pm2 status afc-stats --no-color"
```

Syntax check on VPS:

```powershell
ssh -i .\codex_deploy_key -o StrictHostKeyChecking=no root@104.223.65.237 "cd /opt/afc-stats && node --check server/services/weekly-report.js"
```

## Smoke Tests

```powershell
ssh -i .\codex_deploy_key -o StrictHostKeyChecking=no root@104.223.65.237 "curl -s 'http://127.0.0.1:3000/api/weekly-reports/latest?month=2026-04' | head -c 1000"
```

```powershell
ssh -i .\codex_deploy_key -o StrictHostKeyChecking=no root@104.223.65.237 "curl -s 'http://127.0.0.1:3000/api/analytics/users?month=2026-04&includeZero=true' | head -c 1000"
```

## Cache Busting

After frontend JS/CSS edits:

- Update query versions in `public/index.html`.
- Update relevant imports in `public/js/app.js`.
- Update relevant imports in `public/js/pages.js`.

Use a date-like version such as `20260428-02`.

