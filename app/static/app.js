const state = {
  sessions: [],
  activeSessionId: null,
  activeMessages: [],
  accessPassword: "",
  requiresPassword: false,
  attachments: [],
  sidebarCollapsed: false,
  isGenerating: false,
  abortController: null,
  openSheet: null,
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
  vps: [
    { value: "vps-status", label: "服务状态" },
    { value: "vps-run", label: "立即运行任务" },
    { value: "vps-logs", label: "查看日志" },
    { value: "vps-timer", label: "定时计划" },
    { value: "vps-branch", label: "仓库分支" },
  ],
};

const modelDefaults = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4.1-mini",
  zhipu: "glm-4.7",
  vps: "vps-status",
};

const providerTitles = {
  gemini: "Q",
  openai: "OpenAI",
  zhipu: "GLM",
  vps: "VPS",
};

const modelDescriptions = {
  gemini: {
    "gemini-2.5-flash": { title: "快速", detail: "更适合日常提问与快速回复" },
    "gemini-2.5-pro": { title: "思考", detail: "更适合复杂任务与长上下文分析" },
  },
  openai: {
    "gpt-4.1-mini": { title: "轻量", detail: "更快，适合大多数常规对话" },
    "gpt-4.1": { title: "标准", detail: "更平衡，适合正式写作与推理" },
    "gpt-5.4": { title: "高级", detail: "更强推理与复杂任务处理能力" },
  },
  zhipu: {
    "glm-4.7": { title: "标准", detail: "适合通用问答与中文任务" },
    "glm-4.5-air": { title: "轻快", detail: "速度优先，适合短对话" },
  },
  vps: {
    "vps-status": { title: "检查", detail: "查看当前服务与运行状态" },
    "vps-run": { title: "执行", detail: "直接触发一次远程任务" },
    "vps-logs": { title: "日志", detail: "快速查看运行日志" },
    "vps-timer": { title: "计划", detail: "检查定时计划与任务安排" },
    "vps-branch": { title: "仓库", detail: "查看当前代码分支和版本" },
  },
};

const elements = {
  sessionList: document.getElementById("session-list"),
  messageList: document.getElementById("message-list"),
  chatTitle: document.getElementById("chat-title"),
  provider: document.getElementById("provider"),
  model: document.getElementById("model"),
  providerMobile: document.getElementById("provider-mobile"),
  modelMobile: document.getElementById("model-mobile"),
  providerChipList: document.getElementById("provider-chip-list"),
  modelCardList: document.getElementById("model-card-list"),
  systemPromptDesktop: document.getElementById("system-prompt"),
  systemPromptMobile: document.getElementById("system-prompt-mobile"),
  userMessage: document.getElementById("user-message"),
  statusTextDesktop: document.getElementById("status-text"),
  statusTextMobile: document.getElementById("status-text-mobile"),
  chatForm: document.getElementById("chat-form"),
  newChatButton: document.getElementById("new-chat-button"),
  quickChips: document.querySelectorAll(".quick-chip"),
  authOverlay: document.getElementById("auth-overlay"),
  accessPassword: document.getElementById("access-password"),
  authSubmit: document.getElementById("auth-submit"),
  authStatus: document.getElementById("auth-status"),
  logoutButton: document.getElementById("logout-button"),
  logoutButtonMobile: document.getElementById("logout-button-mobile"),
  sendButton: document.getElementById("send-button"),
  stopButton: document.getElementById("stop-button"),
  fileInput: document.getElementById("file-input"),
  attachmentList: document.getElementById("attachment-list"),
  toolsDisclosure: document.getElementById("tools-disclosure"),
  desktopAttachmentTrigger: document.getElementById("desktop-attachment-trigger"),
  sessionSearch: document.getElementById("session-search"),
  mobileNewChatButton: document.getElementById("mobile-new-chat-button"),
  sidebar: document.getElementById("sidebar"),
  sidebarToggle: document.getElementById("sidebar-toggle"),
  sidebarToggleMobile: document.getElementById("sidebar-toggle-mobile"),
  mobileSidebarBackdrop: document.getElementById("mobile-sidebar-backdrop"),
  sheetBackdrop: document.getElementById("sheet-backdrop"),
  attachmentSheet: document.getElementById("attachment-sheet"),
  toolsSheet: document.getElementById("tools-sheet"),
  modelSheet: document.getElementById("model-sheet"),
  advancedSheet: document.getElementById("advanced-sheet"),
  attachmentMenuToggle: document.getElementById("attachment-menu-toggle"),
  toolsMenuToggle: document.getElementById("tools-menu-toggle"),
  modelSheetToggle: document.getElementById("model-sheet-toggle"),
  advancedSheetToggle: document.getElementById("advanced-sheet-toggle"),
  attachmentFileTrigger: document.getElementById("attachment-file-trigger"),
  attachmentImageTrigger: document.getElementById("attachment-image-trigger"),
  mobileProviderTitle: document.getElementById("mobile-provider-title"),
  mobileGreetingTitle: document.getElementById("mobile-greeting-title"),
  mobileGreetingSubtitle: document.getElementById("mobile-greeting-subtitle"),
};

function isMobileViewport() {
  return window.innerWidth <= 960;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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
          return `<p>${withInlineCode.replaceAll("\n", "<br>")}</p>`;
        })
        .join("");
    })
    .join("");
}

function formatRelativeTime(iso) {
  if (!iso) return "刚刚";
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return "刚刚";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return "刚刚";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} 分钟前`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} 小时前`;
  if (diffSeconds < 86400 * 7) return `${Math.floor(diffSeconds / 86400)} 天前`;

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function providerLabel(provider) {
  return providerTitles[provider] || "Q";
}

function setStatus(text) {
  if (elements.statusTextDesktop) elements.statusTextDesktop.textContent = text;
  if (elements.statusTextMobile) elements.statusTextMobile.textContent = text;
}

function syncMessagePlaceholder() {
  const currentProvider = elements.provider.value;
  elements.userMessage.placeholder = `问问 ${providerLabel(currentProvider)}`;
}

function syncTopbarTitle() {
  elements.mobileProviderTitle.textContent = providerLabel(elements.provider.value);
}

function syncGreetingState() {
  const hasMessages = state.activeMessages.length > 0;
  elements.mobileGreetingTitle.textContent = hasMessages ? elements.chatTitle.textContent : "需要我为你做些什么？";
  elements.mobileGreetingSubtitle.textContent = hasMessages
    ? `${providerLabel(elements.provider.value)} 已准备好`
    : "你好，欢迎回来";
  document.body.classList.toggle("has-conversation", hasMessages);
}

function closeAllSheets() {
  state.openSheet = null;
  [elements.attachmentSheet, elements.toolsSheet, elements.modelSheet, elements.advancedSheet].forEach((sheet) => {
    if (sheet) {
      sheet.classList.add("hidden");
      sheet.classList.remove("sheet-open");
      sheet.setAttribute("aria-hidden", "true");
    }
  });
  elements.sheetBackdrop.classList.add("hidden");
}

function openSheet(name) {
  const map = {
    attachment: elements.attachmentSheet,
    tools: elements.toolsSheet,
    model: elements.modelSheet,
    advanced: elements.advancedSheet,
  };
  const nextSheet = map[name];
  if (!nextSheet || !isMobileViewport()) return;

  if (state.openSheet === name) {
    closeAllSheets();
    return;
  }

  closeAllSheets();
  state.openSheet = name;
  nextSheet.classList.remove("hidden");
  requestAnimationFrame(() => nextSheet.classList.add("sheet-open"));
  nextSheet.setAttribute("aria-hidden", "false");
  elements.sheetBackdrop.classList.remove("hidden");
}

function syncResponsiveState() {
  if (!isMobileViewport()) {
    closeAllSheets();
  }
  if (elements.toolsDisclosure) {
    elements.toolsDisclosure.open = !isMobileViewport();
  }
}

function syncSidebarButtons() {
  const collapsed = state.sidebarCollapsed;
  if (elements.sidebarToggle) {
    elements.sidebarToggle.textContent = collapsed ? "展开" : "折叠";
  }
}

function applySidebarState() {
  const mobile = isMobileViewport();
  if (elements.sidebar) {
    elements.sidebar.classList.toggle("collapsed", state.sidebarCollapsed && !mobile);
    elements.sidebar.classList.toggle("mobile-open", mobile && !state.sidebarCollapsed);
  }
  elements.mobileSidebarBackdrop.classList.toggle("hidden", !mobile || state.sidebarCollapsed);
  document.body.classList.toggle("drawer-open", mobile && !state.sidebarCollapsed);
  localStorage.setItem("cloud-agent-sidebar-collapsed", state.sidebarCollapsed ? "1" : "0");
  syncSidebarButtons();
}

function syncSystemPromptFields(source = "desktop") {
  if (source === "desktop") {
    elements.systemPromptMobile.value = elements.systemPromptDesktop.value;
  } else {
    elements.systemPromptDesktop.value = elements.systemPromptMobile.value;
  }
}

function syncComposerState() {
  const generating = state.isGenerating;
  elements.sendButton.disabled = generating;
  elements.stopButton.classList.toggle("hidden", !generating);
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

function persistPreferences() {
  localStorage.setItem(
    "cloud-agent-preferences",
    JSON.stringify({
      provider: elements.provider.value,
      model: elements.model.value,
      systemPrompt: elements.systemPromptDesktop.value,
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
      elements.providerMobile.value = elements.provider.value;
      syncModelOptions(data.model || "");
      elements.systemPromptDesktop.value = data.systemPrompt || "";
      elements.systemPromptMobile.value = data.systemPrompt || "";
      state.activeSessionId = data.activeSessionId || null;
    } catch {
      localStorage.removeItem("cloud-agent-preferences");
    }
  }

  state.accessPassword = localStorage.getItem("cloud-agent-access-password") || "";
  state.sidebarCollapsed = localStorage.getItem("cloud-agent-sidebar-collapsed") === "1";
  if (isMobileViewport()) {
    state.sidebarCollapsed = true;
  }
}

function syncModelOptions(preferredModel) {
  const provider = elements.provider.value;
  const options = modelOptions[provider] || [];
  const targetValue = preferredModel || modelDefaults[provider];

  const optionHtml = options.map((option) => `<option value="${option.value}">${option.label}</option>`).join("");
  elements.model.innerHTML = optionHtml;
  elements.modelMobile.innerHTML = optionHtml;
  elements.providerMobile.value = provider;

  const nextValue = options.some((option) => option.value === targetValue) ? targetValue : modelDefaults[provider];
  elements.model.value = nextValue;
  elements.modelMobile.value = nextValue;
  renderModelPickerCards(provider, options, nextValue);
  syncMessagePlaceholder();
  syncTopbarTitle();
}

function renderModelPickerCards(provider, options, activeModel) {
  if (!elements.providerChipList || !elements.modelCardList) {
    return;
  }

  const providerEntries = Object.entries(providerTitles).filter(([key]) => modelOptions[key]);
  elements.providerChipList.innerHTML = providerEntries
    .map(
      ([value, label]) => `
        <button
          type="button"
          class="provider-chip ${value === provider ? "active" : ""}"
          data-provider-card="${value}"
        >
          ${escapeHtml(label)}
        </button>
      `,
    )
    .join("");

  elements.modelCardList.innerHTML = options
    .map(
      (option) => `
        <button
          type="button"
          class="model-card ${option.value === activeModel ? "active" : ""}"
          data-model-card="${option.value}"
        >
          <span>${escapeHtml(modelDescriptions[provider]?.[option.value]?.title || option.label)}</span>
          <strong>${escapeHtml(modelDescriptions[provider]?.[option.value]?.detail || option.label)}</strong>
          <em>${option.value === activeModel ? "当前使用" : "点击切换"}</em>
        </button>
      `,
    )
    .join("");

  document.querySelectorAll("[data-provider-card]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.provider.value = button.dataset.providerCard;
      elements.providerMobile.value = button.dataset.providerCard;
      syncModelOptions();
      persistPreferences();
    });
  });

  document.querySelectorAll("[data-model-card]").forEach((button) => {
    button.addEventListener("click", () => {
      const model = button.dataset.modelCard;
      elements.model.value = model;
      elements.modelMobile.value = model;
      renderModelPickerCards(elements.provider.value, modelOptions[elements.provider.value] || [], model);
      persistPreferences();
      syncMessagePlaceholder();
      closeAllSheets();
    });
  });
}

function showAuthOverlay() {
  elements.authOverlay.classList.remove("hidden");
  elements.accessPassword.value = state.accessPassword;
}

function hideAuthOverlay() {
  elements.authOverlay.classList.add("hidden");
}

function setAuthStatus(text) {
  elements.authStatus.textContent = text;
}

function authHeaders() {
  return state.accessPassword ? { "x-access-password": state.accessPassword } : {};
}

function renderSessions() {
  const keyword = elements.sessionSearch?.value?.trim().toLowerCase() || "";
  const sessions = keyword
    ? state.sessions.filter((session) => {
        const title = (session.title || "").toLowerCase();
        const provider = (session.provider || "").toLowerCase();
        const model = (session.model || "").toLowerCase();
        return title.includes(keyword) || provider.includes(keyword) || model.includes(keyword);
      })
    : state.sessions;

  if (!sessions.length) {
    elements.sessionList.innerHTML = '<p class="section-title">还没有会话</p>';
    return;
  }

  elements.sessionList.innerHTML = sessions
    .map(
      (session) => `
        <article class="session-card ${session.session_id === state.activeSessionId ? "active" : ""}">
          <button class="session-item" data-session-id="${session.session_id}">
            <strong>${escapeHtml(session.title)}</strong>
            <span>${escapeHtml(session.provider || "未选择模型")} · ${escapeHtml(session.model || "默认模型")}</span>
            <span class="session-meta">${formatRelativeTime(session.updated_at)} · ${session.message_count} 条消息</span>
          </button>
          <button class="session-delete-button" type="button" data-delete-session="${session.session_id}" aria-label="删除会话">×</button>
        </article>
      `,
    )
    .join("");

  document.querySelectorAll(".session-item").forEach((button) => {
    button.addEventListener("click", async () => {
      await loadSession(button.dataset.sessionId);
      if (isMobileViewport()) {
        state.sidebarCollapsed = true;
        applySidebarState();
      }
    });
  });

  document.querySelectorAll("[data-delete-session]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const sessionId = button.dataset.deleteSession;
      if (!sessionId) {
        return;
      }

      if (!window.confirm("确认删除这个会话吗？删除后无法恢复。")) {
        return;
      }

      await fetchJson(`/v1/sessions/${sessionId}`, { method: "DELETE" });

      if (state.activeSessionId === sessionId) {
        clearInvalidSessionState();
      }

      await refreshSessions();

      if (!state.activeSessionId && state.sessions.length > 0) {
        await loadSession(state.sessions[0].session_id);
      }

      setStatus("会话已删除");
    });
  });
}

function renderMessages(messages, pending = null) {
  const items = [...messages];
  if (pending) {
    items.push({ role: "user", content: pending.userText });
    items.push({ role: "assistant", content: pending.placeholder, pending: true });
  }

  if (!items.length) {
    elements.messageList.classList.add("is-empty");
    elements.messageList.innerHTML = `
      <div class="empty-state">
        <span class="empty-kicker">你好</span>
        <h3>需要我为你做些什么？</h3>
        <p>你可以直接提问，也可以通过底部按钮打开模型、工具或附件菜单。</p>
      </div>
    `;
    syncGreetingState();
    return;
  }

  elements.messageList.classList.remove("is-empty");
  elements.messageList.innerHTML = items
    .map(
      (message, index) => `
        <article class="message-row ${message.role}">
          <article class="message ${message.role} ${message.pending ? "pending" : ""}">
            <div class="message-toolbar">
              <span class="message-role">${message.role === "user" ? "你" : message.pending ? "思考中" : "助手"}</span>
              ${message.pending ? "" : `<button type="button" class="ghost-button message-copy-button" data-copy-index="${index}">复制</button>`}
            </div>
            <div class="message-content">${message.pending ? `<div class="thinking-line">${escapeHtml(message.content)}</div>` : formatContent(message.content)}</div>
          </article>
        </article>
      `,
    )
    .join("");

  document.querySelectorAll("[data-copy-index]").forEach((button) => {
    button.addEventListener("click", async () => {
      const index = Number(button.dataset.copyIndex);
      await navigator.clipboard.writeText(items[index].content);
      setStatus("已复制消息内容");
    });
  });

  elements.messageList.scrollTop = elements.messageList.scrollHeight;
  syncGreetingState();
}

function clearInvalidSessionState() {
  state.activeSessionId = null;
  state.activeMessages = [];
  elements.chatTitle.textContent = "请选择或新建一个会话";
  renderSessions();
  renderMessages([]);
  persistPreferences();
}

async function fetchJson(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    ...authHeaders(),
  };

  const response = await fetch(url, { ...options, headers, signal: options.signal });
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
  state.activeMessages = session.messages;
  persistPreferences();
  await refreshSessions();
  return session;
}

async function loadSession(sessionId) {
  try {
    const session = await fetchJson(`/v1/sessions/${sessionId}`);
    state.activeSessionId = sessionId;
    state.activeMessages = session.messages;
    elements.chatTitle.textContent = session.title;
    elements.provider.value = session.provider || "gemini";
    syncModelOptions(session.model || "");
    elements.systemPromptDesktop.value = session.system_prompt || "";
    elements.systemPromptMobile.value = session.system_prompt || "";
    renderSessions();
    renderMessages(session.messages);
    persistPreferences();
  } catch (error) {
    if (error.message.includes("Session not found")) {
      clearInvalidSessionState();
      setStatus("当前会话已失效，请重新创建一个新会话");
      return;
    }
    throw error;
  }
}

function stopGeneration() {
  if (!state.abortController) return;
  state.abortController.abort();
  state.abortController = null;
  state.isGenerating = false;
  syncComposerState();
  renderMessages(state.activeMessages);
  setStatus("已停止等待当前回复");
}

async function submitTurn(event) {
  event.preventDefault();
  const userMessage = elements.userMessage.value.trim();
  if (!userMessage || state.isGenerating) return;

  if (!state.activeSessionId) {
    const session = await createSession();
    elements.chatTitle.textContent = session.title;
  }

  closeAllSheets();
  state.abortController = new AbortController();
  state.isGenerating = true;
  syncComposerState();
  renderMessages(state.activeMessages, {
    userText: userMessage,
    placeholder: "正在思考并生成回复…",
  });
  setStatus("模型处理中，你可以随时点“停止”");

  try {
    const session = await fetchJson(`/v1/sessions/${state.activeSessionId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: elements.provider.value,
        model: elements.model.value || null,
        system_prompt: elements.systemPromptDesktop.value || null,
        user_message: userMessage,
        attachments: state.attachments,
      }),
      signal: state.abortController.signal,
    });

    state.activeMessages = session.messages;
    state.attachments = [];
    elements.fileInput.value = "";
    elements.userMessage.value = "";
    elements.userMessage.dispatchEvent(new Event("input"));
    renderAttachments();
    elements.chatTitle.textContent = session.title;
    renderMessages(session.messages);
    await refreshSessions();
    setStatus("回复已完成");
  } catch (error) {
    if (error.name === "AbortError") return;
    if (error.message.includes("Session not found")) {
      clearInvalidSessionState();
      setStatus("当前会话已失效，请重新创建一个新会话");
      return;
    }
    renderMessages(state.activeMessages);
    setStatus(`失败: ${error.message}`);
  } finally {
    state.isGenerating = false;
    state.abortController = null;
    syncComposerState();
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
    } else if (state.sessions.length) {
      await loadSession(state.sessions[0].session_id);
    } else {
      renderMessages([]);
    }
    hideAuthOverlay();
    setAuthStatus("验证成功");
    setStatus("服务就绪");
  } catch (error) {
    setAuthStatus(`验证失败: ${error.message}`);
  }
}

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

async function handleFiles(files) {
  if (!files.length) return;
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
}

function bindEvents() {
  elements.chatForm.addEventListener("submit", submitTurn);
  elements.newChatButton.addEventListener("click", async () => {
    const session = await createSession();
    elements.chatTitle.textContent = session.title;
    state.activeMessages = [];
    renderMessages([]);
    if (isMobileViewport()) {
      state.sidebarCollapsed = true;
      applySidebarState();
    }
  });

  elements.mobileNewChatButton?.addEventListener("click", () => {
    elements.newChatButton.click();
  });

  elements.authSubmit.addEventListener("click", verifyAccess);
  elements.stopButton.addEventListener("click", stopGeneration);

  [elements.logoutButton, elements.logoutButtonMobile].forEach((button) => {
    button?.addEventListener("click", () => {
      stopGeneration();
      state.accessPassword = "";
      localStorage.removeItem("cloud-agent-access-password");
      showAuthOverlay();
      setStatus("已退出登录，请重新输入访问口令");
    });
  });

  elements.provider.addEventListener("change", () => {
    elements.providerMobile.value = elements.provider.value;
    syncModelOptions();
    persistPreferences();
  });

  elements.providerMobile.addEventListener("change", () => {
    elements.provider.value = elements.providerMobile.value;
    syncModelOptions();
    persistPreferences();
  });

  elements.model.addEventListener("change", () => {
    elements.modelMobile.value = elements.model.value;
    persistPreferences();
  });

  elements.modelMobile.addEventListener("change", () => {
    elements.model.value = elements.modelMobile.value;
    persistPreferences();
    syncMessagePlaceholder();
  });

  elements.systemPromptDesktop.addEventListener("input", () => {
    syncSystemPromptFields("desktop");
    persistPreferences();
  });

  elements.systemPromptMobile.addEventListener("input", () => {
    syncSystemPromptFields("mobile");
    persistPreferences();
  });

  elements.userMessage.addEventListener("input", () => {
    elements.userMessage.style.height = "auto";
    elements.userMessage.style.height = `${Math.min(elements.userMessage.scrollHeight, 160)}px`;
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
      closeAllSheets();
    });
  });

  elements.desktopAttachmentTrigger?.addEventListener("click", () => {
    elements.fileInput.accept = "image/*,.txt,.md,.json,.csv,.log,.py,.js,.ts,.tsx,.jsx,.html,.css,.yml,.yaml,.xml,.sh";
    elements.fileInput.click();
  });

  elements.attachmentMenuToggle?.addEventListener("click", () => openSheet("attachment"));
  elements.toolsMenuToggle?.addEventListener("click", () => openSheet("tools"));
  elements.modelSheetToggle?.addEventListener("click", () => openSheet("model"));
  elements.advancedSheetToggle?.addEventListener("click", () => openSheet("advanced"));
  elements.sheetBackdrop?.addEventListener("click", closeAllSheets);
  document.querySelectorAll("[data-close-sheet]").forEach((button) => {
    button.addEventListener("click", closeAllSheets);
  });

  elements.attachmentFileTrigger?.addEventListener("click", () => {
    elements.fileInput.accept = "image/*,.txt,.md,.json,.csv,.log,.py,.js,.ts,.tsx,.jsx,.html,.css,.yml,.yaml,.xml,.sh";
    elements.fileInput.click();
    closeAllSheets();
  });

  elements.attachmentImageTrigger?.addEventListener("click", () => {
    elements.fileInput.accept = "image/*";
    elements.fileInput.click();
    closeAllSheets();
  });

  elements.fileInput.addEventListener("change", async (event) => {
    await handleFiles(Array.from(event.target.files || []));
  });

  elements.sessionSearch?.addEventListener("input", renderSessions);

  elements.sidebarToggle.addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    applySidebarState();
  });

  elements.sidebarToggleMobile.addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    applySidebarState();
  });

  elements.mobileSidebarBackdrop.addEventListener("click", () => {
    state.sidebarCollapsed = true;
    applySidebarState();
  });

  window.addEventListener("resize", () => {
    syncResponsiveState();
    applySidebarState();
  });
}

async function bootstrap() {
  loadPreferences();
  elements.providerMobile.innerHTML = elements.provider.innerHTML;
  syncModelOptions(elements.model.value);
  syncComposerState();
  syncResponsiveState();
  applySidebarState();
  syncTopbarTitle();
  syncMessagePlaceholder();
  bindEvents();
  setStatus("正在加载...");

  await loadPublicConfig();

  if (state.requiresPassword) {
    showAuthOverlay();
    if (state.accessPassword) {
      try {
        await refreshSessions();
        hideAuthOverlay();
      } catch {
        setAuthStatus("请输入访问口令");
        return;
      }
    } else {
      setAuthStatus("请输入访问口令");
      return;
    }
  } else {
    hideAuthOverlay();
    await refreshSessions();
  }

  if (state.activeSessionId && state.sessions.some((session) => session.session_id === state.activeSessionId)) {
    await loadSession(state.activeSessionId);
  } else if (state.sessions.length) {
    await loadSession(state.sessions[0].session_id);
  } else {
    clearInvalidSessionState();
  }

  setStatus("服务就绪");
}

bootstrap().catch((error) => {
  setStatus(`初始化失败: ${error.message}`);
});
