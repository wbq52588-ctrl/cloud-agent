# DeepSeek Workspace

一个部署在 VPS 上的 DeepSeek 聊天工作台。当前项目已经收口为 FastAPI 后端直接托管静态前端，不再依赖 Cloudflare Worker、Render、多模型 provider 或 iOS/Capacitor。

## 当前能力

- DeepSeek-only 聊天接口
- DeepSeek V4 Pro thinking / reasoning 流式展示
- SQLite 会话存储，支持按用户隔离
- 图片与文本类附件上传，不支持视频
- AFC stats 项目外部上下文接入
- 简单访问口令、每用户限流、请求 correlation id 日志
- Docker Compose 部署到 VPS

## 目录结构

```text
app/
  main.py                       FastAPI 路由、静态前端、会话接口、SSE 流式接口
  agent_service.py              组装模型请求，注入外部上下文、装饰提示词和 skill
  providers/deepseek_provider.py DeepSeek API 适配，含普通调用与流式调用
  session_store.py              SQLite 会话存储，含 reasoning_content 迁移
  external_context.py           调用 AFC stats AI 接口补充上下文
  skill_loader.py               按关键词注入 AFC stats skill
  attachment_utils.py           上传附件文本化
  rate_limit.py                 内存限流
  logging_config.py             JSON 日志与 correlation id

public/
  index.html
  static/app.js                 前端逻辑、会话、上传、SSE、推理过程展示
  static/styles.css             前端样式

skill/
  afc-stats-project-skill/      AFC stats 项目 skill

scripts/
  deploy.sh                     本地目录 Docker 部署
  release.sh                    拉取代码、重建容器、健康检查
  update.sh                     release.sh 包装脚本
```

## 本地运行

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

访问：

- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/health`

也可以用 Node 的本地调试服务：

```bash
npm run local
```

## VPS 部署

生产目录：

```bash
/opt/cloud-agent
```

部署：

```bash
cd /opt/cloud-agent
./scripts/deploy.sh
```

更新：

```bash
cd /opt/cloud-agent
./scripts/update.sh
```

生产入口：

- `https://agent.552588.xyz/`
- `https://agent.552588.xyz/health`

Docker 映射：

```text
host 18000 -> container 10000
```

## 环境变量

```env
DEEPSEEK_API_KEY=your-deepseek-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEFAULT_DEEPSEEK_MODEL=deepseek-v4-pro
APP_ACCESS_PASSWORD=change-me
SESSION_STORE_PATH=data/sessions.db
SESSION_TTL_DAYS=30
PROVIDER_TIMEOUT_SECONDS=45
PROVIDER_MAX_RETRIES=1
PROVIDER_RETRY_BASE_DELAY=1.2
```

## 主要接口

- `GET /`
- `GET /health`
- `GET /v1/public-config`
- `GET /v1/sessions`
- `POST /v1/sessions`
- `GET /v1/sessions/{session_id}`
- `DELETE /v1/sessions/{session_id}`
- `POST /v1/sessions/{session_id}/chat`
- `POST /v1/sessions/{session_id}/chat/stream`
- `POST /v1/agent/run`
- `POST /v1/client-log`

## 请求流程

1. 浏览器访问 `https://agent.552588.xyz/`
2. nginx 反代到 VPS `127.0.0.1:18000`
3. Docker 容器内 FastAPI 接收请求
4. 前端提交会话请求到 `/v1/sessions/{session_id}/chat/stream`
5. 后端读取用户会话并合并上传附件
6. 如果问题涉及 AFC stats，则读取 `afcstats.552588.xyz` 的 AI 上下文接口
7. 后端注入 skill 与 Claude Code 风格约束
8. 调用 DeepSeek，流式返回 `thinking`、`progress`、`final` 事件
9. 完整回复和 reasoning 内容写入 SQLite

## 外部上下文

AFC stats 相关问题会按关键词触发外部上下文读取：

- `GET https://afcstats.552588.xyz/api/ai/context`
- `GET https://afcstats.552588.xyz/api/ai/insights`

当前只自动读取上下文，不自动写回 stats 项目。

## 注意事项

- 项目不再使用 Cloudflare Worker。
- 项目不再使用 Gemini、OpenAI、Zhipu、VPS provider。
- 项目不包含 iOS/Capacitor 打包配置。
- 会话按 `x-wecom-userid` 隔离；没有用户 ID 时使用 default 存储。
- 本地 `data/` 和生产 `/opt/cloud-agent/data` 是运行数据，不要随意删除。
