const state = {
  sessions: [],
  activeSessionId: null,
};

const modelDefaults = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4.1-mini",
};

const elements = {
  sessionList: document.getElementById("session-list"),
  messageList: document.getElementById("message-list"),
  chatTitle: document.getElementById("chat-title"),
  provider: document.getElementById("provider"),
  model: document.getElementById("model"),
  systemPrompt: document.getElementById("system-prompt"),
  userMessage: document.getElementById("user-message"),
  statusText: document.getElementById("status-text"),
  sendButton: document.getElementById("send-button"),
  chatForm: document.getElementById("chat-form"),
  newChatButton: document.getElementById("new-chat-button"),
  quickChips: document.querySelectorAll(".quick-chip"),
};

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatContent(text) {
  return escapeHtml(text).replaceAll("\n", "<br>");
}

function setStatus(text) {
  elements.statusText.textContent = text;
}

function persistPreferences() {
  localStorage.setItem(
    "cloud-agent-preferences",
    JSON.stringify({
      provider: elements.provider.value,
      model: elements.model.value,
      systemPrompt: elements.systemPrompt.value,
      activeSessionId: state.activeSessionId,
    }),
  );
}

function loadPreferences() {
  const raw = localStorage.getItem("cloud-agent-preferences");
  if (!raw) {
    return;
  }

  try {
    const data = JSON.parse(raw);
    elements.provider.value = data.provider || "gemini";
    elements.model.value = data.model || "";
    elements.systemPrompt.value = data.systemPrompt || "";
    state.activeSessionId = data.activeSessionId || null;
  } catch {
    localStorage.removeItem("cloud-agent-preferences");
  }
}

function renderSessions() {
  if (state.sessions.length === 0) {
    elements.sessionList.innerHTML = '<p class="section-title">还没有会话</p>';
    return;
  }

  elements.sessionList.innerHTML = state.sessions
    .map(
      (session) => `
        <button class="session-item ${session.session_id === state.activeSessionId ? "active" : ""}" data-session-id="${session.session_id}">
          <strong>${escapeHtml(session.title)}</strong>
          <span>${escapeHtml(session.provider || "未选择模型")} · ${escapeHtml(session.model || "默认模型")}</span>
        </button>
      `,
    )
    .join("");

  document.querySelectorAll(".session-item").forEach((button) => {
    button.addEventListener("click", () => loadSession(button.dataset.sessionId));
  });
}

function renderMessages(messages) {
  if (!messages.length) {
    elements.messageList.innerHTML = `
      <div class="empty-state">
        <h3>开始第一轮对话</h3>
        <p>你可以在这里切换 OpenAI 或 Gemini，然后直接发送消息。</p>
      </div>
    `;
    return;
  }

  elements.messageList.innerHTML = messages
    .map(
      (message, index) => `
        <article class="message ${message.role}">
          <div class="message-toolbar">
            <span class="message-role">${message.role}</span>
            <button type="button" class="ghost-button" data-copy-index="${index}">复制</button>
          </div>
          <div>${formatContent(message.content)}</div>
        </article>
      `,
    )
    .join("");

  document.querySelectorAll("[data-copy-index]").forEach((button) => {
    button.addEventListener("click", async () => {
      const index = Number(button.dataset.copyIndex);
      await navigator.clipboard.writeText(messages[index].content);
      setStatus("已复制消息内容");
    });
  });

  elements.messageList.scrollTop = elements.messageList.scrollHeight;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let detail = "Request failed";
    try {
      const data = await response.json();
      detail = data.detail || detail;
    } catch {
      detail = response.statusText || detail;
    }
    throw new Error(detail);
  }
  return response.json();
}

async function refreshSessions() {
  state.sessions = await fetchJson("/v1/sessions");
  renderSessions();
}

async function createSession() {
  const session = await fetchJson("/v1/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  state.activeSessionId = session.session_id;
  persistPreferences();
  await refreshSessions();
  await loadSession(session.session_id);
}

async function loadSession(sessionId) {
  const session = await fetchJson(`/v1/sessions/${sessionId}`);
  state.activeSessionId = sessionId;
  elements.chatTitle.textContent = session.title;
  elements.provider.value = session.provider || "gemini";
  elements.model.value = session.model || modelDefaults[elements.provider.value];
  elements.systemPrompt.value = session.system_prompt || "";
  renderSessions();
  renderMessages(session.messages);
  persistPreferences();
}

async function submitTurn(event) {
  event.preventDefault();

  if (!state.activeSessionId) {
    await createSession();
  }

  const userMessage = elements.userMessage.value.trim();
  if (!userMessage) {
    return;
  }

  elements.sendButton.disabled = true;
  persistPreferences();
  setStatus("正在调用模型...");

  try {
    const session = await fetchJson(`/v1/sessions/${state.activeSessionId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: elements.provider.value,
        model: elements.model.value || null,
        system_prompt: elements.systemPrompt.value || null,
        user_message: userMessage,
      }),
    });

    elements.userMessage.value = "";
    elements.chatTitle.textContent = session.title;
    renderMessages(session.messages);
    await refreshSessions();
    setStatus("已完成");
  } catch (error) {
    setStatus(`失败: ${error.message}`);
  } finally {
    elements.sendButton.disabled = false;
  }
}

elements.chatForm.addEventListener("submit", submitTurn);
elements.newChatButton.addEventListener("click", createSession);
elements.provider.addEventListener("change", () => {
  if (!elements.model.value || Object.values(modelDefaults).includes(elements.model.value)) {
    elements.model.value = modelDefaults[elements.provider.value];
  }
  persistPreferences();
});
elements.model.addEventListener("change", persistPreferences);
elements.systemPrompt.addEventListener("change", persistPreferences);
elements.userMessage.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    elements.chatForm.requestSubmit();
  }
});

elements.quickChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    elements.userMessage.value = chip.dataset.prompt || "";
    elements.userMessage.focus();
  });
});

async function bootstrap() {
  loadPreferences();
  if (!elements.model.value) {
    elements.model.value = modelDefaults[elements.provider.value];
  }

  setStatus("正在加载...");
  await refreshSessions();

  if (state.activeSessionId && state.sessions.some((session) => session.session_id === state.activeSessionId)) {
    await loadSession(state.activeSessionId);
  } else if (state.sessions.length > 0) {
    await loadSession(state.sessions[0].session_id);
  }

  setStatus("服务就绪");
}

bootstrap().catch((error) => {
  setStatus(`初始化失败: ${error.message}`);
});
