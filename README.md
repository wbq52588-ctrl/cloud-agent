# Multi Model Agent

一个可直接部署到云服务的轻量多模型 Agent，统一调用 OpenAI 和 Gemini 模型，并自带网页聊天界面。

## 功能

- 单个 HTTP 接口切换 `openai` / `gemini`
- 支持 `system_prompt`、多轮 `messages`、`temperature`、`max_output_tokens`
- 自带网页聊天页、会话列表和上下文保留
- 自带 `docker-compose.yml` 和服务器更新脚本
- 自带 Docker 配置，适合部署到 Render、Railway、Fly.io 或任意容器平台

## 本地启动

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

服务启动后访问：

- `GET /`
- `GET /health`
- `POST /v1/agent/run`
- `GET /v1/sessions`
- `POST /v1/sessions`
- `POST /v1/sessions/{session_id}/chat`

## 请求示例

```bash
curl -X POST http://127.0.0.1:8000/v1/agent/run \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "system_prompt": "You are a helpful cloud agent.",
    "messages": [
      { "role": "user", "content": "Give me a short deployment checklist." }
    ]
  }'
```

Gemini 只需要把 `provider` 改成 `gemini`。

## 环境变量

- `OPENAI_API_KEY`: OpenAI API Key
- `GEMINI_API_KEY`: Gemini API Key
- `APP_ACCESS_PASSWORD`: 网页和 API 的基础访问口令
- `DEFAULT_OPENAI_MODEL`: 默认 `gpt-4.1-mini`
- `DEFAULT_GEMINI_MODEL`: 默认 `gemini-2.5-flash`
- `SESSION_STORE_PATH`: 会话存储文件，默认 `data/sessions.json`

## 会话持久化

当前版本会把网页会话保存到本地文件，默认路径是 `data/sessions.json`。

如果你在 VPS 上希望容器重建后依然保留会话，推荐直接使用根目录的 `docker-compose.yml`，它已经把 `./data` 挂载到容器内的 `/app/data`。

## VPS 更新

推荐在 VPS 上把仓库放到固定目录，例如 `/opt/cloud-agent`，然后：

```bash
cd /opt/cloud-agent
cp .env.example .env
```

把 `.env` 里的真实 key 填好后，首次启动：

```bash
chmod +x scripts/deploy.sh scripts/update.sh
./scripts/deploy.sh
```

后续只要 GitHub 有新代码，VPS 上更新：

```bash
cd /opt/cloud-agent
./scripts/update.sh
```

如果你只想手动使用 Docker 命令，也可以继续用：

```bash
docker run -d \
  --name cloud-agent \
  --restart always \
  --env-file .env \
  -v /opt/cloud-agent/data:/app/data \
  -p 18000:10000 \
  cloud-agent
```

## 云部署

### 推荐方案: Render

1. 把当前目录推到 GitHub。
2. 登录 Render，创建 `New +` -> `Web Service`。
3. 选择你的 GitHub 仓库。
4. Render 会按根目录下的 `Dockerfile` 构建并启动服务。
5. 在 Render 的 `Environment` 页面配置这些变量：
   - `OPENAI_API_KEY`
   - `GEMINI_API_KEY`
   - `DEFAULT_OPENAI_MODEL`
   - `DEFAULT_GEMINI_MODEL`
6. 部署完成后访问：
   - `/health`
   - `/v1/agent/run`

这个项目已经兼容 Render 分配的 `PORT`，不需要额外改启动命令。

### 备选方案: Railway

1. 把代码推到 GitHub。
2. 在 Railway 选择 `Deploy from GitHub repo`。
3. Railway 会使用根目录的 `Dockerfile` 构建服务。
4. 在 `Variables` 中填入同样的环境变量。
5. 使用生成的公网域名对外调用 API。

## 后续可以继续扩展

- 增加工具调用，比如网页搜索、数据库查询、企业内部 API
- 增加会话存储，比如 Redis / Postgres
- 增加鉴权，比如 API Key 或 JWT
- 增加流式输出和前端聊天页面
