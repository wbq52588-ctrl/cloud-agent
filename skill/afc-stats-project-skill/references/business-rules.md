# Business Rules

## Score Categories

The site treats scoring as five major data classes:

- Faults / 故障
- Todos / 待办
- Maintenance / 检修
- Workload submissions / 个人工作量
- Attendance / 考勤

Final personal score can apply the 100-point normalization rule, but module/category scores should remain raw module totals.

## Attendance Import

- Password/default secret is configured in env; common local default is `369`.
- Attendance import accepts `.xls/.xlsx`.
- Attendance score is a fifth data category.
- 8 work-hour days count as 长白班出勤.
- 10 or 12 work-hour days count as 倒班出勤.
- Sick leave and personal leave do not count as attendance.
- Preserve clear import success/failure messages and audit-friendly charts/details.

## Rule Matching Notes

Rule catalog lives in `public/js/rules-config.js`.

Important matching expectations:

- `灭火器检查` todo records correspond to `灭火器巡检`.
- `消防属地检查` should match the 消防属地 rule.
- `防火检查` was intentionally renamed to `防火巡查`.
- Temporary inspection tasks and sensitive-period tasks should map to their intended rules.
- Do not add duplicate static rules just to force matches; update keywords or matching logic instead.
- Removed rules requested by user: 参与车溅、处理车溅事件、季检相关规则、场段包保.

## Workload Audit

The audit page should audit each submitted workload item, not just score rules.

Expected behavior:

- Each row should show the submitted concrete content/remark.
- The audit modal should let the user confirm whether the submitted item deserves reward and what score is valid.
- Use member detail style for readability where possible.

## Workload Exclusion

- 王炳琦 does not participate in personal workload score or workload calculation.
- His workload score/count/details should be cleared from users, member detail, workload rows, audit, rule usage, overview totals, and export.
- This exclusion is implemented server-side in `server/services/workload-exclusions.js`.

## Role / 包保站

The role management module supports 五大员 and 包保站 assignments.

- Password default: `369`.
- Scores for 五大员 and 包保站 are auto-generated from assignments, not manually filled.

## Weekly Report

Current intended behavior:

- Weekly report page should not show routine todo completion流水 as weekly report content.
- Do not show 日常巡视 completion stream.
- Do not show 计划修记录 as a manual weekly report table.
- Do not infer “逾期未完成” from `/api/analytics/todos`, because that endpoint is score/completion detail, not a complete task ledger.
- Only track incomplete tasks if the data explicitly contains unfinished markers such as `未完成`, `未处理`, `未闭环`, `待处理`, `逾期`, or `临期`.
- `周巡/周迅` and `防火巡查` must not be included in weekly task tracking.
- Weekly report content should still include restored real sections: 本周故障, 检查问题情况, 隐患提报, 每日晨会安全项点.

If weekly content disappears after data cleanup, inspect `server/data/weekly-report-analysis*.json`; old imports may exist in backup files.
