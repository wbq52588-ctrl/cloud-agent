# Multi Model Agent

一个可直接部署到云服务的轻量 API，统一调用 OpenAI 和 Gemini 模型。

## 功能

- 单个 HTTP 接口切换 `openai` / `gemini`
- 支持 `system_prompt`、多轮 `messages`、`temperature`、`max_output_tokens`
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

- `GET /health`
- `POST /v1/agent/run`

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
- `DEFAULT_OPENAI_MODEL`: 默认 `gpt-4.1-mini`
- `DEFAULT_GEMINI_MODEL`: 默认 `gemini-2.5-flash`

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
