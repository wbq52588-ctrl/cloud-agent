import { createServer } from "node:http";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 8787);
const ROOT_DIR = resolve(".");
const PUBLIC_DIR = join(ROOT_DIR, "public");
const DATA_DIR = join(ROOT_DIR, "data");
const STORE_PATH = join(DATA_DIR, "local-sessions.json");
const localEnv = await loadDotEnv();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || localEnv.DEEPSEEK_API_KEY || "";
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || localEnv.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const DEFAULT_PROVIDER = "deepseek";
const DEFAULT_MODELS = { deepseek: "deepseek-v4-pro" };
const SUPPORTED_PROVIDERS = ["deepseek"];
const NEW_SESSION_TITLE = "New chat";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

async function loadDotEnv() {
  try {
    const text = await readFile(join(ROOT_DIR, ".env"), "utf8");
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

function isoNow() {
  return new Date().toISOString();
}

function userIdFromRequest(requestUrl, headers) {
  const url = new URL(requestUrl, `http://${HOST}:${PORT}`);
  return (
    headers["x-wecom-userid"] ||
    url.searchParams.get("wecom_userid") ||
    url.searchParams.get("wecomuserid") ||
    url.searchParams.get("actor_wecom_userid") ||
    url.searchParams.get("userid") ||
    ""
  ).trim();
}

function json(response, status = 200) {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(response),
  };
}

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function summarizeTitle(text) {
  const cleaned = String(text || "").trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, 28) + (cleaned.length > 28 ? "..." : "") : NEW_SESSION_TITLE;
}

function toSummary(session) {
  return {
    session_id: session.session_id,
    title: session.title,
    provider: session.provider,
    model: session.model,
    updated_at: session.updated_at,
    message_count: session.message_count,
  };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function readStore() {
  try {
    return JSON.parse(await readFile(STORE_PATH, "utf8"));
  } catch {
    return { users: {} };
  }
}

async function writeStore(store) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function getUserBucket(store, userId) {
  store.users[userId] ||= { sessions: {} };
  return store.users[userId];
}

async function runDeepSeek(payload) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("Missing DEEPSEEK_API_KEY in .env");
  }

  const messages = Array.isArray(payload.messages) ? [...payload.messages] : [];
  if (payload.userMessage) messages.push({ role: "user", content: payload.userMessage });
  const model = payload.model || DEFAULT_MODELS.deepseek;
  const requestBody = {
    model,
    messages: [
      ...(payload.systemPrompt ? [{ role: "system", content: payload.systemPrompt }] : []),
      ...messages,
    ],
    stream: false,
  };

  if (model === "deepseek-v4-pro") {
    requestBody.thinking = { type: "enabled" };
    requestBody.reasoning_effort = "high";
  }

  console.log(`DeepSeek direct model=${model} thinking=${model === "deepseek-v4-pro" ? "enabled" : "default"}`);
  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(text || `DeepSeek failed: ${response.status}`);
  const data = JSON.parse(text);
  return {
    provider: "deepseek",
    model,
    output_text: data.choices?.[0]?.message?.content || "",
  };
}

async function completeChat(store, bucket, sessionId, body) {
  const session = bucket.sessions[sessionId];
  if (!session) return { error: json({ detail: "Session not found" }, 404) };

  const userMessage = String(body.user_message || "").trim();
  if (!userMessage) return { error: json({ detail: "请输入消息。" }, 400) };

  const result = await runDeepSeek({
    provider: body.provider || DEFAULT_PROVIDER,
    model: body.model || DEFAULT_MODELS.deepseek,
    systemPrompt: body.system_prompt || null,
    messages: session.messages,
    userMessage,
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
  });

  if (session.title === NEW_SESSION_TITLE) session.title = summarizeTitle(userMessage);
  session.provider = result.provider;
  session.model = result.model;
  session.system_prompt = body.system_prompt || null;
  session.messages = [
    ...(session.messages || []),
    { role: "user", content: userMessage },
    { role: "assistant", content: result.output_text },
  ];
  session.message_count = session.messages.length;
  session.updated_at = isoNow();
  await writeStore(store);
  return { session };
}

async function handleApi(request, requestUrl) {
  const url = new URL(requestUrl, `http://${HOST}:${PORT}`);
  const path = url.pathname;
  const method = request.method;
  const userId = userIdFromRequest(requestUrl, request.headers);

  if (path === "/health") return json({ status: "ok" });

  if (path === "/v1/public-config") {
    return json({
      requires_password: false,
      supported_providers: SUPPORTED_PROVIDERS,
      default_provider: DEFAULT_PROVIDER,
      default_models: DEFAULT_MODELS,
      current_wecom_userid: userId,
    });
  }

  if (path === "/v1/client-log" && method === "POST") {
    const body = await readBody(request).catch(() => ({}));
    console.log(`CLIENT ${JSON.stringify(body)}`);
    return json({ ok: true });
  }

  if (path === "/v1/agent/run" && method === "POST") {
    const body = await readBody(request);
    return json(
      await runDeepSeek({
        provider: body.provider || DEFAULT_PROVIDER,
        model: body.model || DEFAULT_MODELS.deepseek,
        systemPrompt: body.system_prompt || null,
        messages: Array.isArray(body.messages) ? body.messages : [],
        userMessage: typeof body.message === "string" ? body.message : "",
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
      }),
    );
  }

  if (!userId && path.startsWith("/v1/sessions")) {
    return json({ detail: "缺少企业微信身份，请从企业微信入口进入后再使用。" }, 401);
  }

  const store = await readStore();
  const bucket = getUserBucket(store, userId);

  if (path === "/v1/sessions" && method === "GET") {
    const sessions = Object.values(bucket.sessions).map(toSummary);
    sessions.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    return json(sessions);
  }

  if (path === "/v1/sessions" && method === "POST") {
    const body = await readBody(request).catch(() => ({}));
    const session = {
      session_id: randomUUID().replaceAll("-", ""),
      title: String(body?.title || "").trim() || NEW_SESSION_TITLE,
      provider: null,
      model: null,
      updated_at: isoNow(),
      message_count: 0,
      system_prompt: null,
      messages: [],
    };
    bucket.sessions[session.session_id] = session;
    await writeStore(store);
    return json(session);
  }

  const sessionMatch = path.match(/^\/v1\/sessions\/([^/]+)$/);
  if (sessionMatch && method === "GET") {
    const session = bucket.sessions[sessionMatch[1]];
    return session ? json(session) : json({ detail: "Session not found" }, 404);
  }

  if (sessionMatch && method === "DELETE") {
    delete bucket.sessions[sessionMatch[1]];
    await writeStore(store);
    return json({ deleted: true });
  }

  const chatStreamMatch = path.match(/^\/v1\/sessions\/([^/]+)\/chat\/stream$/);
  if (chatStreamMatch && method === "POST") {
    const body = await readBody(request);
    return {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
      stream: async (response) => {
        try {
          response.write(sse("progress", { step: "正在调用 DeepSeek V4 Pro" }));
          const result = await completeChat(store, bucket, chatStreamMatch[1], body);
          if (result.error) {
            response.write(sse("error", { detail: JSON.parse(result.error.body).detail }));
          } else {
            response.write(sse("final", { session: result.session }));
          }
        } catch (error) {
          response.write(sse("error", { detail: error instanceof Error ? error.message : String(error) }));
        } finally {
          response.end();
        }
      },
    };
  }

  const chatMatch = path.match(/^\/v1\/sessions\/([^/]+)\/chat$/);
  if (chatMatch && method === "POST") {
    const body = await readBody(request);
    const result = await completeChat(store, bucket, chatMatch[1], body);
    return result.error || json(result.session);
  }

  return null;
}

async function staticResponse(requestUrl) {
  const url = new URL(requestUrl, `http://${HOST}:${PORT}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = normalize(join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) return json({ detail: "Not found" }, 404);

  try {
    await access(filePath);
    return {
      status: 200,
      headers: {
        "content-type": contentTypes[extname(filePath)] || "application/octet-stream",
        "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      },
      filePath,
    };
  } catch {
    return json({ detail: "Not found" }, 404);
  }
}

const server = createServer(async (request, response) => {
  try {
    console.log(`${new Date().toISOString()} ${request.method} ${request.url}`);
    const apiResult = await handleApi(request, request.url);
    const result = apiResult || (await staticResponse(request.url));

    response.writeHead(result.status, result.headers);
    if (result.stream) {
      await result.stream(response);
    } else if (result.filePath) {
      createReadStream(result.filePath).pipe(response);
    } else {
      response.end(result.body || "");
    }
  } catch (error) {
    const result = json({ detail: error instanceof Error ? error.message : String(error) }, 500);
    response.writeHead(result.status, result.headers);
    response.end(result.body);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Local HTML server ready: http://${HOST}:${PORT}`);
  console.log(`DeepSeek direct endpoint: ${DEEPSEEK_BASE_URL}`);
  console.log(`DeepSeek default model: ${DEFAULT_MODELS.deepseek}`);
});
