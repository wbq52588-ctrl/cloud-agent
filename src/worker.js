const encoder = new TextEncoder();

const DEFAULT_MODELS = {
  codex: "codex",
  gemini: "gemini-2.5-flash",
  openai: "gpt-4.1-mini",
  zhipu: "glm-4.7",
  vps: "vps-run",
};

const SUPPORTED_PROVIDERS = ["codex", "gemini"];

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function getWecomUserId(request) {
  const url = new URL(request.url);
  const queryValue =
    url.searchParams.get("wecom_userid") ||
    url.searchParams.get("wecomuserid") ||
    url.searchParams.get("actor_wecom_userid") ||
    url.searchParams.get("userid");
  const headerValue = request.headers.get("x-wecom-userid");
  return (headerValue || queryValue || "").trim();
}

function requireWecomUserId(request) {
  const userId = getWecomUserId(request);
  if (!userId) {
    throw new Response(
      JSON.stringify({ detail: "缺少企业微信身份，请从企业微信入口进入后再使用。" }),
      { status: 401, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }
  return userId;
}

function sessionKey(userId, sessionId) {
  return `session:${userId}:${sessionId}`;
}

function sessionIndexKey(userId) {
  return `session-index:${userId}`;
}

function isoNow() {
  return new Date().toISOString();
}

function summarizeTitle(text) {
  const cleaned = String(text || "").trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, 28) + (cleaned.length > 28 ? "..." : "") : "新会话";
}

async function readSessionIndex(env, userId) {
  const raw = await env.SESSIONS.get(sessionIndexKey(userId), "json");
  return Array.isArray(raw) ? raw : [];
}

async function writeSessionIndex(env, userId, sessions) {
  await env.SESSIONS.put(sessionIndexKey(userId), JSON.stringify(sessions));
}

async function createSessionRecord(env, userId, title = null) {
  const sessionId = crypto.randomUUID().replaceAll("-", "");
  const session = {
    session_id: sessionId,
    title: title || "新会话",
    provider: null,
    model: null,
    updated_at: isoNow(),
    message_count: 0,
    system_prompt: null,
    messages: [],
  };
  await env.SESSIONS.put(sessionKey(userId, sessionId), JSON.stringify(session));
  const sessions = await readSessionIndex(env, userId);
  sessions.unshift({
    session_id: session.session_id,
    title: session.title,
    provider: session.provider,
    model: session.model,
    updated_at: session.updated_at,
    message_count: session.message_count,
  });
  await writeSessionIndex(env, userId, sessions);
  return session;
}

async function getSessionRecord(env, userId, sessionId) {
  const raw = await env.SESSIONS.get(sessionKey(userId, sessionId), "json");
  return raw || null;
}

async function saveSessionRecord(env, userId, session) {
  await env.SESSIONS.put(sessionKey(userId, session.session_id), JSON.stringify(session));
  const sessions = await readSessionIndex(env, userId);
  const summary = {
    session_id: session.session_id,
    title: session.title,
    provider: session.provider,
    model: session.model,
    updated_at: session.updated_at,
    message_count: session.message_count,
  };
  const next = [summary, ...sessions.filter((item) => item.session_id !== session.session_id)]
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  await writeSessionIndex(env, userId, next);
}

async function deleteSessionRecord(env, userId, sessionId) {
  await env.SESSIONS.delete(sessionKey(userId, sessionId));
  const sessions = await readSessionIndex(env, userId);
  await writeSessionIndex(
    env,
    userId,
    sessions.filter((item) => item.session_id !== sessionId)
  );
}

function composeCodexPrompt({ systemPrompt, messages, userMessage }) {
  const parts = [];
  if (systemPrompt) {
    parts.push(`System:\n${systemPrompt}`);
  }
  for (const message of messages || []) {
    const role = message.role === "assistant" ? "Assistant" : "User";
    parts.push(`${role}:\n${message.content}`);
  }
  if (userMessage) {
    parts.push(`User:\n${userMessage}`);
  }
  parts.push("Assistant:");
  return parts.join("\n\n");
}

async function runCodex(env, payload) {
  const url = String(env.CODEX_BRIDGE_URL || "").replace(/\/+$/, "");
  const bridgeUrl = url.endsWith("/run") ? url : `${url}/run`;
  const response = await fetch(bridgeUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${env.CODEX_BRIDGE_TOKEN}`,
    },
    body: JSON.stringify({
      prompt: composeCodexPrompt(payload),
    }),
  });
  if (!response.ok) {
    throw new Error(`Codex bridge failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  if (!data.ok) {
    throw new Error(String(data.error || "Codex bridge failed"));
  }
  return {
    provider: "codex",
    model: "codex",
    output_text: String(data.output || "").trim(),
  };
}

function toGeminiContents(messages = [], userMessage = "") {
  const contentItems = [];
  for (const message of messages) {
    if (!message?.content) continue;
    contentItems.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.content) }],
    });
  }
  if (userMessage) {
    contentItems.push({
      role: "user",
      parts: [{ text: String(userMessage) }],
    });
  }
  return contentItems;
}

async function runGemini(env, payload) {
  const model = payload.model || DEFAULT_MODELS.gemini;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: payload.systemPrompt
          ? {
              parts: [{ text: String(payload.systemPrompt) }],
            }
          : undefined,
        contents: toGeminiContents(payload.messages, payload.userMessage),
        generationConfig: {
          temperature: payload.temperature ?? 0.2,
          maxOutputTokens: payload.max_output_tokens ?? payload.maxOutputTokens ?? 800,
        },
      }),
    }
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Gemini request failed: ${response.status}`);
  }
  const data = JSON.parse(text);
  const outputText =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .filter(Boolean)
      .join("\n")
      .trim() || "";
  if (!outputText) {
    throw new Error("Gemini returned empty output");
  }
  return {
    provider: "gemini",
    model,
    output_text: outputText,
  };
}

const CODEX_ROUTER_PROMPT = `You are a routing assistant for an AI workspace.

Decide whether the user's latest request should be answered by Gemini directly or sent to Codex.

Route to "codex" when the request is mainly about:
- code, debugging, errors, stack traces
- repositories, git, deployment, CI/CD
- servers, VPS, logs, infrastructure, shell commands
- frontend/backend implementation, styling fixes, file edits

Route to "gemini" when the request is mainly about:
- direct Q&A
- brainstorming, writing, summarization, translation
- general explanation without needing code or system changes

Return strict JSON only:
{"route":"gemini"|"codex","reason":"short reason"}`;

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  const candidate = fenced ? fenced[1] : raw;
  const objectMatch = candidate.match(/\{[\s\S]*\}/);
  return JSON.parse(objectMatch ? objectMatch[0] : candidate);
}

function codexHeuristicRoute(payload) {
  const haystack = [
    payload.systemPrompt,
    ...(payload.messages || []).map((item) => item?.content || ""),
    payload.userMessage,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  const codexSignals = [
    "code", "css", "html", "js", "ts", "python", "bug", "error", "stack", "traceback",
    "deploy", "worker", "cloudflare", "vps", "server", "ssh", "git", "commit", "branch",
    "docker", "nginx", "日志", "报错", "代码", "前端", "后端", "部署", "样式", "服务器",
    "webhook", "mcp",
  ];

  const route = codexSignals.some((keyword) => haystack.includes(keyword)) ? "codex" : "gemini";
  return {
    route,
    reason:
      route === "codex"
        ? "Request looks like an engineering or operations task."
        : "Request looks like a direct conversation or explanation.",
  };
}

async function decideCodexRoute(env, payload) {
  const history = (payload.messages || []).slice(-6).map((message) => ({
    role: message?.role || "user",
    content: String(message?.content || ""),
  }));
  const heuristic = codexHeuristicRoute(payload);

  if (heuristic.route === "codex") {
    return heuristic;
  }

  try {
    const result = await runGemini(env, {
      model: DEFAULT_MODELS.gemini,
      systemPrompt: CODEX_ROUTER_PROMPT,
      messages: history,
      userMessage: payload.userMessage || "",
      temperature: 0,
      max_output_tokens: 120,
    });
    const parsed = extractJsonObject(result.output_text);
    return {
      route: parsed?.route === "codex" ? "codex" : "gemini",
      reason: String(parsed?.reason || "").trim() || heuristic.reason,
    };
  } catch (_error) {
    return heuristic;
  }
}

async function routeCodexWithGemini(env, payload, onProgress = async () => {}) {
  await onProgress("Gemini 正在理解需求");
  const decision = await decideCodexRoute(env, payload);

  if (decision.route === "gemini") {
    await onProgress("Gemini 判断可以直接回答");
    const result = await runGemini(env, {
      ...payload,
      provider: "gemini",
      model: DEFAULT_MODELS.gemini,
    });
    return {
      ...result,
      routed_by: "gemini-router",
      routed_from: "codex",
      routing_reason: decision.reason,
    };
  }

  await onProgress("Gemini 建议交给 Codex 处理");
  const routingNote = decision.reason ? `Routing hint from Gemini: ${decision.reason}` : "";
  const result = await runCodex(env, {
    ...payload,
    systemPrompt: [payload.systemPrompt, routingNote].filter(Boolean).join("\n\n"),
  });
  return {
    ...result,
    routed_by: "gemini-router",
    routed_from: "codex",
    routing_reason: decision.reason,
  };
}

async function runBackend(env, payload) {
  const requestMessages = Array.isArray(payload.messages) ? [...payload.messages] : [];
  if (payload.userMessage) {
    requestMessages.push({ role: "user", content: payload.userMessage });
  }
  const response = await fetch(`${env.BACKEND_BASE_URL}/v1/agent/run`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      provider: payload.provider,
      model: payload.model,
      system_prompt: payload.systemPrompt || null,
      messages: requestMessages,
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
      temperature: payload.temperature ?? 0.2,
      max_output_tokens: payload.max_output_tokens ?? payload.maxOutputTokens ?? 800,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Backend failed: ${response.status}`);
  }
  return JSON.parse(text);
}

async function runProvider(env, payload) {
  if (payload.provider === "codex") {
    return routeCodexWithGemini(env, payload);
  }
  if (payload.provider === "gemini") {
    return runGemini(env, payload);
  }
  return runBackend(env, payload);
}

async function handlePublicConfig(request) {
  return json({
    requires_password: false,
    supported_providers: SUPPORTED_PROVIDERS,
    default_provider: "codex",
    default_models: DEFAULT_MODELS,
    current_wecom_userid: getWecomUserId(request),
  });
}

async function handleAgentRun(request, env) {
  const body = await request.json();
  const provider = body.provider || "codex";
  const userMessage =
    typeof body.message === "string"
      ? body.message
      : Array.isArray(body.messages)
        ? body.messages.filter((item) => item?.role === "user").map((item) => item.content).join("\n\n")
        : "";

  const result = await runProvider(env, {
    provider,
    model: body.model || DEFAULT_MODELS[provider] || null,
    systemPrompt: body.system_prompt || null,
    messages: Array.isArray(body.messages) ? body.messages : [],
    userMessage,
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    temperature: body.temperature ?? 0.2,
    max_output_tokens: body.max_output_tokens ?? 800,
  });

  return json(result);
}

function sseEvent(name, data) {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function handleChatStream(request, env, sessionId) {
  const userId = requireWecomUserId(request);
  const session = await getSessionRecord(env, userId, sessionId);
  if (!session) {
    return json({ detail: "Session not found" }, { status: 404 });
  }

  const body = await request.json();
  const userMessage = String(body.user_message || "").trim();
  if (!userMessage) {
    return json({ detail: "请输入消息" }, { status: 400 });
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  (async () => {
    try {
      await writer.write(sseEvent("progress", { step: "已收到请求，正在准备会话" }));
      await new Promise((resolve) => setTimeout(resolve, 160));
      await writer.write(sseEvent("progress", { step: "正在调用模型" }));

      const result = await runProvider(env, {
        provider: body.provider || "codex",
        model: body.model || DEFAULT_MODELS[body.provider || "codex"] || null,
        systemPrompt: body.system_prompt || null,
        messages: Array.isArray(session.messages) ? session.messages : [],
        userMessage,
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
        temperature: body.temperature ?? 0.2,
        max_output_tokens: body.max_output_tokens ?? 800,
      });

      await writer.write(sseEvent("progress", { step: "正在整理回复" }));
      await new Promise((resolve) => setTimeout(resolve, 180));

      if (session.title === "新会话") {
        session.title = summarizeTitle(userMessage);
      }
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
      await saveSessionRecord(env, userId, session);

      await writer.write(sseEvent("progress", { step: "正在写入会话记录" }));
      await new Promise((resolve) => setTimeout(resolve, 180));
      await writer.write(sseEvent("final", { session }));
    } catch (error) {
      await writer.write(
        sseEvent("error", {
          detail: error instanceof Error ? error.message : String(error),
        })
      );
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

async function handleChat(request, env, sessionId) {
  const response = await handleChatStreamV2(request, env, sessionId);
  if (!String(response.headers.get("content-type") || "").includes("text/event-stream")) {
    return response;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalSession = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const eventMatch = chunk.match(/^event: (.+)$/m);
      const dataMatch = chunk.match(/^data: (.+)$/m);
      if (eventMatch?.[1] === "final" && dataMatch?.[1]) {
        finalSession = JSON.parse(dataMatch[1]).session;
      }
      if (eventMatch?.[1] === "error" && dataMatch?.[1]) {
        const payload = JSON.parse(dataMatch[1]);
        return json({ detail: payload.detail || "流式请求失败" }, { status: 500 });
      }
    }
  }

  return finalSession
    ? json(finalSession)
    : json({ detail: "没有收到最终会话结果" }, { status: 500 });
}

async function handleChatStreamV2(request, env, sessionId) {
  const userId = requireWecomUserId(request);
  const session = await getSessionRecord(env, userId, sessionId);
  if (!session) {
    return json({ detail: "Session not found" }, { status: 404 });
  }

  const body = await request.json();
  const userMessage = String(body.user_message || "").trim();
  if (!userMessage) {
    return json({ detail: "Please enter a message." }, { status: 400 });
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  (async () => {
    try {
      await writer.write(sseEvent("progress", { step: "已收到请求，正在准备会话" }));
      await new Promise((resolve) => setTimeout(resolve, 160));

      const provider = body.provider || "codex";
      let result;

      if (provider === "codex") {
        result = await routeCodexWithGemini(
          env,
          {
            provider,
            model: body.model || DEFAULT_MODELS[provider] || null,
            systemPrompt: body.system_prompt || null,
            messages: Array.isArray(session.messages) ? session.messages : [],
            userMessage,
            attachments: Array.isArray(body.attachments) ? body.attachments : [],
            temperature: body.temperature ?? 0.2,
            max_output_tokens: body.max_output_tokens ?? 800,
          },
          async (step) => {
            await writer.write(sseEvent("progress", { step }));
            await new Promise((resolve) => setTimeout(resolve, 180));
          }
        );
      } else {
        await writer.write(sseEvent("progress", { step: "正在调用模型" }));
        result = await runProvider(env, {
          provider,
          model: body.model || DEFAULT_MODELS[provider] || null,
          systemPrompt: body.system_prompt || null,
          messages: Array.isArray(session.messages) ? session.messages : [],
          userMessage,
          attachments: Array.isArray(body.attachments) ? body.attachments : [],
          temperature: body.temperature ?? 0.2,
          max_output_tokens: body.max_output_tokens ?? 800,
        });
      }

      await writer.write(sseEvent("progress", { step: "正在整理回复" }));
      await new Promise((resolve) => setTimeout(resolve, 180));

      if (session.title === "新会话") {
        session.title = summarizeTitle(userMessage);
      }
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
      await saveSessionRecord(env, userId, session);

      await writer.write(sseEvent("progress", { step: "正在写入会话记录" }));
      await new Promise((resolve) => setTimeout(resolve, 180));
      await writer.write(sseEvent("final", { session }));
    } catch (error) {
      await writer.write(
        sseEvent("error", {
          detail: error instanceof Error ? error.message : String(error),
        })
      );
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/health") {
    return json({ status: "ok" });
  }

  if (path === "/v1/public-config") {
    return handlePublicConfig(request);
  }

  if (path === "/v1/agent/run" && request.method === "POST") {
    return handleAgentRun(request, env);
  }

  if (path === "/v1/sessions" && request.method === "GET") {
    const userId = requireWecomUserId(request);
    return json(await readSessionIndex(env, userId));
  }

  if (path === "/v1/sessions" && request.method === "POST") {
    const userId = requireWecomUserId(request);
    const body = await request.json().catch(() => ({}));
    return json(await createSessionRecord(env, userId, body?.title || null));
  }

  const sessionMatch = path.match(/^\/v1\/sessions\/([^/]+)$/);
  if (sessionMatch && request.method === "GET") {
    const userId = requireWecomUserId(request);
    const session = await getSessionRecord(env, userId, sessionMatch[1]);
    return session ? json(session) : json({ detail: "Session not found" }, { status: 404 });
  }
  if (sessionMatch && request.method === "DELETE") {
    const userId = requireWecomUserId(request);
    await deleteSessionRecord(env, userId, sessionMatch[1]);
    return json({ deleted: true });
  }

  const chatMatch = path.match(/^\/v1\/sessions\/([^/]+)\/chat$/);
  if (chatMatch && request.method === "POST") {
    return handleChat(request, env, chatMatch[1]);
  }

  const chatStreamMatch = path.match(/^\/v1\/sessions\/([^/]+)\/chat\/stream$/);
  if (chatStreamMatch && request.method === "POST") {
    return handleChatStreamV2(request, env, chatStreamMatch[1]);
  }

  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (error instanceof Response) return error;
      return json(
        { detail: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  },
};
