const state = {
  sessions: [],
  activeSessionId: null,
  activeMessages: [],
  currentWecomUserId: "",
  accessPassword: "",
  requiresPassword: false,
  supportedProviders: ["codex"],
  defaultProvider: "codex",
  attachments: [],
  sidebarCollapsed: false,
  isGenerating: false,
  abortController: null,
  pendingProgressTimer: null,
  pendingProgressIndex: 0,
  lastProgressAt: 0,
  sessionMenuOpenId: null,
  pendingDeleteSession: null,
};

const DOCUMENT_ACCEPT =
  ".txt,.md,.json,.csv,.log,.py,.js,.ts,.tsx,.jsx,.html,.css,.yml,.yaml,.xml,.sh,text/plain,text/markdown,application/json,text/csv,text/html,text/css,application/xml,text/xml";

const modelOptions = {
  codex: [
    { value: "codex", label: "Codex" },
  ],
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
    { value: "vps-run", label: "立即运行任务" },
  ],
};

const modelDefaults = {
  codex: "codex",
  gemini: "gemini-2.5-flash",
  openai: "gpt-4.1-mini",
  zhipu: "glm-4.7",
  vps: "vps-run",
};

const providerTitles = {
  gemini: "Gemini",
  openai: "OpenAI",
  zhipu: "GLM",
  vps: "VPS",
  codex: "Codex",
};

const modelDescriptions = {
  codex: {
    codex: { title: "代理", detail: "已登录的 Codex 代理，按后端桥接配置运行" },
  },
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
    "vps-run": { title: "执行", detail: "直接触发一次远程任务" },
  },
};

const elements = {
  sessionList: document.getElementById("session-list"),
  messageList: document.getElementById("message-list"),
  transcriptShell: document.querySelector(".transcript-shell"),
  chatPanel: document.querySelector(".chat-panel"),
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
  chatForm: document.getElementById("chat-form"),
  authOverlay: document.getElementById("auth-overlay"),
  accessPassword: document.getElementById("access-password"),
  authSubmit: document.getElementById("auth-submit"),
  authStatus: document.getElementById("auth-status"),
  identityOverlay: document.getElementById("identity-overlay"),
  identityUserId: document.getElementById("identity-userid"),
  identitySubmit: document.getElementById("identity-submit"),
  identityStatus: document.getElementById("identity-status"),
  logoutButton: document.getElementById("logout-button"),
  sendButton: document.getElementById("send-button"),
  stopButton: document.getElementById("stop-button"),
    fileInput: document.getElementById("file-input"),
  attachmentList: document.getElementById("attachment-list"),
  mobileInputShell: document.querySelector(".mobile-input-shell"),
  mobileTextEntry: document.querySelector(".mobile-text-entry"),
  desktopAttachmentTrigger: document.getElementById("desktop-attachment-trigger"),
  sessionSearch: document.getElementById("session-search"),
  mobileNewChatButton: document.getElementById("mobile-new-chat-button"),
  sidebar: document.getElementById("sidebar"),
  sidebarToggle: document.getElementById("sidebar-toggle"),
  sidebarToggleMobile: document.getElementById("sidebar-toggle-mobile"),
  sidebarRailToggle: document.getElementById("sidebar-rail-toggle"),
  mobileSidebarBackdrop: document.getElementById("mobile-sidebar-backdrop"),
  sheetBackdrop: document.getElementById("sheet-backdrop"),
  dialogBackdrop: document.getElementById("dialog-backdrop"),
  attachmentFileTrigger: document.getElementById("attachment-file-trigger"),
  mobileProviderTitle: document.getElementById("mobile-provider-title"),
  mobileGreetingTitle: document.getElementById("mobile-greeting-title"),
  mobileGreetingSubtitle: document.getElementById("mobile-greeting-subtitle"),
  deleteDialog: document.getElementById("delete-dialog"),
  deleteDialogTitle: document.getElementById("delete-dialog-title"),
  deleteDialogCopy: document.getElementById("delete-dialog-copy"),
  deleteCancelButton: document.getElementById("delete-cancel-button"),
  deleteConfirmButton: document.getElementById("delete-confirm-button"),
  avatarMenuToggle: document.getElementById("avatar-menu-toggle"),
  avatarMenu: document.getElementById("avatar-menu"),
  currentUserCard: document.getElementById("current-user-card"),
  currentUserId: document.getElementById("current-user-id"),
};

function isMobileViewport() {
  return window.innerWidth <= 960;
}

function syncMobileThemeByTime() {
  const mobile = isMobileViewport();
  document.body.classList.toggle("mobile-night", false);
  document.body.classList.toggle("mobile-day", mobile);
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
  return providerTitles[provider] || "Codex";
}

function resolveWecomUserIdFromRuntime() {
  const url = new URL(window.location.href);
  const queryCandidates = [
    url.searchParams.get("wecom_userid"),
    url.searchParams.get("wecomuserid"),
    url.searchParams.get("actor_wecom_userid"),
    url.searchParams.get("userid"),
  ];

  const globalCandidates = [
    window.__WECOM_USERID__,
    window.__ACTOR_WECOM_USERID__,
  ];

  const storedCandidate = localStorage.getItem("cloud-agent-wecom-userid");

  return [...queryCandidates, ...globalCandidates, storedCandidate]
    .find((value) => typeof value === "string" && value.trim())
    ?.trim() || "";
}

function syncResolvedWecomUserId() {
  const wecomUserId = resolveWecomUserIdFromRuntime();
  state.currentWecomUserId = wecomUserId;

  if (wecomUserId) {
    localStorage.setItem("cloud-agent-wecom-userid", wecomUserId);
  } else {
    localStorage.removeItem("cloud-agent-wecom-userid");
  }
}

function availableProviders() {
  return state.supportedProviders.filter((provider) => modelOptions[provider]);
}

function renderProviderOptions() {
  const providers = availableProviders();
  const fallbackProvider = providers.includes(state.defaultProvider) ? state.defaultProvider : (providers[0] || "gemini");
  const optionHtml = providers
    .map((provider) => `<option value="${provider}">${providerLabel(provider)}</option>`)
    .join("");

  elements.provider.innerHTML = optionHtml;
  elements.providerMobile.innerHTML = optionHtml;

  if (!providers.includes(elements.provider.value)) {
    elements.provider.value = fallbackProvider;
  }
  if (!providers.includes(elements.providerMobile.value)) {
    elements.providerMobile.value = elements.provider.value || fallbackProvider;
  }
}

function setStatus(text) {
  if (elements.statusTextDesktop) elements.statusTextDesktop.textContent = text;
}

function syncMessagePlaceholder() {
  elements.userMessage.placeholder = state.currentWecomUserId
    ? (state.activeMessages.length ? "继续输入消息" : "输入你的问题，直接开始")
    : "请从企业微信入口进入后再开始对话";
}

function syncTopbarTitle() {
  const title = state.activeSessionId ? elements.chatTitle.textContent : "Codex";
  elements.mobileProviderTitle.textContent = title;
}

function syncGreetingState() {
  const hasMessages = state.activeMessages.length > 0;
  elements.mobileGreetingTitle.innerHTML = '<span class="empty-title-mark" aria-hidden="true"></span>需要我为你做些什么？';
  elements.mobileGreetingSubtitle.textContent = hasMessages
    ? `${providerLabel(elements.provider.value)} 已准备好`
    : "你好，欢迎回来";
  document.body.classList.toggle("has-conversation", hasMessages);
}

function syncCurrentUserUI() {
  const userId = state.currentWecomUserId?.trim() || "";
  elements.currentUserCard?.classList.toggle("hidden", !userId);
  if (elements.currentUserId) {
    elements.currentUserId.textContent = userId || "未识别";
  }
  if (elements.avatarMenuToggle) {
    elements.avatarMenuToggle.textContent = userId ? userId.slice(0, 2).toUpperCase() : "AI";
  }
  syncMessagePlaceholder();
  syncComposerState();
}

function showIdentityRequiredState(message) {
  state.sessions = [];
  state.activeSessionId = null;
  state.activeMessages = [];
  elements.chatTitle.textContent = "Codex";
  elements.sessionList.innerHTML = '<p class="section-title">当前用户未登录</p>';
  elements.messageList.classList.remove("is-empty");
  elements.messageList.innerHTML = `
    <article class="message-row assistant">
      <article class="message assistant">
        <div class="message-content">
          <p>${escapeHtml(message)}</p>
        </div>
      </article>
    </article>
  `;
  setStatus(message);
}

function setAvatarMenuOpen(open) {
  if (!elements.avatarMenu || !elements.avatarMenuToggle) return;
  elements.avatarMenu.classList.toggle("hidden", !open);
  elements.avatarMenu.classList.toggle("open", open);
  elements.avatarMenu.setAttribute("aria-hidden", open ? "false" : "true");
  elements.avatarMenuToggle.setAttribute("aria-expanded", open ? "true" : "false");
}

function closeAvatarMenu() {
  setAvatarMenuOpen(false);
}

function toggleAvatarMenu() {
  if (!elements.avatarMenu) return;
  setAvatarMenuOpen(elements.avatarMenu.classList.contains("hidden"));
}

function closeSessionMenus() {
  if (!state.sessionMenuOpenId) return;
  state.sessionMenuOpenId = null;
  renderSessions();
}

function openDeleteDialog(session) {
  state.pendingDeleteSession = session;
  if (elements.deleteDialogTitle) {
    elements.deleteDialogTitle.textContent = `确认删除“${session.title}”？`;
  }
  if (elements.deleteDialogCopy) {
    elements.deleteDialogCopy.textContent = "删除后无法恢复，相关消息记录会一并移除。";
  }
  elements.deleteDialog?.classList.remove("hidden");
  elements.deleteDialog?.setAttribute("aria-hidden", "false");
  elements.dialogBackdrop?.classList.remove("hidden");
}

function closeDeleteDialog() {
  state.pendingDeleteSession = null;
  elements.deleteDialog?.classList.add("hidden");
  elements.deleteDialog?.setAttribute("aria-hidden", "true");
  elements.dialogBackdrop?.classList.add("hidden");
}

function syncResponsiveState() {
  syncMobileThemeByTime();
}

function syncSidebarButtons() {
  const collapsed = state.sidebarCollapsed;
  if (elements.sidebarToggle) {
    elements.sidebarToggle.classList.toggle("is-collapsed", collapsed);
    elements.sidebarToggle.setAttribute("aria-label", collapsed ? "展开会话栏" : "收起会话栏");
  }
}

function applySidebarState() {
  const mobile = isMobileViewport();
  if (elements.sidebar) {
    elements.sidebar.classList.toggle("collapsed", state.sidebarCollapsed && !mobile);
    elements.sidebar.classList.toggle("mobile-open", mobile && !state.sidebarCollapsed);
  }
  document.body.classList.toggle("sidebar-collapsed", state.sidebarCollapsed && !mobile);
  elements.sidebarRailToggle?.classList.toggle("hidden", mobile || !state.sidebarCollapsed);
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
  const identityReady = Boolean(state.currentWecomUserId);
  elements.userMessage.disabled = !identityReady || generating;
  elements.sendButton.disabled = !identityReady;
  elements.sendButton.classList.toggle("is-generating", generating);
  elements.sendButton.classList.toggle("is-disabled", !identityReady);
  elements.sendButton.setAttribute("aria-label", !identityReady ? "等待登录" : generating ? "停止生成" : "发送");
  elements.sendButton.querySelector(".send-label").textContent = !identityReady ? "登录后使用" : generating ? "停止" : "发送";
  elements.sendButton.querySelector(".send-glyph").classList.toggle("is-stop", generating);
  elements.stopButton.classList.add("hidden");
}

function renderAttachments() {
  if (!elements.attachmentList) return;
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
  } else {
    localStorage.removeItem("cloud-agent-access-password");
  }

  if (state.currentWecomUserId) {
    localStorage.setItem("cloud-agent-wecom-userid", state.currentWecomUserId);
  } else {
    localStorage.removeItem("cloud-agent-wecom-userid");
  }
}

function loadPreferences() {
  const raw = localStorage.getItem("cloud-agent-preferences");
  if (raw) {
    try {
      const data = JSON.parse(raw);
      elements.provider.value = data.provider || state.defaultProvider;
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
  state.currentWecomUserId = localStorage.getItem("cloud-agent-wecom-userid") || "";
  state.sidebarCollapsed = localStorage.getItem("cloud-agent-sidebar-collapsed") === "1";
  if (isMobileViewport()) {
    state.sidebarCollapsed = true;
  }
}

function syncViewportInsets(forceReset = false) {
  if (forceReset || !isMobileViewport() || !window.visualViewport) {
    document.documentElement.style.setProperty("--keyboard-offset", "0px");
    return;
  }

  document.documentElement.style.setProperty("--keyboard-offset", "0px");
}

function resetMobilePagePosition() {
  if (!isMobileViewport()) return;

  const reset = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  reset();
  window.requestAnimationFrame(reset);
  window.setTimeout(reset, 80);
  window.setTimeout(reset, 180);
}

function isComposerFocused() {
  return document.activeElement === elements.userMessage;
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
  if (!elements.providerChipList || !elements.modelCardList) return;

  elements.providerChipList.innerHTML = `
    <span class="provider-chip active provider-chip-static">Codex</span>
  `;

  const activeLabel = options.find((option) => option.value === activeModel)?.label || activeModel || "默认模式";
  elements.modelCardList.innerHTML = `
    <article class="model-card active model-card-static">
      <span>Codex</span>
      <strong>当前后端默认模型：${escapeHtml(activeLabel)}</strong>
      <em>已登录并固定使用</em>
    </article>
  `;
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

function showIdentityOverlay(message = "请输入你的用户 ID") {
  elements.identityOverlay?.classList.remove("hidden");
  if (elements.identityUserId) {
    elements.identityUserId.value = state.currentWecomUserId || "";
  }
  if (elements.identityStatus) {
    elements.identityStatus.textContent = message;
  }
}

function hideIdentityOverlay() {
  elements.identityOverlay?.classList.add("hidden");
}

function setIdentityStatus(text) {
  if (elements.identityStatus) {
    elements.identityStatus.textContent = text;
  }
}

function authHeaders() {
  return {
    ...(state.accessPassword ? { "x-access-password": state.accessPassword } : {}),
    ...(state.currentWecomUserId ? { "x-wecom-userid": state.currentWecomUserId } : {}),
  };
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
        <div class="session-item ${session.session_id === state.activeSessionId ? "active" : ""}">
          <button class="session-item-main" data-session-id="${session.session_id}">
            <strong>${escapeHtml(session.title)}</strong>
            <span>${escapeHtml(session.provider || "未选择模型")} · ${escapeHtml(session.model || "默认模型")}</span>
            <span class="session-meta">${formatRelativeTime(session.updated_at)} · ${session.message_count} 条消息</span>
          </button>
          <div class="session-item-actions">
            <button type="button" class="session-menu-button" data-session-menu="${session.session_id}" aria-label="会话菜单">⋯</button>
            <div class="session-menu ${state.sessionMenuOpenId === session.session_id ? "" : "hidden"}">
              <button type="button" class="session-menu-action danger" data-delete-session="${session.session_id}">删除会话</button>
            </div>
          </div>
        </div>
      `,
    )
    .join("");
}

function renderMessages(messages, pending = null) {
  state.activeMessages = messages;
  const items = [...messages];
  if (pending) {
    if (pending.userText) {
      items.push({ role: "user", content: pending.userText });
    }
    items.push({ role: "assistant", content: pending.placeholder || "正在输入中", pending: true });
  }

  if (!items.length) {
    elements.messageList.classList.add("is-empty");
    elements.messageList.innerHTML = `
      <div class="empty-state">
        <h3><span class="empty-title-mark" aria-hidden="true"></span>需要我为你做些什么？</h3>
      </div>
    `;
    syncGreetingState();
    return;
  }

  elements.messageList.classList.remove("is-empty");
  elements.messageList.innerHTML = items
    .map(
      (message, index) => `
        <article class="message-row ${message.role} ${message.pending ? "pending" : ""}">
          <article class="message ${message.role} ${message.pending ? "pending" : ""}">
            <div class="message-toolbar">
              <span class="message-role">${message.role === "user" ? "你" : message.pending ? "思考中" : "助手"}</span>
              ${message.pending ? "" : `<button type="button" class="ghost-button message-copy-button" data-copy-index="${index}">复制</button>`}
            </div>
            <div class="message-content">${message.pending ? `<div class="thinking-line" aria-label="${escapeHtml(message.content)}"><span class="thinking-wave" aria-hidden="true"><span></span><span></span><span></span></span><span class="thinking-label">${escapeHtml(message.content)}</span></div>` : formatContent(message.content)}</div>
          </article>
        </article>
      `,
    )
    .join("");

  requestAnimationFrame(() => {
    if (isMobileViewport()) {
      const lastUserRow = [...elements.messageList.querySelectorAll(".message-row.user")].pop();
      if (lastUserRow) {
        elements.messageList.scrollTop = Math.max(0, lastUserRow.offsetTop - 14);
      } else {
        elements.messageList.scrollTop = 0;
      }
      return;
    }
    elements.messageList.scrollTop = elements.messageList.scrollHeight;
  });
  syncGreetingState();
}

async function handleSessionListClick(event) {
  const sessionButton = event.target.closest(".session-item-main");
  if (sessionButton?.dataset.sessionId) {
    await loadSession(sessionButton.dataset.sessionId);
    if (isMobileViewport()) {
      state.sidebarCollapsed = true;
      applySidebarState();
      syncViewportInsets();
    }
    return;
  }

  const menuButton = event.target.closest("[data-session-menu]");
  if (menuButton?.dataset.sessionMenu) {
    event.stopPropagation();
    const nextId = menuButton.dataset.sessionMenu;
    state.sessionMenuOpenId = state.sessionMenuOpenId === nextId ? null : nextId;
    renderSessions();
    return;
  }

  const deleteButton = event.target.closest("[data-delete-session]");
  if (deleteButton?.dataset.deleteSession) {
    event.stopPropagation();
    const session = state.sessions.find((item) => item.session_id === deleteButton.dataset.deleteSession);
    if (!session) return;
    closeSessionMenus();
    openDeleteDialog(session);
  }
}

async function handleMessageListClick(event) {
  const promptButton = event.target.closest("[data-prompt]");
  if (promptButton) {
    if (state.isGenerating) return;
    elements.userMessage.value = promptButton.dataset.prompt || "";
    elements.userMessage.dispatchEvent(new Event("input"));
    elements.chatForm.requestSubmit();
    return;
  }

  const copyButton = event.target.closest("[data-copy-index]");
  if (!copyButton) return;
  const index = Number(copyButton.dataset.copyIndex);
  const message = state.activeMessages[index];
  if (!message?.content) return;
  await navigator.clipboard.writeText(message.content);
  setStatus("已复制消息内容");
}

function clearInvalidSessionState() {
  state.activeSessionId = null;
  state.activeMessages = [];
  elements.chatTitle.textContent = "Codex";
  renderSessions();
  renderMessages([]);
  persistPreferences();
}

function buildRequestFailureMessage(detail) {
  const reason = String(detail || "").trim() || "这次请求没有成功返回结果。";
  return [
    "这次请求没有成功。",
    "",
    reason,
    "",
    "你可以直接再试一次；如果它一直这样，把这条提示发给我，我会继续顺着查。",
  ].join("\n");
}

function normalizeSessionMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((message, index, all) => {
    if (
      message?.role === "assistant" &&
      index === all.length - 1 &&
      !String(message?.content || "").trim()
    ) {
      return {
        ...message,
        content: "这次已经收到响应了，但返回内容是空的。你可以重试一次，我也可以继续帮你查为什么没有正文。",
      };
    }
    return message;
  });
}

const pendingProgressSteps = [
  "已收到请求，正在准备会话",
  "正在调用模型",
  "正在整理回复",
  "正在写入会话记录",
];

function buildPendingPlaceholder(stepIndex = 0) {
  const index = Math.max(0, Math.min(stepIndex, pendingProgressSteps.length - 1));
  return pendingProgressSteps[index];
}

function stopPendingProgress() {
  if (state.pendingProgressTimer) {
    window.clearInterval(state.pendingProgressTimer);
    state.pendingProgressTimer = null;
  }
  state.pendingProgressIndex = 0;
  state.lastProgressAt = 0;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
    if (response.status === 401 && detail.includes("访问口令")) {
      showAuthOverlay();
    }
    throw new Error(detail);
  }
  return response.json();
}

async function fetchEventStream(url, options = {}, handlers = {}) {
  const headers = {
    ...(options.headers || {}),
    ...authHeaders(),
    Accept: "text/event-stream",
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
    if (response.status === 401 && detail.includes("访问口令")) {
      showAuthOverlay();
    }
    throw new Error(detail);
  }

  if (!response.body) {
    throw new Error("流式响应不可用");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes("\n\n")) {
      const boundary = buffer.indexOf("\n\n");
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (!rawEvent.trim()) continue;

      const lines = rawEvent.split(/\r?\n/);
      let eventName = "message";
      const dataLines = [];

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }

      let payload = null;
      if (dataLines.length) {
        try {
          payload = JSON.parse(dataLines.join("\n"));
        } catch {
          payload = { detail: dataLines.join("\n") };
        }
      }

      if (eventName === "progress" && handlers.onProgress) {
        handlers.onProgress(payload);
      } else if (eventName === "final" && handlers.onFinal) {
        handlers.onFinal(payload);
      } else if (eventName === "error" && handlers.onError) {
        handlers.onError(payload);
      }
    }
  }
}

async function refreshSessions() {
  state.sessions = await fetchJson("/v1/sessions");
  renderSessions();
}

async function deleteSession(sessionId) {
  await fetchJson(`/v1/sessions/${sessionId}`, {
    method: "DELETE",
  });

  if (state.activeSessionId === sessionId) {
    clearInvalidSessionState();
  }

  await refreshSessions();

  if (!state.activeSessionId && state.sessions.length) {
    await loadSession(state.sessions[0].session_id);
  } else if (!state.sessions.length) {
    renderMessages([]);
  }
}

async function loadPublicConfig() {
  const config = await fetchJson("/v1/public-config");
  if (typeof config.current_wecom_userid === "string" && config.current_wecom_userid.trim()) {
    state.currentWecomUserId = config.current_wecom_userid.trim();
  }
  state.requiresPassword = config.requires_password;
  if (Array.isArray(config.supported_providers) && config.supported_providers.length) {
    state.supportedProviders = config.supported_providers.filter((provider) => modelOptions[provider]);
  }
  if (config.default_provider && modelOptions[config.default_provider]) {
    state.defaultProvider = config.default_provider;
  }
  if (config.default_models && typeof config.default_models === "object") {
    Object.entries(config.default_models).forEach(([provider, model]) => {
      if (modelOptions[provider] && typeof model === "string" && model) {
        modelDefaults[provider] = model;
      }
    });
  }
  renderProviderOptions();
  if (!availableProviders().includes(elements.provider.value)) {
    elements.provider.value = state.defaultProvider;
  }
  elements.providerMobile.value = elements.provider.value;
  syncModelOptions(elements.model.value);
  syncCurrentUserUI();
  persistPreferences();
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
    elements.provider.value = session.provider || state.defaultProvider;
    if (!availableProviders().includes(elements.provider.value)) {
      elements.provider.value = state.defaultProvider;
    }
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
  stopPendingProgress();
  syncComposerState();
  renderMessages(state.activeMessages);
  setStatus("已停止等待当前回复");
}

async function submitTurn(event) {
  event.preventDefault();
  if (state.isGenerating) {
    stopGeneration();
    return;
  }

  const userMessage = elements.userMessage.value.trim();
  if (!userMessage) return;

  if (!state.activeSessionId) {
    const session = await createSession();
    elements.chatTitle.textContent = session.title;
  }

  state.abortController = new AbortController();
  state.isGenerating = true;
  state.activeMessages = [
    ...state.activeMessages,
    { role: "user", content: userMessage },
  ];
  elements.userMessage.value = "";
  elements.userMessage.dispatchEvent(new Event("input"));
  syncComposerState();
  renderMessages(state.activeMessages, {
    placeholder: buildPendingPlaceholder(0),
  });
  setStatus("正在生成回复…");

  try {
    let streamedSession = null;

    await fetchEventStream(`/v1/sessions/${state.activeSessionId}/chat/stream`, {
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
    }, {
      onProgress: (payload) => {
        const step = String(payload?.step || "").trim() || buildPendingPlaceholder(0);
        state.lastProgressAt = Date.now();
        renderMessages(state.activeMessages, { placeholder: step });
      },
      onFinal: (payload) => {
        streamedSession = payload?.session || null;
      },
      onError: (payload) => {
        throw new Error(String(payload?.detail || "流式请求失败"));
      },
    });

    const session = streamedSession;
    if (!session) {
      throw new Error("没有收到最终会话结果");
    }

    const remainingProgressDwell = Math.max(0, 260 - (Date.now() - state.lastProgressAt));
    if (remainingProgressDwell > 0) {
      await delay(remainingProgressDwell);
    }

    state.activeMessages = normalizeSessionMessages(session.messages);
    stopPendingProgress();
    state.attachments = [];
    elements.fileInput.value = "";
    renderAttachments();
    elements.chatTitle.textContent = session.title;
    renderMessages(state.activeMessages);
    await refreshSessions();
    setStatus("回复已完成");
  } catch (error) {
    stopPendingProgress();
    if (error.name === "AbortError") return;
    if (error.message.includes("Session not found")) {
      clearInvalidSessionState();
      setStatus("当前会话已失效，请重新创建一个新会话");
      return;
    }
    renderMessages([
      ...state.activeMessages,
      { role: "assistant", content: buildRequestFailureMessage(error.message) },
    ]);
    setStatus(`失败: ${error.message}`);
  } finally {
    state.isGenerating = false;
    state.abortController = null;
    stopPendingProgress();
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

async function verifyIdentity() {
  const userId = elements.identityUserId?.value?.trim() || "";
  if (!userId) {
    setIdentityStatus("请输入有效的用户 ID");
    return;
  }

  state.currentWecomUserId = userId;
  syncCurrentUserUI();
  persistPreferences();
  setIdentityStatus("正在进入工作台...");

  try {
    await loadPublicConfig();
    await refreshSessions();
    hideIdentityOverlay();

    if (state.activeSessionId && state.sessions.some((session) => session.session_id === state.activeSessionId)) {
      await loadSession(state.activeSessionId);
    } else if (state.sessions.length) {
      await loadSession(state.sessions[0].session_id);
    } else {
      clearInvalidSessionState();
    }

    setStatus("已登录到专属会话空间");
  } catch (error) {
    setIdentityStatus(`登录失败: ${error.message}`);
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
  const startNewSession = async () => {
    const session = await createSession();
    elements.chatTitle.textContent = session.title;
    state.activeMessages = [];
    renderMessages([]);
    if (isMobileViewport()) {
      state.sidebarCollapsed = true;
      applySidebarState();
    }
  };

  elements.mobileNewChatButton?.addEventListener("click", () => {
    startNewSession();
  });

  elements.authSubmit.addEventListener("click", verifyAccess);
  elements.identitySubmit?.addEventListener("click", verifyIdentity);
  elements.stopButton.addEventListener("click", stopGeneration);
  elements.sendButton.addEventListener("click", (event) => {
    if (!state.isGenerating) return;
    event.preventDefault();
    event.stopPropagation();
    stopGeneration();
  });

  [elements.logoutButton].forEach((button) => {
    button?.addEventListener("click", () => {
      stopGeneration();
      closeAvatarMenu();
      state.accessPassword = "";
      state.currentWecomUserId = "";
      localStorage.removeItem("cloud-agent-access-password");
      localStorage.removeItem("cloud-agent-wecom-userid");
      syncCurrentUserUI();
      hideIdentityOverlay();
      if (state.requiresPassword) {
        showAuthOverlay();
        setStatus("已退出登录，请重新输入访问口令");
      } else {
        showIdentityOverlay("已退出当前用户，请重新输入用户 ID");
        setStatus("已退出当前用户");
      }
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

  elements.identityUserId?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      verifyIdentity();
    }
  });

  [elements.mobileInputShell, elements.mobileTextEntry].forEach((element) => {
    element?.addEventListener("click", (event) => {
      if (event.target.closest("button")) {
        return;
      }
      elements.userMessage.focus();
    });
  });

  elements.desktopAttachmentTrigger?.addEventListener("click", () => {
    elements.fileInput.accept = DOCUMENT_ACCEPT;
    elements.fileInput.click();
  });

  elements.dialogBackdrop?.addEventListener("click", closeDeleteDialog);
  elements.messageList?.addEventListener("click", handleMessageListClick);
  elements.sessionList?.addEventListener("click", (event) => {
    handleSessionListClick(event).catch((error) => {
      setStatus(`会话操作失败: ${error.message}`);
    });
  });

  elements.deleteCancelButton?.addEventListener("click", closeDeleteDialog);
  elements.deleteConfirmButton?.addEventListener("click", async () => {
    if (!state.pendingDeleteSession) return;
    const sessionId = state.pendingDeleteSession.session_id;
    closeDeleteDialog();
    await deleteSession(sessionId);
    setStatus("会话已删除");
  });

  elements.attachmentFileTrigger?.addEventListener("click", () => {
    elements.fileInput.accept = DOCUMENT_ACCEPT;
    elements.fileInput.click();
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

  elements.sidebarRailToggle?.addEventListener("click", () => {
    state.sidebarCollapsed = false;
    applySidebarState();
  });

  elements.mobileSidebarBackdrop.addEventListener("click", () => {
    state.sidebarCollapsed = true;
    applySidebarState();
  });

  elements.avatarMenuToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleAvatarMenu();
  });

  document.addEventListener("click", (event) => {
    if (!state.sessionMenuOpenId) return;
    if (event.target.closest(".session-item-actions")) return;
    closeSessionMenus();
  });

  document.addEventListener("click", (event) => {
    if (!elements.avatarMenu || elements.avatarMenu.classList.contains("hidden")) return;
    if (event.target.closest(".avatar-menu-shell")) return;
    closeAvatarMenu();
  });

  window.addEventListener("resize", () => {
    syncResponsiveState();
    applySidebarState();
    syncViewportInsets();
    if (!isComposerFocused()) {
      resetMobilePagePosition();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncMobileThemeByTime();
    }
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncViewportInsets);
    window.visualViewport.addEventListener("resize", () => {
      if (!isComposerFocused()) {
        resetMobilePagePosition();
      }
    });
  }

  elements.userMessage.addEventListener("focus", () => {
    window.setTimeout(syncViewportInsets, 120);
  });

  elements.userMessage.addEventListener("blur", () => {
    window.setTimeout(() => syncViewportInsets(true), 60);
    window.setTimeout(resetMobilePagePosition, 60);
  });
}

async function bootstrap() {
  loadPreferences();
  syncResolvedWecomUserId();
  renderProviderOptions();
  syncModelOptions(elements.model.value);
  syncComposerState();
  syncResponsiveState();
  applySidebarState();
  syncViewportInsets();
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
    try {
      await refreshSessions();
    } catch (error) {
      if (error.message.includes("缺少企业微信身份")) {
        showIdentityOverlay("请输入你的用户 ID 继续");
        return;
      }
      throw error;
    }
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
