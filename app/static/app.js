const state = {
  sessions: [],
  activeSessionId: null,
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
};

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function setStatus(text) {
  elements.statusText.textContent = text;
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
      (message) => `
        <article class="message ${message.role}">
          <span class="message-role">${message.role}</span>
          <div>${escapeHtml(message.content)}</div>
        </article>
      `,
    )
    .join("");

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
  await refreshSessions();
  await loadSession(session.session_id);
}

async function loadSession(sessionId) {
  const session = await fetchJson(`/v1/sessions/${sessionId}`);
  state.activeSessionId = sessionId;
  elements.chatTitle.textContent = session.title;
  elements.provider.value = session.provider || "gemini";
  elements.model.value = session.model || "";
  elements.systemPrompt.value = session.system_prompt || "";
  renderSessions();
  renderMessages(session.messages);
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

async function bootstrap() {
  setStatus("正在加载...");
  await refreshSessions();
  if (state.sessions.length > 0) {
    await loadSession(state.sessions[0].session_id);
  }
  setStatus("服务就绪");
}

bootstrap().catch((error) => {
  setStatus(`初始化失败: ${error.message}`);
});
