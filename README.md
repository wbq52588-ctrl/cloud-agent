# DeepSeek Workspace

一个部署在 VPS 上的 DeepSeek 聊天工作台。项目现在已经收口为：

- FastAPI 后端
- 本地静态前端，由 FastAPI 直接托管
- DeepSeek API 调用
- 按用户隔离的本地会话存储
- AFC stats 项目上下文接入

## 目录结构

```text
app/
  main.py                    FastAPI 路由、静态页面、会话接口
  agent_service.py           请求组装、上下文注入、DeepSeek 调用入口
  providers/deepseek_provider.py
                             DeepSeek API 适配层
  session_store.py           JSON 会话存储
  external_context.py        AFC stats 外部接口上下文
  skill_loader.py            按问题注入 skill 内容
  attachment_utils.py        上传文件文本化
public/
  index.html
  static/app.js
  static/styles.css
skill/
  afc-stats-project-skill/   AFC stats 项目 skill
scripts/
  deploy.sh                  VPS Docker 部署
  release.sh                 拉取代码、重建容器、健康检查
  update.sh                  release.sh 包装脚本
```

## 本地启动

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

也可以用 Node 启动本地静态联调服务：

```bash
npm run local
```

## VPS 部署

服务器目录：

```bash
/opt/cloud-agent
```

部署命令：

```bash
cd /opt/cloud-agent
./scripts/deploy.sh
```

更新命令：

```bash
cd /opt/cloud-agent
./scripts/update.sh
```

当前生产入口：

- `https://agent.552588.xyz/`
- `https://agent.552588.xyz/health`

## 环境变量

```env
DEEPSEEK_API_KEY=your-deepseek-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEFAULT_DEEPSEEK_MODEL=deepseek-v4-pro
APP_ACCESS_PASSWORD=change-me
SESSION_STORE_PATH=data/sessions.json
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
- `POST /v1/agent/run`

## 当前注意点

- 项目不再依赖 Cloudflare Worker。
- 前端直接由 FastAPI 托管。
- 模型入口只保留 DeepSeek。
- 会话按 `x-wecom-userid` 隔离；没有用户 ID 时写入默认存储。
- 上传支持图片和文本类文件，不支持视频。
