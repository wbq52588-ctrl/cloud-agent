# Data Sources

## Proxy Mounts

Local app route mount points:

- `/api/analytics/*` from `server/routes/analytics.js`
- `/api/weekly-reports/*` from `server/routes/weekly-report.js`

Remote source base:

- `AFC_BASE_URL`, default `https://afcops.819521.xyz`

## Public Analytics Endpoints Used

These are reachable through this project as proxied/aggregated APIs:

- `/api/analytics/users?month=YYYY-MM&includeZero=true`
- `/api/analytics/overview?month=YYYY-MM`
- `/api/analytics/users/:userId/workload?month=YYYY-MM`
- `/api/analytics/workloads?month=YYYY-MM`
- `/api/analytics/workloads/export?month=YYYY-MM&password=...`
- `/api/analytics/faults?month=YYYY-MM`
- `/api/analytics/todos?month=YYYY-MM`
- `/api/analytics/maintenance?month=YYYY-MM`
- `/api/analytics/attendance?month=YYYY-MM`
- `/api/analytics/rule-usage?month=YYYY-MM`
- `/api/analytics/workloads/audit-summary?month=YYYY-MM`

## Important Caveat: Todos

`/api/analytics/todos` is a score/completion detail endpoint. It is not a complete pending task source.

Fields commonly observed:

- `type`
- `item_id`
- `task_id`
- `occurred_at`
- `title`
- `task_status`
- `scope_type`
- `target_name`
- `start_at`
- `due_at`
- `score`
- `remarks`
- `is_scored`
- `user_id`
- `user_name`
- `role`
- `rank`

Do not treat `task_status: in_progress` alone as proof that the item is unfinished. Many completed/scored records still have task status `in_progress` because the parent task may stay open.

The true task interface in the upstream app uses `/api/todos/tasks`, but direct server access may require login and can return `未登录或无可用身份`.

## Remote Frontend API Discovery

If endpoint behavior is unclear, inspect upstream bundled JS:

- Main app JS references assets such as `/assets/index-*.js`.
- Todo service has used APIs like:
  - `/api/todos/tasks`
  - `/api/todos/tasks/:id/items`
  - `/api/todos/tasks/pending-count`
  - `/api/todos/tasks/:id/details`
  - `/api/todos/items/:id/status`

Do not depend on authenticated upstream endpoints unless credentials/session are available.

