# Multi Model Agent

一个同时支持 VPS FastAPI 后端和 Cloudflare Worker 前端会话层的多模型 Agent 项目。

## 仓库结构

当前仓库已经收口为单一源码仓，包含两种运行形态：

- FastAPI 后端
  - `app/main.py`
  - `app/static/`
  - `app/templates/`
- Cloudflare Worker 前端/会话层
  - `src/worker.js`
  - `public/`
  - `wrangler.jsonc`

Worker 负责：

- 静态页面与会话列表
- `codex` 路由决策
- Cloudflare KV 会话存储
- 将后端请求转发到 `BACKEND_BASE_URL`

FastAPI 负责：

- 多模型调用
- 附件处理
- 直接复用 `public/` 提供页面与静态资源
- VPS 本地运行

## FastAPI 本地启动

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

启动后访问：

- `GET /`
- `GET /health`
- `POST /v1/agent/run`
- `GET /v1/sessions`
- `POST /v1/sessions`
- `POST /v1/sessions/{session_id}/chat`

## FastAPI 部署

仓库自带：

- `Dockerfile`
- `docker-compose.yml`
- `scripts/deploy.sh`
- `scripts/update.sh`

典型 VPS 路径：

```bash
cd /opt/cloud-agent
cp .env.example .env
chmod +x scripts/deploy.sh scripts/update.sh
./scripts/deploy.sh
```

后续更新：

```bash
cd /opt/cloud-agent
./scripts/update.sh
```

## Cloudflare Worker 部署

仓库已包含 Worker 发版所需文件：

- `wrangler.jsonc`
- `src/worker.js`
- `public/index.html`
- `public/static/app.js`
- `public/static/styles.css`

直接部署：

```bash
npx wrangler deploy
```

或者直接调用仓库脚本：

```bash
./scripts/deploy-worker.sh
```

当前 Worker 依赖这些绑定：

- `SESSIONS` KV namespace
- `ASSETS` static assets binding
- `BACKEND_BASE_URL`
- `CODEX_BRIDGE_TOKEN`
- `CODEX_BRIDGE_URL`
- `GEMINI_API_KEY`
- `WECOM_WEBHOOK_URL`

## GitHub Actions 自动发版

仓库已带：

- `.github/workflows/deploy-worker.yml`

触发条件：

- `main` 分支上涉及 `src/**`、`public/**`、`wrangler.jsonc` 的提交
- 手动 `workflow_dispatch`

要让自动发版生效，只需要在 GitHub 仓库 Secrets 里配置：

- `CLOUDFLARE_API_TOKEN`

这个 Token 需要至少具备：

- Workers write
- Workers KV write
- Pages write（可选）
- Account read

## 主要环境变量

FastAPI 侧：

- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `ZHIPU_API_KEY`
- `APP_ACCESS_PASSWORD`
- `DEFAULT_OPENAI_MODEL`
- `DEFAULT_GEMINI_MODEL`
- `DEFAULT_ZHIPU_MODEL`
- `SESSION_STORE_PATH`

Worker 侧：

- `BACKEND_BASE_URL`
- `CODEX_BRIDGE_URL`
- `CODEX_BRIDGE_TOKEN`
- `GEMINI_API_KEY`
- `WECOM_WEBHOOK_URL`

## 当前维护建议

如果要改 Cloudflare 线上页面和会话逻辑，改这里：

- `src/worker.js`
- `public/index.html`
- `public/static/*`

如果要改 VPS FastAPI 版本页面，改这里：

- `app/main.py`
- `public/index.html`
- `public/static/*`

现在 FastAPI 和 Worker 已经共用 `public/` 作为运行时前端入口。`app/static/*` 和 `app/templates/index.html` 仍保留在仓库里，属于待清理的历史文件。
