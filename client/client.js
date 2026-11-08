const SUPABASE_URL = "https://bpdqosfgxqawbzljafgb.supabase.co";
const SUPABASE_KEY = "sb_publishable_FQaK_TPRAjA1NMcVG9zqzw_VFvqaRXk";

const TOKEN_KEY = "custom_tools_client_access_token";
const REFRESH_KEY = "custom_tools_client_refresh_token";
const EMAIL_KEY = "custom_tools_client_email";

const STATUS_LABELS = {
  concept: "Концепт",
  in_progress: "В работе",
  paused: "Пауза",
  completed: "Готов"
};

const APPROVAL_LABELS = {
  pending: "Ждёт ответа",
  approved: "Принято",
  changes_requested: "Нужны правки",
  cancelled: "Отменено"
};

const loginView = document.querySelector("#client-login-view");
const dashboardView = document.querySelector("#client-dashboard-view");
const loginForm = document.querySelector("#client-login-form");
const loginStatus = document.querySelector("#client-login-status");
const dashboardStatus = document.querySelector("#client-dashboard-status");
const passwordPanel = document.querySelector("#client-password-panel");
const projectsSection = document.querySelector("#client-projects-section");
const projectsRoot = document.querySelector("#client-projects");

const projectCards = new Map();
let dashboardProjects = [];

function setStatus(element, message, type = "") {
  element.textContent = message;
  element.dataset.type = type;
}

function saveSession(data) {
  sessionStorage.setItem(TOKEN_KEY, data.access_token || "");
  sessionStorage.setItem(REFRESH_KEY, data.refresh_token || "");
  sessionStorage.setItem(
    EMAIL_KEY,
    data.user?.email || sessionStorage.getItem(EMAIL_KEY) || ""
  );
}

function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(EMAIL_KEY);
}

function token() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

async function refreshSession() {
  const refreshToken = sessionStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return false;

  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    }
  );

  if (!response.ok) return false;
  saveSession(await response.json());
  return true;
}

async function authRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data?.error_description ||
      data?.msg ||
      data?.error ||
      `HTTP ${response.status}`
    );
  }

  return data;
}

async function portalApi(body, retry = true) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/client-portal`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (response.status === 401 && retry && await refreshSession()) {
    return portalApi(body, false);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return data;
}

function safeMediaUrl(value, bucket) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const prefix = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/`;

    if (url.protocol !== "https:" || !url.href.startsWith(prefix)) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function addCopyBlock(root, title, value) {
  if (!value?.trim()) return;

  const block = document.createElement("section");
  block.className = "client-copy-block";

  const heading = document.createElement("h4");
  heading.textContent = title;

  const text = document.createElement("p");
  text.textContent = value.trim();

  block.append(heading, text);
  root.appendChild(block);
}

function makeEmpty(text) {
  const empty = document.createElement("div");
  empty.className = "client-empty compact";
  empty.textContent = text;
  return empty;
}

function createOverview(project) {
  const panel = document.createElement("section");
  panel.className = "client-workspace-panel";
  panel.dataset.panel = "overview";

  const coverUrl = safeMediaUrl(project.cover_url, "project-covers");
  if (coverUrl) {
    const cover = document.createElement("img");
    cover.className = "client-cover";
    cover.src = coverUrl;
    cover.alt = `Обложка проекта «${project.title || "Проект"}»`;
    panel.appendChild(cover);
  }

  const copy = document.createElement("div");
  copy.className = "client-copy";
  addCopyBlock(copy, "Контекст", project.description);
  addCopyBlock(copy, "Задача", project.task);
  addCopyBlock(copy, "Решение", project.solution);
  addCopyBlock(copy, "Результат", project.result);
  panel.appendChild(copy);

  const mediaItems = Array.isArray(project.media) ? project.media : [];
  const validMedia = mediaItems
    .map(item => ({
      ...item,
      safe_url: safeMediaUrl(item.url, "project-media")
    }))
    .filter(item => item.safe_url);

  if (validMedia.length) {
    const gallery = document.createElement("div");
    gallery.className = "client-media";

    for (const item of validMedia) {
      const figure = document.createElement("figure");

      if (item.kind === "video") {
        const video = document.createElement("video");
        video.src = item.safe_url;
        video.controls = true;
        video.preload = "metadata";
        video.playsInline = true;
        figure.appendChild(video);
      } else {
        const image = document.createElement("img");
        image.src = item.safe_url;
        image.alt =
          item.caption || `Материал проекта «${project.title || "Проект"}»`;
        image.loading = "lazy";
        figure.appendChild(image);
      }

      if (item.caption) {
        const caption = document.createElement("figcaption");
        caption.textContent = item.caption;
        figure.appendChild(caption);
      }

      gallery.appendChild(figure);
    }

    panel.appendChild(gallery);
  }

  return panel;
}

function createDiscussionPanel(project) {
  const panel = document.createElement("section");
  panel.className = "client-workspace-panel is-hidden";
  panel.dataset.panel = "discussion";

  const feed = document.createElement("div");
  feed.className = "client-message-feed";
  feed.dataset.messages = project.slug;
  feed.appendChild(makeEmpty("Загружаю обсуждение…"));

  const form = document.createElement("form");
  form.className = "client-message-form";

  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.maxLength = 5000;
  textarea.placeholder = "Напишите сообщение по проекту…";
  textarea.required = true;

  const actions = document.createElement("div");
  actions.className = "client-form-actions";

  const hint = document.createElement("span");
  hint.textContent = "Enter — новая строка. Сообщение увидит команда студии.";

  const button = document.createElement("button");
  button.type = "submit";
  button.className = "btn primary";
  button.textContent = "Отправить";

  actions.append(hint, button);
  form.append(textarea, actions);

  const status = document.createElement("p");
  status.className = "client-status";
  status.dataset.messageStatus = project.slug;
  status.setAttribute("role", "status");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = textarea.value.trim();
    if (!message) return;

    button.disabled = true;
    setStatus(status, "Отправляю…");

    try {
      await portalApi({
        action: "send_message",
        project_slug: project.slug,
        message
      });
      textarea.value = "";
      await loadWorkspace(project.slug, true);
      setStatus(status, "Сообщение отправлено.", "success");
    } catch (error) {
      setStatus(status, `Ошибка: ${error.message}`, "error");
    } finally {
      button.disabled = false;
    }
  });

  panel.append(feed, form, status);
  return panel;
}

function createFilesPanel(project) {
  const panel = document.createElement("section");
  panel.className = "client-workspace-panel is-hidden";
  panel.dataset.panel = "files";

  const upload = document.createElement("div");
  upload.className = "client-upload-box";

  const uploadCopy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = "Передать файлы";
  const note = document.createElement("span");
  note.textContent = "PDF, ZIP, документы, изображения и видео — до 100 МБ на файл.";
  uploadCopy.append(title, note);

  const picker = document.createElement("input");
  picker.type = "file";
  picker.multiple = true;
  picker.accept =
    ".pdf,.zip,.txt,.csv,.json,.jpg,.jpeg,.png,.webp,.avif,.mp4,.webm,.mov,.docx,.xlsx,.pptx";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "client-ghost";
  button.textContent = "Загрузить выбранное";

  upload.append(uploadCopy, picker, button);

  const status = document.createElement("p");
  status.className = "client-status";
  status.dataset.fileStatus = project.slug;
  status.setAttribute("role", "status");

  const list = document.createElement("div");
  list.className = "client-file-list";
  list.dataset.files = project.slug;
  list.appendChild(makeEmpty("Загружаю файлы…"));

  button.addEventListener("click", async () => {
    const files = Array.from(picker.files || []);
    if (!files.length) {
      setStatus(status, "Сначала выберите файл.");
      return;
    }

    button.disabled = true;

    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];

        if (!file.type) {
          throw new Error(`Не удалось определить тип файла «${file.name}».`);
        }

        if (file.size > 100 * 1024 * 1024) {
          throw new Error(`Файл «${file.name}» больше 100 МБ.`);
        }

        setStatus(
          status,
          `Загружаю ${index + 1} из ${files.length}: ${file.name}`
        );

        const prepared = await portalApi({
          action: "prepare_upload",
          project_slug: project.slug,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size
        });

        const formData = new FormData();
        formData.append("cacheControl", "0");
        formData.append("", file);

        const uploadResponse = await fetch(prepared.upload.signed_url, {
          method: "PUT",
          headers: { "x-upsert": "false" },
          body: formData
        });

        if (!uploadResponse.ok) {
          throw new Error(
            `Не удалось загрузить «${file.name}» (HTTP ${uploadResponse.status}).`
          );
        }

        await portalApi({
          action: "commit_upload",
          project_slug: project.slug,
          path: prepared.upload.path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size
        });
      }

      picker.value = "";
      await loadWorkspace(project.slug, true);
      setStatus(status, "Файлы загружены.", "success");
    } catch (error) {
      setStatus(status, `Ошибка: ${error.message}`, "error");
    } finally {
      button.disabled = false;
    }
  });

  panel.append(upload, status, list);
  return panel;
}

function createApprovalsPanel(project) {
  const panel = document.createElement("section");
  panel.className = "client-workspace-panel is-hidden";
  panel.dataset.panel = "approvals";

  const intro = document.createElement("p");
  intro.className = "client-panel-intro";
  intro.textContent =
    "Здесь появляются этапы, которые ждут вашего решения. Можно принять результат или сразу описать, что нужно поправить.";

  const list = document.createElement("div");
  list.className = "client-approval-list";
  list.dataset.approvals = project.slug;
  list.appendChild(makeEmpty("Загружаю согласования…"));

  panel.append(intro, list);
  return panel;
}

function switchProjectTab(card, tab) {
  card.querySelectorAll("[data-project-tab]").forEach(button => {
    button.classList.toggle("is-active", button.dataset.projectTab === tab);
  });

  card.querySelectorAll("[data-panel]").forEach(panel => {
    panel.classList.toggle("is-hidden", panel.dataset.panel !== tab);
  });
}

function createProjectWorkspace(project) {
  const workspace = document.createElement("div");
  workspace.className = "client-workspace";

  const tabs = document.createElement("div");
  tabs.className = "client-workspace-tabs";
  tabs.setAttribute("role", "tablist");

  const tabDefs = [
    ["overview", "Обзор"],
    ["discussion", "Обсуждение"],
    ["files", "Файлы"],
    ["approvals", "Согласование"]
  ];

  for (const [key, label] of tabDefs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "client-workspace-tab";
    if (key === "overview") button.classList.add("is-active");
    button.dataset.projectTab = key;

    const text = document.createElement("span");
    text.textContent = label;
    button.appendChild(text);

    if (key === "approvals" && project.pending_approvals > 0) {
      const badge = document.createElement("b");
      badge.textContent = String(project.pending_approvals);
      badge.dataset.approvalBadge = project.slug;
      button.appendChild(badge);
    }

    button.addEventListener("click", async () => {
      const card = projectCards.get(project.slug)?.card;
      if (!card) return;

      switchProjectTab(card, key);

      if (key !== "overview") {
        await loadWorkspace(project.slug);
      }
    });

    tabs.appendChild(button);
  }

  workspace.append(
    tabs,
    createOverview(project),
    createDiscussionPanel(project),
    createFilesPanel(project),
    createApprovalsPanel(project)
  );

  return workspace;
}

function renderMessages(project, workspace) {
  const root = workspace.querySelector(`[data-messages="${project.slug}"]`);
  root.replaceChildren();

  const messages = workspace._data?.messages || [];

  if (!messages.length) {
    root.appendChild(makeEmpty("Сообщений пока нет. Можно написать первым."));
    return;
  }

  for (const message of messages) {
    const item = document.createElement("article");
    item.className =
      "client-message " +
      (message.author_role === "client" ? "is-client" : "is-studio");

    const head = document.createElement("div");
    head.className = "client-message-head";

    const author = document.createElement("strong");
    author.textContent =
      message.author_role === "client" ? "Вы" : "Студия";

    const date = document.createElement("span");
    date.textContent = formatDate(message.created_at);

    const body = document.createElement("p");
    body.textContent = message.body;

    head.append(author, date);
    item.append(head, body);
    root.appendChild(item);
  }

  root.scrollTop = root.scrollHeight;
}

function renderFiles(project, workspace) {
  const root = workspace.querySelector(`[data-files="${project.slug}"]`);
  root.replaceChildren();

  const files = workspace._data?.files || [];

  if (!files.length) {
    root.appendChild(makeEmpty("Файлов пока нет."));
    return;
  }

  for (const file of files) {
    const row = document.createElement("article");
    row.className = "client-file-row";

    const info = document.createElement("div");
    info.className = "client-file-info";

    const name = document.createElement("strong");
    name.textContent = file.file_name;

    const meta = document.createElement("span");
    meta.textContent =
      `${file.uploaded_by_role === "client" ? "От вас" : "От студии"} · ` +
      `${formatBytes(file.size_bytes)} · ${formatDate(file.created_at)}`;

    info.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "client-file-actions";

    if (file.download_url) {
      const download = document.createElement("a");
      download.className = "client-ghost";
      download.href = file.download_url;
      download.textContent = "Скачать";
      download.target = "_blank";
      download.rel = "noopener";
      actions.appendChild(download);
    }

    if (file.uploaded_by_me) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "client-ghost is-danger";
      remove.textContent = "Удалить";
      remove.addEventListener("click", async () => {
        if (!window.confirm(`Удалить файл «${file.file_name}»?`)) return;
        remove.disabled = true;

        try {
          await portalApi({
            action: "delete_file",
            project_slug: project.slug,
            file_id: file.id
          });
          await loadWorkspace(project.slug, true);
        } catch (error) {
          const status = workspace.querySelector(
            `[data-file-status="${project.slug}"]`
          );
          setStatus(status, `Ошибка: ${error.message}`, "error");
        } finally {
          remove.disabled = false;
        }
      });
      actions.appendChild(remove);
    }

    row.append(info, actions);
    root.appendChild(row);
  }
}

function renderApprovals(project, workspace) {
  const root = workspace.querySelector(
    `[data-approvals="${project.slug}"]`
  );
  root.replaceChildren();

  const approvals = workspace._data?.approvals || [];

  const pendingCount = approvals.filter(item => item.status === "pending").length;
  const badge = projectCards
    .get(project.slug)
    ?.card.querySelector(`[data-approval-badge="${project.slug}"]`);

  if (badge) {
    badge.textContent = String(pendingCount);
    badge.classList.toggle("is-hidden", pendingCount === 0);
  }

  if (!approvals.length) {
    root.appendChild(makeEmpty("Согласований пока нет."));
    return;
  }

  for (const approval of approvals) {
    const card = document.createElement("article");
    card.className = `client-approval is-${approval.status}`;

    const head = document.createElement("div");
    head.className = "client-approval-head";

    const titleWrap = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = approval.title;
    const date = document.createElement("span");
    date.textContent = formatDate(approval.created_at);
    titleWrap.append(title, date);

    const status = document.createElement("span");
    status.className = "client-approval-status";
    status.textContent = APPROVAL_LABELS[approval.status] || approval.status;

    head.append(titleWrap, status);
    card.appendChild(head);

    if (approval.description) {
      const description = document.createElement("p");
      description.className = "client-approval-description";
      description.textContent = approval.description;
      card.appendChild(description);
    }

    if (approval.status === "pending") {
      const form = document.createElement("div");
      form.className = "client-approval-response";

      const note = document.createElement("textarea");
      note.rows = 3;
      note.maxLength = 5000;
      note.placeholder =
        "Комментарий необязателен при принятии, но пригодится, если нужны правки.";

      const actions = document.createElement("div");
      actions.className = "client-approval-actions";

      const approve = document.createElement("button");
      approve.type = "button";
      approve.className = "btn primary";
      approve.textContent = "Принять";

      const changes = document.createElement("button");
      changes.type = "button";
      changes.className = "client-ghost";
      changes.textContent = "Нужны правки";

      async function respond(nextStatus) {
        approve.disabled = true;
        changes.disabled = true;

        try {
          await portalApi({
            action: "respond_approval",
            project_slug: project.slug,
            approval_id: approval.id,
            status: nextStatus,
            note: note.value.trim()
          });
          await loadWorkspace(project.slug, true);
        } catch (error) {
          window.alert(`Не удалось сохранить решение: ${error.message}`);
        } finally {
          approve.disabled = false;
          changes.disabled = false;
        }
      }

      approve.addEventListener("click", () => respond("approved"));
      changes.addEventListener("click", () => respond("changes_requested"));

      actions.append(approve, changes);
      form.append(note, actions);
      card.appendChild(form);
    } else if (approval.response_note) {
      const response = document.createElement("div");
      response.className = "client-approval-note";
      const label = document.createElement("strong");
      label.textContent = "Ваш комментарий";
      const text = document.createElement("p");
      text.textContent = approval.response_note;
      response.append(label, text);
      card.appendChild(response);
    }

    root.appendChild(card);
  }
}

async function loadWorkspace(slug, force = false) {
  const state = projectCards.get(slug);
  if (!state || state.loading) return;
  if (state.loaded && !force) return;

  state.loading = true;

  try {
    const data = await portalApi({
      action: "workspace",
      project_slug: slug
    });

    state.workspace._data = data.workspace || {};
    renderMessages(state.project, state.workspace);
    renderFiles(state.project, state.workspace);
    renderApprovals(state.project, state.workspace);
    state.loaded = true;
  } catch (error) {
    const messageRoot = state.workspace.querySelector(
      `[data-messages="${slug}"]`
    );
    if (messageRoot) {
      messageRoot.replaceChildren(
        makeEmpty(`Не удалось загрузить рабочие данные: ${error.message}`)
      );
    }
  } finally {
    state.loading = false;
  }
}

function renderProjects(projects) {
  dashboardProjects = projects;
  projectsRoot.replaceChildren();
  projectCards.clear();

  if (!projects.length) {
    projectsRoot.appendChild(
      makeEmpty("Пока вам не назначено ни одного проекта.")
    );
    return;
  }

  for (const project of projects) {
    const card = document.createElement("details");
    card.className = "client-project";

    const summary = document.createElement("summary");
    const summaryInner = document.createElement("div");
    summaryInner.className = "client-project-summary";

    const main = document.createElement("div");
    const meta = document.createElement("div");
    meta.className = "client-project-meta";

    if (project.type) {
      const type = document.createElement("span");
      type.className = "client-status-badge";
      type.textContent = project.type;
      meta.appendChild(type);
    }

    if (project.status) {
      const status = document.createElement("span");
      status.className = "client-status-badge";
      status.textContent = STATUS_LABELS[project.status] || project.status;
      meta.appendChild(status);
    }

    if (project.pending_approvals > 0) {
      const pending = document.createElement("span");
      pending.className = "client-status-badge is-attention";
      pending.textContent =
        `Нужно согласование: ${project.pending_approvals}`;
      meta.appendChild(pending);
    }

    const title = document.createElement("h3");
    title.textContent = project.title || "Проект";

    const lead = document.createElement("p");
    lead.textContent = project.short_description || "";

    main.append(meta, title, lead);

    const chevron = document.createElement("span");
    chevron.className = "client-chevron";
    chevron.textContent = "+";
    chevron.setAttribute("aria-hidden", "true");

    summaryInner.append(main, chevron);
    summary.appendChild(summaryInner);

    const body = document.createElement("div");
    body.className = "client-project-body";

    const workspace = createProjectWorkspace(project);
    body.appendChild(workspace);

    card.append(summary, body);
    projectsRoot.appendChild(card);

    projectCards.set(project.slug, {
      card,
      project,
      workspace,
      loaded: false,
      loading: false
    });

    card.addEventListener("toggle", () => {
      if (card.open) {
        const active = card.querySelector("[data-project-tab].is-active");
        if (active?.dataset.projectTab !== "overview") {
          loadWorkspace(project.slug);
        }
      }
    });
  }
}

async function loadDashboard() {
  setStatus(dashboardStatus, "Загружаю кабинет…");

  const data = await portalApi({ action: "dashboard" });

  loginView.classList.add("is-hidden");
  dashboardView.classList.remove("is-hidden");

  const name = data.client?.display_name?.trim();
  document.querySelector("#client-heading").textContent =
    name ? `${name}, ваши проекты` : "Ваши проекты";
  document.querySelector("#client-user").textContent =
    data.client?.email || sessionStorage.getItem(EMAIL_KEY) || "";

  const mustChange = data.client?.must_change_password === true;
  passwordPanel.classList.toggle("is-hidden", !mustChange);
  projectsSection.classList.toggle("is-hidden", mustChange);

  if (!mustChange) {
    renderProjects(Array.isArray(data.projects) ? data.projects : []);
  }

  setStatus(dashboardStatus, "");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.querySelector("#client-email").value.trim();
  const password = document.querySelector("#client-password").value;
  const button = loginForm.querySelector('button[type="submit"]');

  button.disabled = true;
  setStatus(loginStatus, "Проверяю доступ…");

  try {
    const data = await authRequest("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    saveSession(data);
    await loadDashboard();
  } catch {
    clearSession();
    setStatus(
      loginStatus,
      "Не удалось войти. Проверь email и пароль или уточни доступ у студии.",
      "error"
    );
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#client-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = document.querySelector("#client-new-password").value;
  const repeat = document.querySelector("#client-new-password-repeat").value;
  const status = document.querySelector("#client-password-status");
  const button = event.currentTarget.querySelector('button[type="submit"]');

  if (password !== repeat) {
    setStatus(status, "Пароли не совпадают.", "error");
    return;
  }

  if (
    password.length < 10 ||
    !/[a-zA-Z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    setStatus(status, "Нужны минимум 10 символов, буква и цифра.", "error");
    return;
  }

  button.disabled = true;
  setStatus(status, "Меняю пароль…");

  try {
    await portalApi({ action: "change_password", password });
    event.currentTarget.reset();
    setStatus(status, "Пароль изменён.", "success");
    await loadDashboard();
  } catch (error) {
    setStatus(status, `Ошибка: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#client-refresh").addEventListener("click", async () => {
  try {
    await loadDashboard();
  } catch (error) {
    setStatus(dashboardStatus, `Ошибка: ${error.message}`, "error");
  }
});

document.querySelector("#client-logout").addEventListener("click", async () => {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token()}`
      }
    });
  } catch {}

  clearSession();
  dashboardView.classList.add("is-hidden");
  loginView.classList.remove("is-hidden");
  loginForm.reset();
  projectCards.clear();
  setStatus(loginStatus, "Вы вышли из кабинета.", "success");
});

window.setInterval(() => {
  if (!token() || dashboardView.classList.contains("is-hidden")) return;

  for (const [slug, state] of projectCards) {
    if (state.card.open && state.loaded) {
      loadWorkspace(slug, true);
    }
  }
}, 30000);

(async () => {
  if (!token()) return;

  try {
    await loadDashboard();
  } catch {
    clearSession();
  }
})();
