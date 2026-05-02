# Project Map

## Purpose

`afc-stats` is a Chinese dashboard for AFC检修六工班. It aggregates scores, attendance, faults, todos, maintenance, workload submissions, role assignments, and weekly report analysis into a public班组综合看板.

## Runtime

- Frontend: static `HTML + CSS + vanilla JavaScript ES modules`.
- Backend: Node.js + Express.
- Remote source system: `https://afcops.819521.xyz`.
- Production deployment: VPS, PM2 process `afc-stats`, app directory `/opt/afc-stats`.

## Important Files

- `public/index.html`: app shell and JS/CSS cache query versions.
- `public/css/main.css`: imports layout/components/pages CSS.
- `public/css/pages.css`: most page-level and dashboard styling.
- `public/js/app.js`: global state, navigation, API loading, page wiring.
- `public/js/pages.js`: page render routing and event binding.
- `public/js/dashboard-view.js`: 首页 / 班组综合看板 cockpit UI.
- `public/js/weekly-report-view.js`: 周报分析 UI.
- `public/js/weekly-report-controller.js`: weekly report upload/close events.
- `public/js/rules-config.js`: local static score rule catalog and matching.
- `public/js/attendance-view.js`: attendance import UI.
- `public/js/workload-audit-view.js`: workload audit UI.
- `server/app.js`: Express app, static hosting, route mount points.
- `server/config.js`: env defaults and local JSON data file paths.
- `server/routes/analytics.js`: aggregated analytics, attendance, audit, role routes.
- `server/routes/weekly-report.js`: weekly report upload/latest/monthly/closure routes.
- `server/services/analytics.js`: remote API aggregation and local enhancements.
- `server/services/attendance-imports.js`: attendance XLS/XLSX parsing and scoring.
- `server/services/workloads.js`: workload rows and Excel export.
- `server/services/weekly-report.js`: DOCX/XLSX weekly report parser and system-data enrichment.
- `server/services/weekly-report-store.js`: persisted latest/monthly weekly report analysis.
- `scripts/generate-weekly-template.js`: generate the weekly report Excel template.
- `public/templates/weekly-report-standard-template.xlsx`: weekly report template.

## Local Data Files

Files in `server/data/` are live persisted app data. Treat them carefully:

- `attendance-imports.json`
- `attendance-settings.json`
- `member-assignments.json`
- `weekly-report-analysis.json`
- `weekly-report-closures.json`
- `workload-audits.json`

Always back up before rewriting.

