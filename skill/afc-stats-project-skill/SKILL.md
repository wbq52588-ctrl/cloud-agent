---
name: afc-stats-project
description: Use this skill when working on the AFC检修六工班班组综合看板 / 工分统计平台 project, including frontend UI changes, score rules, attendance import, workload audit, weekly report analysis, deployment to the VPS, and debugging data sourced from afcops.819521.xyz.
metadata:
  short-description: AFC班组综合看板项目接手指南
---

# AFC Stats Project

Use this skill whenever the user asks to modify, debug, deploy, or explain the AFC班组综合看板 / 工分统计平台 project.

## First Moves

1. Work from `C:\Users\AFC检修六工班\Desktop\afc-stats`.
2. Before editing, inspect the relevant files and current behavior; this project has many user-driven business tweaks.
3. Prefer small, targeted patches. Do not remove user data in `server/data/` unless explicitly asked or after backing it up.
4. Use `apply_patch` for manual edits.
5. Local `node.exe` may fail with `Access is denied`; run Node validation on the VPS when needed.
6. After frontend JS/CSS changes, bump cache query versions in `public/js/app.js`, `public/js/pages.js`, and/or `public/index.html`.

## Read References As Needed

- For project structure and important files: `references/project-map.md`.
- For business rules, scoring, attendance, audit, and weekly report behavior: `references/business-rules.md`.
- For data sources and remote APIs: `references/data-sources.md`.
- For deployment and verification commands: `references/deployment.md`.
- For recent pitfalls and safe recovery notes: `references/pitfalls.md`.

## Coding Style

- Frontend is plain ES modules, no build step.
- Backend is Express CommonJS.
- Keep UI text Chinese.
- Keep score display to two decimals when presenting numeric scores.
- Preserve the dark cockpit dashboard visual language unless the user asks for a redesign.
- Do not introduce Cloudflare deployment files; this project is deployed to a VPS with PM2.

## Validation Checklist

- Backend syntax: run `node --check <file>` on the VPS if local Node is blocked.
- API smoke tests: use local VPS `curl http://127.0.0.1:3000/...`.
- UI cache: bump versions and tell the user to `Ctrl + F5` after deployment.
- Weekly report changes: verify both `/api/weekly-reports/latest?month=YYYY-MM` and `/api/weekly-reports/monthly?month=YYYY-MM`.

