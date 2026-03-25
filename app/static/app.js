const state = {
  sessions: [],
  activeSessionId: null,
  accessPassword: "",
  requiresPassword: false,
  attachments: [],
  sidebarCollapsed: false,
};

const modelOptions = {
  gemini: [
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
  openai: [
    { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "gpt-5.4", label: "GPT-5.4" },
  ],
  zhipu: [
    { value: "glm-4.7", label: "GLM-4.7" },
    { value: "glm-4.5-air", label: "GLM-4.5 Air" },
  ],
};

const modelDefaults = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4.1-mini",
  zhipu: "glm-4.7",
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
  authOverlay: document.getElementById("auth-overlay"),
  accessPassword: document.getElementById("access-password"),
  authSubmit: document.getElementById("auth-submit"),
  authStatus: document.getElementById("auth-status"),
  logoutButton: document.getElementById("logout-button"),
  fileInput: document.getElementById("file-input"),
  attachmentList: document.getElementById("attachment-list"),
  sidebar: document.getElementById("sidebar"),
  sidebarToggle: document.getElementById("sidebar-toggle"),
  sidebarToggleMobile: document.getElementById("sidebar-toggle-mobile"),
};

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeCodePreservingNewlines(text) {
  return escapeHtml(text).replaceAll("\n", "<br>");
}

function formatContent(text) {
  const escaped = escapeHtml(text);
  const blocks = escaped.split("```");

  return blocks
    .map((block, index) => {
      if (index % 2 === 1) {
        return `<pre><code>${block}</code></pre>`;
      }

      return block
        .split(/\n{2,}/)
        .map((paragraph) => {
          const withInlineCode = paragraph.replace(/`([^`]+)`/g, "<code>$1</code>");
          return `<p>${escapeCodePreservingNewlines(withInlineCode)}</p>`
            .replace(/&lt;code&gt;/g, "<code>")
            .replace(/&lt;\/code&gt;/g, "</code>");
        })
        .join("");
    })
    .join("");
}

function setStatus(text) {
  elements.statusText.textContent = text;
}

function updateSidebarButtons() {
  const collapsed = state.sidebarCollapsed && window.innerWidth > 960;

  if (elements.sidebarToggle) {
    elements.sidebarToggle.textContent = collapsed ? "展开" : "折叠";
  }

  if (elements.sidebarToggleMobile) {
    elements.sidebarToggleMobile.textContent = collapsed ? "展开会话栏" : "收起会话栏";
  }
}

function applySidebarState() {
  elements.sidebar.classList.toggle("collapsed", state.sidebarCollapsed && window.innerWidth > 960);
  localStorage.setItem("cloud-agent-sidebar-collapsed", state.sidebarCollapsed ? "1" : "0");
  updateSidebarButtons();
}

function renderAttachments() {
  if (!state.attachments.length) {
    elements.attachmentList.innerHTML = "";
    return;
  }

  elements.attachmentList.innerHTML = state.attachments
    .map(
      (attachment, index) => `
        <div class="attachment-chip">
          <span>${escapeHtml(attachment.name)}</span>
          <button type="button" class="ghost-button" data-remove-attachment="${index}">移除</button>
        </div>
      `,
    )
    .join("");

  document.querySelectorAll("[data-remove-attachment]").forEach((button) => {
    button.addEventListener("click", () => {
      state.attachments.splice(Number(button.dataset.removeAttachment), 1);
      renderAttachments();
    });
  });
}

function clearInvalidSessionState() {
  state.activeSessionId = null;
  elements.chatTitle.textContent = "请选择或新建一个会话";
  renderSessions();
  renderMessages([]);
  persistPreferences();
}

function syncModelOptions(preferredModel) {
  const provider = elements.provider.value;
  const options = modelOptions[provider] || [];
  const fallbackModel = preferredModel || modelDefaults[provider] || "";

  elements.model.innerHTML = options
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");

  const hasPreferredModel = options.some((option) => option.value === fallbackModel);
  elements.model.value = hasPreferredModel ? fallbackModel : modelDefaults[provider];
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

  if (state.accessPassword) {
    localStorage.setItem("cloud-agent-access-password", state.accessPassword);
  }
}

function loadPreferences() {
  const raw = localStorage.getItem("cloud-agent-preferences");
  if (raw) {
    try {
      const data = JSON.parse(raw);
      elements.provider.value = data.provider || "gemini";
      syncModelOptions(data.model || "");
      elements.systemPrompt.value = data.systemPrompt || "";
      state.activeSessionId = data.activeSessionId || null;
    } catch {
      localStorage.removeItem("cloud-agent-preferences");
    }
  }

  state.accessPassword = localStorage.getItem("cloud-agent-access-password") || "";
  state.sidebarCollapsed = localStorage.getItem("cloud-agent-sidebar-collapsed") === "1";
}

function setAuthStatus(text) {
  elements.authStatus.textContent = text;
}

function authHeaders() {
  return state.accessPassword ? { "x-access-password": state.accessPassword } : {};
}

function showAuthOverlay() {
  elements.authOverlay.classList.remove("hidden");
  elements.accessPassword.value = state.accessPassword;
}

function hideAuthOverlay() {
  elements.authOverlay.classList.add("hidden");
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
        <p>你可以在这里切换 OpenAI、Gemini 或 GLM，然后直接发送消息。</p>
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
          <div class="message-content">${formatContent(message.content)}</div>
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
  const headers = {
    ...(options.headers || {}),
    ...authHeaders(),
  };
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    let detail = "Request failed";
    try {
      const data = await response.json();
      detail = data.detail || detail;
    } catch {
      detail = response.statusText || detail;
    }

    if (response.status === 401) {
      showAuthOverlay();
    }
    throw new Error(detail);
  }
  return response.json();
}

async function refreshSessions() {
  state.sessions = await fetchJson("/v1/sessions");
  renderSessions();
}

async function loadPublicConfig() {
  const config = await fetchJson("/v1/public-config");
  state.requiresPassword = config.requires_password;
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
  let session;

  try {
    session = await fetchJson(`/v1/sessions/${sessionId}`);
  } catch (error) {
    if (error.message.includes("Session not found")) {
      clearInvalidSessionState();
      setStatus("原会话不存在，请重新创建一个新会话");
      return;
    }
    throw error;
  }

  state.activeSessionId = sessionId;
  elements.chatTitle.textContent = session.title;
  elements.provider.value = session.provider || "gemini";
  syncModelOptions(session.model || "");
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
  setStatus("正在调用模型，失败时会自动重试一次...");

  try {
    const session = await fetchJson(`/v1/sessions/${state.activeSessionId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: elements.provider.value,
        model: elements.model.value || null,
        system_prompt: elements.systemPrompt.value || null,
        user_message: userMessage,
        attachments: state.attachments,
      }),
    });

    elements.userMessage.value = "";
    state.attachments = [];
    elements.fileInput.value = "";
    renderAttachments();
    elements.chatTitle.textContent = session.title;
    renderMessages(session.messages);
    await refreshSessions();
    setStatus("已完成");
  } catch (error) {
    if (error.message.includes("Session not found")) {
      clearInvalidSessionState();
      setStatus("当前会话已失效，请重新创建一个新会话");
      return;
    }
    setStatus(`失败: ${error.message}`);
  } finally {
    elements.sendButton.disabled = false;
  }
}

async function verifyAccess() {
  state.accessPassword = elements.accessPassword.value.trim();
  setAuthStatus("正在验证...");

  try {
    await refreshSessions();
    persistPreferences();
    if (state.activeSessionId && state.sessions.some((session) => session.session_id === state.activeSessionId)) {
      await loadSession(state.activeSessionId);
    } else if (state.sessions.length > 0) {
      await loadSession(state.sessions[0].session_id);
    } else {
      renderMessages([]);
    }
    setAuthStatus("验证成功");
    hideAuthOverlay();
    setStatus("服务就绪");
  } catch (error) {
    setAuthStatus(`验证失败: ${error.message}`);
  }
}

elements.chatForm.addEventListener("submit", submitTurn);
elements.newChatButton.addEventListener("click", createSession);
elements.authSubmit.addEventListener("click", verifyAccess);
elements.logoutButton.addEventListener("click", () => {
  state.accessPassword = "";
  localStorage.removeItem("cloud-agent-access-password");
  showAuthOverlay();
  setStatus("已退出登录，请重新输入访问口令");
});
elements.provider.addEventListener("change", () => {
  syncModelOptions();
  persistPreferences();
});
elements.model.addEventListener("change", persistPreferences);
elements.systemPrompt.addEventListener("change", persistPreferences);
elements.userMessage.addEventListener("input", () => {
  elements.userMessage.style.height = "auto";
  elements.userMessage.style.height = `${Math.min(elements.userMessage.scrollHeight, 260)}px`;
});
elements.userMessage.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    elements.chatForm.requestSubmit();
  }
});

elements.quickChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    elements.userMessage.value = chip.dataset.prompt || "";
    elements.userMessage.dispatchEvent(new Event("input"));
    elements.userMessage.focus();
  });
});

elements.sidebarToggle.addEventListener("click", () => {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  applySidebarState();
});

elements.sidebarToggleMobile.addEventListener("click", () => {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  applySidebarState();
});

window.addEventListener("resize", applySidebarState);

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

elements.fileInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    return;
  }

  setStatus("正在读取附件...");

  try {
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        const dataUrl = await readFileAsDataUrl(file);
        state.attachments.push({
          kind: "image",
          name: file.name,
          content_type: file.type || "image/png",
          data_url: dataUrl,
        });
      } else {
        const text = await readFileAsText(file);
        state.attachments.push({
          kind: "text",
          name: file.name,
          content_type: file.type || "text/plain",
          text_content: text,
        });
      }
    }
    renderAttachments();
    setStatus("附件已就绪");
  } catch (error) {
    setStatus(`附件读取失败: ${error.message}`);
  }
});

async function bootstrap() {
  loadPreferences();
  syncModelOptions(elements.model.value);
  applySidebarState();

  setStatus("正在加载...");
  await loadPublicConfig();

  if (state.requiresPassword && state.accessPassword) {
    showAuthOverlay();
    try {
      await refreshSessions();
      hideAuthOverlay();
    } catch {
      showAuthOverlay();
      setAuthStatus("请输入访问口令");
      return;
    }
  } else if (state.requiresPassword) {
    showAuthOverlay();
    setAuthStatus("请输入访问口令");
    return;
  } else {
    hideAuthOverlay();
    await refreshSessions();
  }

  if (state.activeSessionId && state.sessions.some((session) => session.session_id === state.activeSessionId)) {
    await loadSession(state.activeSessionId);
  } else if (state.sessions.length > 0) {
    await loadSession(state.sessions[0].session_id);
  } else {
    clearInvalidSessionState();
  }

  setStatus("服务就绪");
}

bootstrap().catch((error) => {
  setStatus(`初始化失败: ${error.message}`);
});
