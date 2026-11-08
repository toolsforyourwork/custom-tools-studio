const SUPABASE_URL = "https://bpdqosfgxqawbzljafgb.supabase.co";
const SUPABASE_KEY = "sb_publishable_FQaK_TPRAjA1NMcVG9zqzw_VFvqaRXk";

const STATUS_LABELS = {
  concept: "Концепт",
  in_progress: "В работе",
  paused: "Пауза",
  completed: "Готов"
};

const loginView = document.querySelector("#login-view");
const dashboardView = document.querySelector("#dashboard-view");
const loginForm = document.querySelector("#login-form");
const loginStatus = document.querySelector("#login-status");
const dashboardStatus = document.querySelector("#dashboard-status");
const editorStatus = document.querySelector("#editor-status");
const adminUser = document.querySelector("#admin-user");
const projectsCount = document.querySelector("#projects-count");
const publishedCount = document.querySelector("#published-count");
const draftCount = document.querySelector("#draft-count");
const projectsList = document.querySelector("#projects-list");
const logoutButton = document.querySelector("#logout-button");
const refreshButton = document.querySelector("#refresh-button");
const newProjectButton = document.querySelector("#new-project-button");
const editorPanel = document.querySelector("#editor-panel");
const editorEyebrow = document.querySelector("#editor-eyebrow");
const editorTitle = document.querySelector("#editor-title");
const projectForm = document.querySelector("#project-form");
const cancelEdit = document.querySelector("#cancel-edit");
const cancelEditBottom = document.querySelector("#cancel-edit-bottom");

const TOKEN_KEY = "custom_tools_admin_access_token";
const REFRESH_KEY = "custom_tools_admin_refresh_token";
const EMAIL_KEY = "custom_tools_admin_email";
const USER_KEY = "custom_tools_admin_user_id";

let projects = [];
let clients = [];
let analyticsDays = 7;
let slugWasEdited = false;
let pendingCoverFile = null;
let currentCoverUrl = null;
let currentCoverStoragePath = null;
let originalCoverUrl = null;
let originalCoverStoragePath = null;
let coverRemoved = false;
let localCoverPreviewUrl = null;
let currentProjectMedia = [];
let currentCollabProjectId = null;
let currentProjectWorkspace = {
  messages: [],
  files: [],
  approvals: []
};

function formatWorkspaceDate(value) {
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

function formatWorkspaceBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function setStatus(el, message, type = "") {
  el.textContent = message;
  el.dataset.type = type;
}

function saveSession(data) {
  sessionStorage.setItem(TOKEN_KEY, data.access_token || "");
  sessionStorage.setItem(REFRESH_KEY, data.refresh_token || "");
  sessionStorage.setItem(EMAIL_KEY, data.user?.email || sessionStorage.getItem(EMAIL_KEY) || "");
  sessionStorage.setItem(USER_KEY, data.user?.id || sessionStorage.getItem(USER_KEY) || "");
}

function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(EMAIL_KEY);
  sessionStorage.removeItem(USER_KEY);
}

function currentToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

async function refreshSession() {
  const refreshToken = sessionStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return false;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ refresh_token: refreshToken })
  });

  if (!response.ok) return false;
  const data = await response.json();
  saveSession(data);
  return true;
}

async function api(path, options = {}, retry = true) {
  const token = currentToken();
  const headers = {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers
  });

  if (response.status === 401 && retry && await refreshSession()) {
    return api(path, options, false);
  }

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      data?.msg ||
      data?.message ||
      data?.error_description ||
      data?.error ||
      `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function storageMaintenanceApi(body, retry = true) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/storage-maintenance`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${currentToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (response.status === 401 && retry && await refreshSession()) {
    return storageMaintenanceApi(body, false);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || data?.errors?.join("; ") || `HTTP ${response.status}`);
  }

  return data;
}

async function clientAdminApi(body, retry = true) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/client-admin`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${currentToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (response.status === 401 && retry && await refreshSession()) {
    return clientAdminApi(body, false);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return data;
}

async function verifyAdmin() {
  const userId = sessionStorage.getItem(USER_KEY);
  if (!currentToken() || !userId) return false;

  const rows = await api(
    `/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(userId)}`,
    { method: "GET" }
  );

  return Array.isArray(rows) && rows.length === 1;
}

function revokeLocalCoverPreview() {
  if (localCoverPreviewUrl) {
    URL.revokeObjectURL(localCoverPreviewUrl);
    localCoverPreviewUrl = null;
  }
}

function setCoverPreview(url = null) {
  const preview = document.querySelector("#cover-preview");
  const image = document.querySelector("#cover-preview-image");
  const empty = document.querySelector("#cover-preview-empty");
  const removeButton = document.querySelector("#remove-cover");

  if (url) {
    preview.classList.remove("is-empty");
    image.src = url;
    image.hidden = false;
    empty.hidden = true;
    removeButton.classList.remove("is-hidden");
  } else {
    preview.classList.add("is-empty");
    image.removeAttribute("src");
    image.hidden = true;
    empty.hidden = false;
    removeButton.classList.add("is-hidden");
  }
}

function getFileExtension(file) {
  const byMime = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif"
  };
  return byMime[file.type] || "img";
}

async function uploadCover(file, slug) {
  if (!file) return null;

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  if (!allowed.includes(file.type)) {
    throw new Error("Формат обложки не поддерживается.");
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Обложка должна весить не больше 10 МБ.");
  }

  const safeSlug = slugify(slug || "project") || "project";
  const ext = getFileExtension(file);
  const objectPath = `covers/${safeSlug}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");

  async function doUpload(retry = true) {
    const token = currentToken();
    const response = await fetch(
      `${SUPABASE_URL}/storage/v1/object/project-covers/${encodedPath}`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": file.type,
          "x-upsert": "false"
        },
        body: file
      }
    );

    if (response.status === 401 && retry && await refreshSession()) {
      return doUpload(false);
    }

    if (!response.ok) {
      let message = `Storage error ${response.status}`;
      try {
        const data = await response.json();
        message = data?.message || data?.error || message;
      } catch {}
      throw new Error(message);
    }
  }

  await doUpload();

  return {
    url: `${SUPABASE_URL}/storage/v1/object/public/project-covers/${encodedPath}`,
    path: objectPath
  };
}

function mediaFileKind(file) {
  return file.type.startsWith("video/") ? "video" : "image";
}

function mediaExtension(file) {
  const byMime = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/webm": "webm"
  };
  return byMime[file.type] || "bin";
}

function mediaObjectPathFromUrl(url) {
  const marker = "/storage/v1/object/public/project-media/";
  const index = String(url || "").indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(String(url).slice(index + marker.length));
}

async function uploadProjectMediaFile(file, projectId, slug, sortOrder) {
  const allowed = [
    "image/jpeg","image/png","image/webp","image/avif",
    "video/mp4","video/webm"
  ];

  if (!allowed.includes(file.type)) {
    throw new Error(`Формат файла «${file.name}» не поддерживается.`);
  }

  const maxSize = file.type.startsWith("video/")
    ? 50 * 1024 * 1024
    : 100 * 1024 * 1024;

  if (file.size > maxSize) {
    throw new Error(
      file.type.startsWith("video/")
        ? `Видео «${file.name}» больше 50 МБ.`
        : `Изображение «${file.name}» больше 100 МБ.`
    );
  }

  const kind = mediaFileKind(file);
  const ext = mediaExtension(file);
  const safeSlug = slugify(slug || "project") || "project";
  const objectPath =
    `media/${safeSlug}/${Date.now()}-${crypto.randomUUID().slice(0,8)}.${ext}`;
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");

  async function doUpload(retry = true) {
    const response = await fetch(
      `${SUPABASE_URL}/storage/v1/object/project-media/${encodedPath}`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${currentToken()}`,
          "Content-Type": file.type,
          "x-upsert": "false"
        },
        body: file
      }
    );

    if (response.status === 401 && retry && await refreshSession()) {
      return doUpload(false);
    }

    if (!response.ok) {
      let message = `Storage error ${response.status}`;
      try {
        const data = await response.json();
        message = data?.message || data?.error || message;
      } catch {}
      throw new Error(message);
    }
  }

  await doUpload();

  const url =
    `${SUPABASE_URL}/storage/v1/object/public/project-media/${encodedPath}`;

  try {
    await api("/rest/v1/project_media", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        project_id: projectId,
        kind,
        url,
        storage_path: objectPath,
        caption: null,
        sort_order: sortOrder
      })
    });
  } catch (error) {
    try {
      await storageMaintenanceApi({
        action: "delete_objects",
        objects: [{ bucket: "project-media", path: objectPath }]
      });
    } catch {}
    throw error;
  }
}

async function uploadSignedWorkspaceFile(prepared, file) {
  const formData = new FormData();
  formData.append("cacheControl", "0");
  formData.append("", file);

  const response = await fetch(prepared.upload.signed_url, {
    method: "PUT",
    headers: { "x-upsert": "false" },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Storage HTTP ${response.status}`);
  }
}

function renderProjectMessages() {
  const root = document.querySelector("#admin-project-messages");
  root.replaceChildren();

  const messages = currentProjectWorkspace.messages || [];

  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "collab-empty";
    empty.textContent = "Сообщений пока нет.";
    root.appendChild(empty);
    return;
  }

  for (const message of messages) {
    const item = document.createElement("article");
    item.className =
      "collab-message " +
      (message.author_role === "admin" ? "is-admin" : "is-client");

    const head = document.createElement("div");
    head.className = "collab-message__head";

    const author = document.createElement("strong");
    author.textContent = message.author_role === "admin" ? "Вы" : "Клиент";

    const date = document.createElement("span");
    date.textContent = formatWorkspaceDate(message.created_at);

    const text = document.createElement("p");
    text.textContent = message.body;

    head.append(author, date);
    item.append(head, text);
    root.appendChild(item);
  }

  root.scrollTop = root.scrollHeight;
}

function renderProjectFiles() {
  const root = document.querySelector("#admin-project-files");
  root.replaceChildren();

  const files = currentProjectWorkspace.files || [];

  if (!files.length) {
    const empty = document.createElement("div");
    empty.className = "collab-empty";
    empty.textContent = "Приватных файлов пока нет.";
    root.appendChild(empty);
    return;
  }

  for (const file of files) {
    const row = document.createElement("article");
    row.className = "collab-file-row";

    const info = document.createElement("div");
    info.className = "collab-file-info";

    const name = document.createElement("strong");
    name.textContent = file.file_name;

    const meta = document.createElement("span");
    meta.textContent =
      `${file.uploaded_by_role === "admin" ? "От студии" : "От клиента"} · ` +
      `${formatWorkspaceBytes(file.size_bytes)} · ${formatWorkspaceDate(file.created_at)}`;

    info.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "admin-row-actions";

    if (file.download_url) {
      const download = document.createElement("a");
      download.className = "admin-mini";
      download.href = file.download_url;
      download.target = "_blank";
      download.rel = "noopener";
      download.textContent = "Скачать";
      actions.appendChild(download);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "admin-mini is-danger";
    remove.textContent = "Удалить";
    remove.addEventListener("click", async () => {
      if (!window.confirm(`Удалить файл «${file.file_name}»?`)) return;

      remove.disabled = true;
      try {
        await clientAdminApi({
          action: "delete_project_file",
          project_id: currentCollabProjectId,
          file_id: file.id
        });
        await loadProjectCollaboration(currentCollabProjectId);
      } catch (error) {
        setStatus(
          document.querySelector("#admin-client-files-status"),
          `Ошибка: ${error.message}`,
          "error"
        );
      } finally {
        remove.disabled = false;
      }
    });

    actions.appendChild(remove);
    row.append(info, actions);
    root.appendChild(row);
  }
}

function renderProjectApprovals() {
  const root = document.querySelector("#admin-project-approvals");
  root.replaceChildren();

  const approvals = currentProjectWorkspace.approvals || [];

  if (!approvals.length) {
    const empty = document.createElement("div");
    empty.className = "collab-empty";
    empty.textContent = "Согласований пока нет.";
    root.appendChild(empty);
    return;
  }

  const labels = {
    pending: "Ждёт клиента",
    approved: "Принято",
    changes_requested: "Нужны правки",
    cancelled: "Отменено"
  };

  for (const approval of approvals) {
    const card = document.createElement("article");
    card.className = `collab-approval is-${approval.status}`;

    const head = document.createElement("div");
    head.className = "collab-approval__head";

    const titleWrap = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = approval.title;
    const date = document.createElement("span");
    date.textContent = formatWorkspaceDate(approval.created_at);
    titleWrap.append(title, date);

    const status = document.createElement("span");
    status.className = "project-badge";
    status.textContent = labels[approval.status] || approval.status;

    head.append(titleWrap, status);
    card.appendChild(head);

    if (approval.description) {
      const description = document.createElement("p");
      description.textContent = approval.description;
      card.appendChild(description);
    }

    if (approval.response_note) {
      const response = document.createElement("div");
      response.className = "collab-approval__response";
      const label = document.createElement("strong");
      label.textContent = "Комментарий клиента";
      const text = document.createElement("p");
      text.textContent = approval.response_note;
      response.append(label, text);
      card.appendChild(response);
    }

    if (approval.status === "pending") {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "admin-mini is-danger";
      cancel.textContent = "Отменить запрос";
      cancel.addEventListener("click", async () => {
        cancel.disabled = true;
        try {
          await clientAdminApi({
            action: "cancel_approval",
            project_id: currentCollabProjectId,
            approval_id: approval.id
          });
          await loadProjectCollaboration(currentCollabProjectId);
        } catch (error) {
          setStatus(
            document.querySelector("#admin-approval-status"),
            `Ошибка: ${error.message}`,
            "error"
          );
        } finally {
          cancel.disabled = false;
        }
      });
      card.appendChild(cancel);
    }

    root.appendChild(card);
  }
}

async function loadProjectCollaboration(projectId) {
  const panel = document.querySelector("#project-collab-panel");

  if (!projectId) {
    currentCollabProjectId = null;
    currentProjectWorkspace = { messages: [], files: [], approvals: [] };
    panel.classList.add("is-hidden");
    return;
  }

  currentCollabProjectId = projectId;
  panel.classList.remove("is-hidden");

  setStatus(document.querySelector("#admin-message-status"), "Загружаю…");

  try {
    const data = await clientAdminApi({
      action: "project_workspace",
      project_id: projectId
    });

    currentProjectWorkspace = data.workspace || {
      messages: [],
      files: [],
      approvals: []
    };

    renderProjectMessages();
    renderProjectFiles();
    renderProjectApprovals();

    setStatus(document.querySelector("#admin-message-status"), "");
  } catch (error) {
    setStatus(
      document.querySelector("#admin-message-status"),
      `Ошибка: ${error.message}`,
      "error"
    );
  }
}

async function loadProjectMedia(projectId) {
  const list = document.querySelector("#media-admin-list");
  const status = document.querySelector("#media-status");

  if (!projectId) {
    currentProjectMedia = [];
    list.innerHTML = '<div class="media-admin-empty">Сохрани проект, чтобы добавить медиагалерею.</div>';
    document.querySelector("#project-media-files").disabled = true;
    document.querySelector("#upload-media-button").disabled = true;
    setStatus(status, "");
    return;
  }

  document.querySelector("#project-media-files").disabled = false;
  document.querySelector("#upload-media-button").disabled = false;
  setStatus(status, "Загружаю медиагалерею…");

  try {
    currentProjectMedia = await api(
      `/rest/v1/project_media?select=id,project_id,kind,url,storage_path,caption,sort_order,created_at&project_id=eq.${encodeURIComponent(projectId)}&order=sort_order.asc,created_at.asc`,
      { method: "GET" }
    );
    renderProjectMedia();
    setStatus(status, currentProjectMedia.length ? "" : "Медиа пока нет.");
  } catch (error) {
    setStatus(status, `Ошибка: ${error.message}`, "error");
  }
}

function renderProjectMedia() {
  const list = document.querySelector("#media-admin-list");
  list.innerHTML = "";

  if (!currentProjectMedia.length) {
    list.innerHTML = '<div class="media-admin-empty">Медиа пока нет.</div>';
    return;
  }

  for (const item of currentProjectMedia) {
    const card = document.createElement("article");
    card.className = "media-admin-card";

    const preview = document.createElement("div");
    preview.className = "media-admin-preview";

    if (item.kind === "video") {
      const video = document.createElement("video");
      video.src = item.url;
      video.controls = true;
      video.preload = "metadata";
      preview.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = item.caption || "Медиа проекта";
      preview.appendChild(img);
    }

    const controls = document.createElement("div");
    controls.className = "media-admin-controls";

    const caption = document.createElement("input");
    caption.type = "text";
    caption.maxLength = 300;
    caption.placeholder = "Подпись (необязательно)";
    caption.value = item.caption || "";

    const order = document.createElement("input");
    order.type = "number";
    order.step = "1";
    order.value = item.sort_order ?? 0;
    order.title = "Порядок";

    const save = document.createElement("button");
    save.type = "button";
    save.className = "admin-mini";
    save.textContent = "Сохранить";
    save.addEventListener("click", async () => {
      const status = document.querySelector("#media-status");
      setStatus(status, "Сохраняю медиа…");
      try {
        await api(
          `/rest/v1/project_media?id=eq.${encodeURIComponent(item.id)}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({
              caption: caption.value.trim() || null,
              sort_order: Number(order.value || 0)
            })
          }
        );
        await loadProjectMedia(item.project_id);
        setStatus(status, "Медиа обновлено.", "success");
      } catch (error) {
        setStatus(status, `Ошибка: ${error.message}`, "error");
      }
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "admin-mini is-danger";
    remove.textContent = "Удалить";
    remove.addEventListener("click", async () => {
      if (!window.confirm("Удалить этот медиафайл из кейса?")) return;
      const status = document.querySelector("#media-status");
      setStatus(status, "Удаляю медиа…");

      try {
        await api(
          `/rest/v1/project_media?id=eq.${encodeURIComponent(item.id)}`,
          { method: "DELETE", headers: { Prefer: "return=minimal" } }
        );

        const objectPath = item.storage_path || mediaObjectPathFromUrl(item.url);
        let cleanupWarning = false;

        if (objectPath) {
          try {
            await storageMaintenanceApi({
              action: "delete_objects",
              objects: [{ bucket: "project-media", path: objectPath }]
            });
          } catch (cleanupError) {
            console.error("Media storage cleanup failed", cleanupError);
            cleanupWarning = true;
          }
        }

        await loadProjectMedia(item.project_id);
        setStatus(
          status,
          cleanupWarning
            ? "Медиа удалено из кейса. Файл дочистится ночной уборкой."
            : "Медиа и файл удалены.",
          cleanupWarning ? "" : "success"
        );
      } catch (error) {
        setStatus(status, `Ошибка: ${error.message}`, "error");
      }
    });

    controls.append(caption, order, save, remove);
    card.append(preview, controls);
    list.appendChild(card);
  }
}

function slugify(value) {
  const map = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",
    к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",
    х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya"
  };

  return value
    .toLowerCase()
    .split("")
    .map(char => map[char] ?? char)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function resetEditor() {
  projectForm.reset();
  document.querySelector("#project-id").value = "";
  document.querySelector("#project-status").value = "in_progress";
  document.querySelector("#project-sort-order").value = "0";
  editorEyebrow.textContent = "Новый проект";
  editorTitle.textContent = "Добавить проект";
  slugWasEdited = false;
  pendingCoverFile = null;
  currentCoverUrl = null;
  currentCoverStoragePath = null;
  originalCoverUrl = null;
  originalCoverStoragePath = null;
  coverRemoved = false;
  revokeLocalCoverPreview();
  setCoverPreview(null);
  currentProjectMedia = [];
  document.querySelector("#project-media-files").value = "";
  loadProjectMedia(null);
  loadProjectCollaboration(null);
  setStatus(editorStatus, "");
}

function openNewProject() {
  resetEditor();
  editorPanel.classList.remove("is-hidden");
  editorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openEditProject(project) {
  resetEditor();
  document.querySelector("#project-id").value = project.id;
  document.querySelector("#project-title").value = project.title || "";
  document.querySelector("#project-slug").value = project.slug || "";
  document.querySelector("#project-type").value = project.type || "";
  document.querySelector("#project-status").value = project.status || "in_progress";
  document.querySelector("#project-sort-order").value = project.sort_order ?? 0;
  document.querySelector("#project-short-description").value = project.short_description || "";
  document.querySelector("#project-description").value = project.description || "";
  document.querySelector("#project-task").value = project.task || "";
  document.querySelector("#project-solution").value = project.solution || "";
  document.querySelector("#project-result").value = project.result || "";
  document.querySelector("#project-published").checked = Boolean(project.published);
  currentCoverUrl = project.cover_url || null;
  currentCoverStoragePath = project.cover_storage_path || null;
  originalCoverUrl = currentCoverUrl;
  originalCoverStoragePath = currentCoverStoragePath;
  coverRemoved = false;
  pendingCoverFile = null;
  setCoverPreview(currentCoverUrl);
  loadProjectMedia(project.id);
  loadProjectCollaboration(project.id);

  editorEyebrow.textContent = "Редактирование";
  editorTitle.textContent = project.title || "Проект";
  slugWasEdited = true;
  editorPanel.classList.remove("is-hidden");
  editorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeEditor() {
  editorPanel.classList.add("is-hidden");
  resetEditor();
}

function createProjectRow(project) {
  const row = document.createElement("article");
  row.className = "admin-project-row";

  const main = document.createElement("div");
  main.className = "admin-project-main";

  const title = document.createElement("strong");
  title.textContent = project.title || "Без названия";

  const meta = document.createElement("div");
  meta.className = "admin-project-meta";

  const type = document.createElement("span");
  type.textContent = project.type || "Без типа";

  const status = document.createElement("span");
  status.textContent = STATUS_LABELS[project.status] || project.status || "Без статуса";

  const slug = document.createElement("span");
  slug.textContent = `/${project.slug}`;

  meta.append(type, status, slug);
  main.append(title, meta);

  const side = document.createElement("div");
  side.className = "admin-project-side";

  const published = document.createElement("span");
  published.className = project.published
    ? "project-badge is-published"
    : "project-badge";
  published.textContent = project.published ? "Опубликован" : "Черновик";

  const actions = document.createElement("div");
  actions.className = "admin-row-actions";

  const toggle = document.createElement("button");
  toggle.className = "admin-mini";
  toggle.type = "button";
  toggle.textContent = project.published ? "Снять" : "Опубликовать";
  toggle.addEventListener("click", () => togglePublished(project));

  const edit = document.createElement("button");
  edit.className = "admin-mini";
  edit.type = "button";
  edit.textContent = "Изменить";
  edit.addEventListener("click", () => openEditProject(project));

  const remove = document.createElement("button");
  remove.className = "admin-mini is-danger";
  remove.type = "button";
  remove.textContent = "Удалить";
  remove.addEventListener("click", () => deleteProject(project));

  actions.append(toggle, edit, remove);
  side.append(published, actions);
  row.append(main, side);

  return row;
}


function setHealthCard(id, check, okText) {
  const card = document.querySelector(id);
  if (!card) return;

  card.classList.remove("is-loading", "is-ok", "is-error");
  card.classList.add(check?.ok ? "is-ok" : "is-error");

  const value = card.querySelector(".health-card__value");
  if (!value) return;

  value.textContent = check?.ok
    ? `${okText} · ${check.ms ?? "—"} мс`
    : `Ошибка · ${check?.error || "нет ответа"}`;
}

async function loadHealth() {
  const status = document.querySelector("#health-status");
  const button = document.querySelector("#health-refresh-button");
  const overallDot = document.querySelector("#health-overall-dot");
  const overallText = document.querySelector("#health-overall-text");
  const checkedAt = document.querySelector("#health-checked-at");

  if (button) button.disabled = true;
  if (overallDot) {
    overallDot.classList.remove("is-ok", "is-error");
    overallDot.classList.add("is-loading");
  }
  if (overallText) overallText.textContent = "Проверяем…";
  setStatus(status, "Проверяем сайт, базу, контент API, клиентский кабинет, форму и Telegram…");

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/health-check?t=${Date.now()}`,
      {
        headers: { apikey: SUPABASE_KEY },
        cache: "no-store"
      }
    );

    const data = await response.json().catch(() => null);
    if (!data?.checks) throw new Error("Некорректный ответ health-check");

    setHealthCard(
      "#health-site",
      data.checks.site,
      data.checks.site?.status ? `HTTP ${data.checks.site.status}` : "Работает"
    );
    setHealthCard("#health-database", data.checks.database, "Доступна");
    setHealthCard("#health-content", data.checks.content, "Работает");
    setHealthCard("#health-client-portal", data.checks.client_portal, "Работает · доступ закрыт");
    setHealthCard(
      "#health-form",
      data.checks.form,
      data.checks.form?.status ? "Endpoint доступен" : "Работает"
    );

    const telegramText = data.checks.telegram?.pending_updates
      ? `Работает · очередь ${data.checks.telegram.pending_updates}`
      : "Webhook работает";
    setHealthCard("#health-telegram", data.checks.telegram, telegramText);

    if (overallDot) {
      overallDot.classList.remove("is-loading", "is-ok", "is-error");
      overallDot.classList.add(data.ok ? "is-ok" : "is-error");
    }
    if (overallText) {
      overallText.textContent = data.ok
        ? "Все системы работают"
        : "Есть проблема";
    }

    if (checkedAt && data.checked_at) {
      const date = new Date(data.checked_at);
      checkedAt.textContent = `Последняя проверка: ${date.toLocaleString("ru-RU")}`;
    }

    setStatus(
      status,
      data.ok
        ? "Внешний мониторинг также проверяет систему каждые 15 минут."
        : "Один из сервисов не прошёл проверку. GitHub-мониторинг зафиксирует сбой.",
      data.ok ? "success" : "error"
    );
  } catch (error) {
    for (const id of ["#health-site","#health-database","#health-content","#health-client-portal","#health-form","#health-telegram"]) {
      const card = document.querySelector(id);
      card?.classList.remove("is-loading", "is-ok");
      card?.classList.add("is-error");
    }

    if (overallDot) {
      overallDot.classList.remove("is-loading", "is-ok");
      overallDot.classList.add("is-error");
    }
    if (overallText) overallText.textContent = "Health-check недоступен";
    setStatus(status, `Ошибка мониторинга: ${error.message}`, "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function backupApi(body, retry = true) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/backup-data`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${currentToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (response.status === 401 && retry && await refreshSession()) {
    return backupApi(body, false);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return data;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "—";
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

function renderBackups(backups) {
  const list = document.querySelector("#backup-list");
  list.innerHTML = "";

  if (!backups?.length) {
    const empty = document.createElement("div");
    empty.className = "backup-empty";
    empty.textContent = "Резервных копий пока нет.";
    list.appendChild(empty);
    return;
  }

  for (const backup of backups) {
    const row = document.createElement("article");
    row.className = "backup-row";

    const main = document.createElement("div");
    main.className = "backup-row__main";

    const title = document.createElement("strong");
    title.textContent = new Date(backup.created_at || backup.updated_at).toLocaleString("ru-RU");

    const meta = document.createElement("span");
    meta.textContent = `${formatBytes(backup.size_bytes)} · JSON`;

    main.append(title, meta);

    const download = document.createElement("button");
    download.type = "button";
    download.className = "admin-mini";
    download.textContent = "Скачать";
    download.addEventListener("click", async () => {
      const status = document.querySelector("#backup-status");
      download.disabled = true;
      setStatus(status, "Готовлю защищённую ссылку…");

      try {
        const data = await backupApi({
          action: "download",
          name: backup.name
        });

        window.location.href = data.signed_url;
        setStatus(status, "Ссылка создана. Скачивание началось.", "success");
      } catch (error) {
        setStatus(status, `Ошибка скачивания: ${error.message}`, "error");
      } finally {
        download.disabled = false;
      }
    });

    row.append(main, download);
    list.appendChild(row);
  }
}

async function loadBackups() {
  const status = document.querySelector("#backup-status");
  setStatus(status, "Загружаю список резервных копий…");

  try {
    const data = await backupApi({ action: "list" });
    renderBackups(data.backups || []);
    setStatus(
      status,
      data.backups?.length
        ? `Копий: ${data.backups.length}`
        : "Резервных копий пока нет.",
      data.backups?.length ? "success" : ""
    );
  } catch (error) {
    setStatus(status, `Ошибка backup: ${error.message}`, "error");
  }
}

async function createBackupNow() {
  const status = document.querySelector("#backup-status");
  const button = document.querySelector("#backup-create-button");

  button.disabled = true;
  setStatus(status, "Создаю резервную копию…");

  try {
    const data = await backupApi({ action: "create", source: "admin" });
    const size = formatBytes(data.backup?.size_bytes);
    setStatus(status, `Backup создан · ${size}`, "success");
    await loadBackups();
  } catch (error) {
    setStatus(status, `Ошибка backup: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
}

function friendlyPage(path) {
  const map = {
    "/custom-tools-studio/": "Главная",
    "/custom-tools-studio/index.html": "Главная",
    "/custom-tools-studio/approach.html": "Как работаем",
    "/custom-tools-studio/projects.html": "Проекты",
    "/custom-tools-studio/project.html": "Кейс проекта",
    "/custom-tools-studio/identity.html": "Айдентика",
    "/custom-tools-studio/contacts.html": "Наши ресурсы",
    "/custom-tools-studio/request.html": "Заявка"
  };
  return map[path] || path.replace("/custom-tools-studio/", "/");
}

function sourceLabel(event) {
  if (event.utm_source) {
    const medium = event.utm_medium ? ` / ${event.utm_medium}` : "";
    return `${event.utm_source}${medium}`;
  }

  if (event.referrer) {
    try {
      const host = new URL(event.referrer).hostname.replace(/^www\./, "");
      if (host && host !== "toolsforyourwork.github.io") return host;
    } catch {}
  }

  return "Прямой / неизвестно";
}

function rankedCounts(values) {
  const counts = new Map();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
}

function renderAnalyticsList(containerId, entries, emptyText) {
  const container = document.querySelector(containerId);
  container.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "analytics-empty";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  for (const [label, count] of entries) {
    const row = document.createElement("div");
    row.className = "analytics-list-row";

    const name = document.createElement("span");
    name.textContent = label;

    const value = document.createElement("strong");
    value.textContent = count;

    row.append(name, value);
    container.appendChild(row);
  }
}

async function loadAnalytics(days = analyticsDays) {
  analyticsDays = days;
  const status = document.querySelector("#analytics-status");
  setStatus(status, "Загружаю аналитику…");

  document.querySelectorAll("[data-analytics-days]").forEach(button => {
    button.classList.toggle(
      "is-active",
      Number(button.dataset.analyticsDays) === days
    );
  });

  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const events = await api(
      `/rest/v1/site_events?select=event_name,event_value,session_id,path,project_slug,referrer,utm_source,utm_medium,utm_campaign,created_at&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc&limit=10000`,
      { method: "GET" }
    );

    const pageViews = events.filter(event => event.event_name === "page_view");
    const projectViews = events.filter(event => event.event_name === "project_view");
    const requestViews = events.filter(event => event.event_name === "request_view");
    const submissions = events.filter(event => event.event_name === "request_submit_success");
    const sessions = new Set(events.map(event => event.session_id).filter(Boolean));

    document.querySelector("#analytics-pageviews").textContent = pageViews.length;
    document.querySelector("#analytics-sessions").textContent = sessions.size;
    document.querySelector("#analytics-projectviews").textContent = projectViews.length;
    document.querySelector("#analytics-requestviews").textContent = requestViews.length;
    document.querySelector("#analytics-submissions").textContent = submissions.length;

    const conversion = requestViews.length
      ? (submissions.length / requestViews.length) * 100
      : 0;
    document.querySelector("#analytics-conversion").textContent =
      `${conversion.toFixed(conversion >= 10 ? 0 : 1)}%`;

    renderAnalyticsList(
      "#analytics-pages",
      rankedCounts(pageViews.map(event => friendlyPage(event.path))),
      "Просмотров пока нет."
    );

    renderAnalyticsList(
      "#analytics-project-list",
      rankedCounts(projectViews.map(event => event.project_slug)),
      "Кейсы пока не открывали."
    );

    const firstPageBySession = new Map();
    for (const event of pageViews) {
      if (!firstPageBySession.has(event.session_id)) {
        firstPageBySession.set(event.session_id, event);
      }
    }

    renderAnalyticsList(
      "#analytics-sources",
      rankedCounts([...firstPageBySession.values()].map(sourceLabel)),
      "Источников пока нет."
    );

    setStatus(
      status,
      events.length >= 10000
        ? "Показаны первые 10 000 событий за период."
        : `Обновлено · событий: ${events.length}`,
      "success"
    );
  } catch (error) {
    setStatus(status, `Ошибка аналитики: ${error.message}`, "error");
  }
}

function showClientCredentials(email, password) {
  const box = document.querySelector("#client-credentials");
  document.querySelector("#client-credentials-email").textContent = email || "";
  document.querySelector("#client-credentials-password").textContent = password || "";
  box.classList.remove("is-hidden");
}

function clientErrorMessage(error) {
  const code = String(error?.message || "");

  if (code === "reserved_admin_account") {
    return "Этот email используется администратором. Для клиента нужен другой адрес.";
  }

  if (code === "invalid_email") {
    return "Проверь email клиента.";
  }

  return code || "Неизвестная ошибка";
}

function renderClients() {
  const root = document.querySelector("#admin-client-list");
  root.replaceChildren();

  if (!clients.length) {
    const empty = document.createElement("div");
    empty.className = "admin-empty";
    empty.textContent = "Клиентов пока нет.";
    root.appendChild(empty);
    return;
  }

  for (const client of clients) {
    const card = document.createElement("article");
    card.className = "admin-client-card";

    const head = document.createElement("div");
    head.className = "admin-client-head";

    const identity = document.createElement("div");
    identity.className = "admin-client-identity";

    const title = document.createElement("strong");
    title.textContent = client.display_name || client.email;

    const email = document.createElement("span");
    email.textContent = client.email;

    const badges = document.createElement("div");
    badges.className = "admin-client-badges";

    const activeBadge = document.createElement("span");
    activeBadge.className = `project-badge ${client.active ? "is-published" : ""}`;
    activeBadge.textContent = client.active ? "Доступ активен" : "Доступ закрыт";
    badges.appendChild(activeBadge);

    if (client.must_change_password) {
      const passwordBadge = document.createElement("span");
      passwordBadge.className = "project-badge";
      passwordBadge.textContent = "Ждём смену пароля";
      badges.appendChild(passwordBadge);
    }

    identity.append(title, email, badges);

    const actions = document.createElement("div");
    actions.className = "admin-row-actions";

    const activeButton = document.createElement("button");
    activeButton.type = "button";
    activeButton.className = client.active ? "admin-mini is-danger" : "admin-mini";
    activeButton.textContent = client.active ? "Закрыть доступ" : "Вернуть доступ";
    activeButton.addEventListener("click", async () => {
      const status = document.querySelector("#clients-status");
      activeButton.disabled = true;
      setStatus(status, client.active ? "Закрываю доступ…" : "Возвращаю доступ…");

      try {
        await clientAdminApi({
          action: "set_active",
          user_id: client.user_id,
          active: !client.active
        });
        await loadClients();
        setStatus(status, "Доступ обновлён.", "success");
      } catch (error) {
        setStatus(status, `Ошибка: ${clientErrorMessage(error)}`, "error");
      } finally {
        activeButton.disabled = false;
      }
    });

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "admin-mini";
    resetButton.textContent = "Сбросить пароль";
    resetButton.addEventListener("click", async () => {
      if (!window.confirm(`Сбросить пароль для ${client.email}?`)) return;

      const status = document.querySelector("#clients-status");
      resetButton.disabled = true;
      setStatus(status, "Создаю новый временный пароль…");

      try {
        const data = await clientAdminApi({
          action: "reset_password",
          user_id: client.user_id
        });
        showClientCredentials(client.email, data.temporary_password);
        await loadClients();
        setStatus(status, "Новый временный пароль создан.", "success");
      } catch (error) {
        setStatus(status, `Ошибка: ${clientErrorMessage(error)}`, "error");
      } finally {
        resetButton.disabled = false;
      }
    });

    actions.append(activeButton, resetButton);
    head.append(identity, actions);

    const access = document.createElement("div");
    access.className = "admin-client-access";

    const accessTitle = document.createElement("span");
    accessTitle.className = "cover-label";
    accessTitle.textContent = "Доступ к проектам";

    const projectGrid = document.createElement("div");
    projectGrid.className = "admin-client-projects";

    const selected = new Set(client.project_ids || []);

    if (!projects.length) {
      const none = document.createElement("span");
      none.className = "client-admin-muted";
      none.textContent = "В базе пока нет проектов.";
      projectGrid.appendChild(none);
    } else {
      for (const project of projects) {
        const label = document.createElement("label");
        label.className = "admin-client-project-option";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = project.id;
        checkbox.checked = selected.has(project.id);

        const text = document.createElement("span");
        text.textContent = project.title;

        label.append(checkbox, text);
        projectGrid.appendChild(label);
      }
    }

    const saveAccess = document.createElement("button");
    saveAccess.type = "button";
    saveAccess.className = "admin-ghost";
    saveAccess.textContent = "Сохранить доступ к проектам";
    saveAccess.disabled = !projects.length;
    saveAccess.addEventListener("click", async () => {
      const status = document.querySelector("#clients-status");
      const projectIds = Array.from(
        projectGrid.querySelectorAll('input[type="checkbox"]:checked')
      ).map(input => input.value);

      saveAccess.disabled = true;
      setStatus(status, "Сохраняю доступ…");

      try {
        await clientAdminApi({
          action: "set_projects",
          user_id: client.user_id,
          project_ids: projectIds
        });
        await loadClients();
        setStatus(status, "Проекты клиента обновлены.", "success");
      } catch (error) {
        setStatus(status, `Ошибка: ${clientErrorMessage(error)}`, "error");
      } finally {
        saveAccess.disabled = false;
      }
    });

    access.append(accessTitle, projectGrid, saveAccess);
    card.append(head, access);
    root.appendChild(card);
  }
}

async function loadClients() {
  const status = document.querySelector("#clients-status");
  setStatus(status, "Загружаю клиентов…");

  try {
    const data = await clientAdminApi({ action: "list" });
    clients = data.clients || [];
    renderClients();
    setStatus(
      status,
      clients.length ? `Клиентов: ${clients.length}` : "",
      clients.length ? "success" : ""
    );
  } catch (error) {
    setStatus(status, `Ошибка: ${clientErrorMessage(error)}`, "error");
  }
}

async function loadProjects() {
  setStatus(dashboardStatus, "Загружаю проекты…");

  try {
    projects = await api(
      "/rest/v1/projects?select=id,slug,title,short_description,description,task,solution,result,type,status,cover_url,cover_storage_path,sort_order,published,created_at,updated_at&order=sort_order.asc,created_at.desc",
      { method: "GET" }
    );

    projectsCount.textContent = projects.length;
    const published = projects.filter(project => project.published).length;
    publishedCount.textContent = published;
    draftCount.textContent = projects.length - published;

    projectsList.innerHTML = "";

    if (!projects.length) {
      const empty = document.createElement("div");
      empty.className = "admin-empty";
      empty.textContent = "В базе пока нет проектов. Нажми «Новый проект», чтобы добавить первый.";
      projectsList.appendChild(empty);
      setStatus(dashboardStatus, "");
      return;
    }

    for (const project of projects) {
      projectsList.appendChild(createProjectRow(project));
    }

    setStatus(dashboardStatus, "Данные синхронизированы с Supabase.", "success");
  } catch (error) {
    setStatus(dashboardStatus, `Ошибка: ${error.message}`, "error");
  }
}

async function togglePublished(project) {
  const next = !project.published;
  setStatus(dashboardStatus, next ? "Публикую…" : "Снимаю с публикации…");

  try {
    await api(
      `/rest/v1/projects?id=eq.${encodeURIComponent(project.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ published: next })
      }
    );
    await loadProjects();
  } catch (error) {
    setStatus(dashboardStatus, `Ошибка: ${error.message}`, "error");
  }
}

async function deleteProject(project) {
  const ok = window.confirm(
    `Удалить проект «${project.title}»? Это действие нельзя отменить.`
  );

  if (!ok) return;

  setStatus(dashboardStatus, "Удаляю проект…");

  try {
    const deletion = await storageMaintenanceApi({
      action: "delete_project",
      project_id: project.id
    });

    const cleanupErrors = deletion?.result?.cleanup_errors || [];
    if (cleanupErrors.length) {
      console.warn("Project deleted; storage cleanup will retry nightly", cleanupErrors);
    }

    if (document.querySelector("#project-id").value === project.id) {
      closeEditor();
    }

    await loadProjects();
  } catch (error) {
    setStatus(dashboardStatus, `Ошибка: ${error.message}`, "error");
  }
}

async function showDashboard() {
  const ok = await verifyAdmin();

  if (!ok) {
    clearSession();
    loginView.classList.remove("is-hidden");
    dashboardView.classList.add("is-hidden");
    setStatus(loginStatus, "Этот аккаунт не имеет прав администратора.", "error");
    return;
  }

  loginView.classList.add("is-hidden");
  dashboardView.classList.remove("is-hidden");
  adminUser.textContent = sessionStorage.getItem(EMAIL_KEY) || "Администратор";
  await loadProjects();
  await loadClients();
  await loadAnalytics(analyticsDays);
  await loadHealth();
  await loadBackups();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(loginStatus, "Проверяю доступ…");

  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;

  try {
    const data = await api("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    saveSession(data);
    await showDashboard();
  } catch (error) {
    clearSession();
    setStatus(loginStatus, "Не удалось войти. Проверь email и пароль.", "error");
  }
});

projectForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const id = document.querySelector("#project-id").value;
  const title = document.querySelector("#project-title").value.trim();
  const slug = document.querySelector("#project-slug").value.trim();

  if (!title || !slug) {
    setStatus(editorStatus, "Название и slug обязательны.", "error");
    return;
  }

  const payload = {
    title,
    slug,
    type: document.querySelector("#project-type").value.trim() || null,
    status: document.querySelector("#project-status").value,
    sort_order: Number(document.querySelector("#project-sort-order").value || 0),
    short_description: document.querySelector("#project-short-description").value.trim() || null,
    description: document.querySelector("#project-description").value.trim() || null,
    task: document.querySelector("#project-task").value.trim() || null,
    solution: document.querySelector("#project-solution").value.trim() || null,
    result: document.querySelector("#project-result").value.trim() || null,
    cover_url: coverRemoved ? null : currentCoverUrl,
    cover_storage_path: coverRemoved ? null : currentCoverStoragePath,
    published: document.querySelector("#project-published").checked
  };

  const saveButton = document.querySelector("#save-project");
  const previousCoverUrl = originalCoverUrl;
  const previousCoverStoragePath = originalCoverStoragePath;
  let uploadedCover = null;

  saveButton.disabled = true;
  setStatus(editorStatus, pendingCoverFile ? "Загружаю обложку…" : "Сохраняю…");

  try {
    if (pendingCoverFile) {
      uploadedCover = await uploadCover(pendingCoverFile, slug);
      payload.cover_url = uploadedCover.url;
      payload.cover_storage_path = uploadedCover.path;
      currentCoverUrl = uploadedCover.url;
      currentCoverStoragePath = uploadedCover.path;
      coverRemoved = false;
      setCoverPreview(currentCoverUrl);
      setStatus(editorStatus, "Обложка загружена. Сохраняю проект…");
    }

    if (id) {
      await api(
        `/rest/v1/projects?id=eq.${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(payload)
        }
      );
      setStatus(editorStatus, "Изменения сохранены.", "success");
    } else {
      const created = await api(
        "/rest/v1/projects",
        {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(payload)
        }
      );

      const createdProject = Array.isArray(created) ? created[0] : null;
      if (createdProject?.id) {
        document.querySelector("#project-id").value = createdProject.id;
        editorEyebrow.textContent = "Редактирование";
        editorTitle.textContent = createdProject.title || title;
        slugWasEdited = true;
        await loadProjectMedia(createdProject.id);
      }

      setStatus(editorStatus, "Проект создан. Теперь можно добавить медиагалерею.", "success");
    }

    pendingCoverFile = null;

    const savedCoverPath = payload.cover_storage_path || null;
    if (
      previousCoverStoragePath &&
      previousCoverStoragePath !== savedCoverPath
    ) {
      try {
        await storageMaintenanceApi({
          action: "delete_objects",
          objects: [{
            bucket: "project-covers",
            path: previousCoverStoragePath
          }]
        });
      } catch (cleanupError) {
        console.error("Old cover cleanup failed", cleanupError);
      }
    }

    originalCoverUrl = payload.cover_url || null;
    originalCoverStoragePath = savedCoverPath;
    currentCoverUrl = originalCoverUrl;
    currentCoverStoragePath = originalCoverStoragePath;

    await loadProjects();
  } catch (error) {
    if (uploadedCover?.path) {
      try {
        await storageMaintenanceApi({
          action: "delete_objects",
          objects: [{
            bucket: "project-covers",
            path: uploadedCover.path
          }]
        });
      } catch {}
      currentCoverUrl = previousCoverUrl;
      currentCoverStoragePath = previousCoverStoragePath;
      setCoverPreview(previousCoverUrl);
    }

    const message = String(error.message || "");
    if (message.includes("duplicate") || message.includes("projects_slug_key")) {
      setStatus(editorStatus, "Такой slug уже занят. Выбери другой.", "error");
    } else {
      setStatus(editorStatus, `Ошибка: ${message}`, "error");
    }
  } finally {
    saveButton.disabled = false;
  }
});

document.querySelector("#project-title").addEventListener("input", (event) => {
  if (!slugWasEdited) {
    document.querySelector("#project-slug").value = slugify(event.target.value);
  }
});

document.querySelector("#project-slug").addEventListener("input", () => {
  slugWasEdited = true;
});

document.querySelector("#project-cover-file").addEventListener("change", (event) => {
  const file = event.target.files?.[0] || null;
  if (!file) return;

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
  if (!allowed.includes(file.type)) {
    event.target.value = "";
    setStatus(editorStatus, "Поддерживаются только JPG, PNG, WebP и AVIF.", "error");
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    event.target.value = "";
    setStatus(editorStatus, "Файл больше 10 МБ. Выбери более лёгкую обложку.", "error");
    return;
  }

  revokeLocalCoverPreview();
  localCoverPreviewUrl = URL.createObjectURL(file);
  pendingCoverFile = file;
  coverRemoved = false;
  setCoverPreview(localCoverPreviewUrl);
  setStatus(editorStatus, `Выбрано: ${file.name}`);
});

document.querySelector("#upload-media-button").addEventListener("click", async () => {
  const projectId = document.querySelector("#project-id").value;
  const files = Array.from(document.querySelector("#project-media-files").files || []);
  const status = document.querySelector("#media-status");

  if (!projectId) {
    setStatus(status, "Сначала сохрани проект.", "error");
    return;
  }

  if (!files.length) {
    setStatus(status, "Сначала выбери изображения или видео.");
    return;
  }

  const button = document.querySelector("#upload-media-button");
  button.disabled = true;

  try {
    const slug = document.querySelector("#project-slug").value.trim();
    let order = currentProjectMedia.length
      ? Math.max(...currentProjectMedia.map(item => Number(item.sort_order || 0))) + 10
      : 0;

    for (let i = 0; i < files.length; i++) {
      setStatus(status, `Загружаю ${i + 1} из ${files.length}: ${files[i].name}`);
      await uploadProjectMediaFile(files[i], projectId, slug, order);
      order += 10;
    }

    document.querySelector("#project-media-files").value = "";
    await loadProjectMedia(projectId);
    setStatus(status, "Медиа загружено.", "success");
  } catch (error) {
    setStatus(status, `Ошибка: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#remove-cover").addEventListener("click", () => {
  pendingCoverFile = null;
  currentCoverUrl = null;
  currentCoverStoragePath = null;
  coverRemoved = true;
  document.querySelector("#project-cover-file").value = "";
  revokeLocalCoverPreview();
  setCoverPreview(null);
  setStatus(editorStatus, "Обложка будет убрана после сохранения.");
});

newProjectButton.addEventListener("click", openNewProject);
cancelEdit.addEventListener("click", closeEditor);
cancelEditBottom.addEventListener("click", closeEditor);
refreshButton.addEventListener("click", async () => {
  await loadProjects();
  await loadClients();
  await loadAnalytics(analyticsDays);
  await loadHealth();
  await loadBackups();
});

document.querySelector("#client-create-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const status = document.querySelector("#clients-status");
  const email = document.querySelector("#client-create-email").value.trim();
  const displayName = document.querySelector("#client-create-name").value.trim();
  const button = event.currentTarget.querySelector('button[type="submit"]');

  button.disabled = true;
  setStatus(status, "Создаю клиентский доступ…");

  try {
    const data = await clientAdminApi({
      action: "create",
      email,
      display_name: displayName
    });

    showClientCredentials(data.client.email, data.temporary_password);
    event.currentTarget.reset();
    await loadClients();
    setStatus(status, "Доступ создан. Передай клиенту email и временный пароль.", "success");
  } catch (error) {
    setStatus(status, `Ошибка: ${clientErrorMessage(error)}`, "error");
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#client-copy-credentials")?.addEventListener("click", async () => {
  const status = document.querySelector("#clients-status");
  const email = document.querySelector("#client-credentials-email").textContent.trim();
  const password = document.querySelector("#client-credentials-password").textContent.trim();
  const text = `Клиентский кабинет: https://toolsforyourwork.github.io/custom-tools-studio/client/\nEmail: ${email}\nВременный пароль: ${password}`;

  try {
    await navigator.clipboard.writeText(text);
    setStatus(status, "Данные доступа скопированы.", "success");
  } catch {
    setStatus(status, "Не удалось скопировать автоматически — скопируй данные из блока.", "error");
  }
});

document.querySelectorAll("[data-collab-tab]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-collab-tab]").forEach(item => {
      item.classList.toggle("is-active", item === button);
    });

    document.querySelectorAll("[data-collab-panel]").forEach(panel => {
      panel.classList.toggle(
        "is-hidden",
        panel.dataset.collabPanel !== button.dataset.collabTab
      );
    });
  });
});

document.querySelector("#collab-refresh-button")?.addEventListener("click", () => {
  if (currentCollabProjectId) {
    loadProjectCollaboration(currentCollabProjectId);
  }
});

document.querySelector("#admin-message-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentCollabProjectId) return;

  const textarea = document.querySelector("#admin-message-text");
  const message = textarea.value.trim();
  const status = document.querySelector("#admin-message-status");
  const button = event.currentTarget.querySelector('button[type="submit"]');

  if (!message) return;

  button.disabled = true;
  setStatus(status, "Отправляю…");

  try {
    await clientAdminApi({
      action: "send_message",
      project_id: currentCollabProjectId,
      message
    });
    textarea.value = "";
    await loadProjectCollaboration(currentCollabProjectId);
    setStatus(status, "Сообщение отправлено.", "success");
  } catch (error) {
    setStatus(status, `Ошибка: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#admin-client-files-upload")?.addEventListener("click", async () => {
  if (!currentCollabProjectId) return;

  const picker = document.querySelector("#admin-client-files");
  const files = Array.from(picker.files || []);
  const button = document.querySelector("#admin-client-files-upload");
  const status = document.querySelector("#admin-client-files-status");

  if (!files.length) {
    setStatus(status, "Сначала выбери файл.");
    return;
  }

  button.disabled = true;

  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];

      if (!file.type) {
        throw new Error(`Не удалось определить тип «${file.name}».`);
      }

      if (file.size > 100 * 1024 * 1024) {
        throw new Error(`Файл «${file.name}» больше 100 МБ.`);
      }

      setStatus(
        status,
        `Загружаю ${index + 1} из ${files.length}: ${file.name}`
      );

      const prepared = await clientAdminApi({
        action: "prepare_upload",
        project_id: currentCollabProjectId,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size
      });

      await uploadSignedWorkspaceFile(prepared, file);

      await clientAdminApi({
        action: "commit_upload",
        project_id: currentCollabProjectId,
        path: prepared.upload.path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size
      });
    }

    picker.value = "";
    await loadProjectCollaboration(currentCollabProjectId);
    setStatus(status, "Файлы загружены.", "success");
  } catch (error) {
    setStatus(status, `Ошибка: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#admin-approval-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentCollabProjectId) return;

  const title = document.querySelector("#admin-approval-title").value.trim();
  const description =
    document.querySelector("#admin-approval-description").value.trim();
  const status = document.querySelector("#admin-approval-status");
  const button = event.currentTarget.querySelector('button[type="submit"]');

  button.disabled = true;
  setStatus(status, "Отправляю на согласование…");

  try {
    await clientAdminApi({
      action: "create_approval",
      project_id: currentCollabProjectId,
      title,
      description
    });

    event.currentTarget.reset();
    await loadProjectCollaboration(currentCollabProjectId);
    setStatus(status, "Запрос на согласование создан.", "success");
  } catch (error) {
    const message = error.message === "approval_pending"
      ? "У проекта уже есть активный запрос на согласование."
      : `Ошибка: ${error.message}`;
    setStatus(status, message, "error");
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#health-refresh-button")?.addEventListener("click", loadHealth);
document.querySelector("#backup-refresh-button")?.addEventListener("click", loadBackups);
document.querySelector("#backup-create-button")?.addEventListener("click", createBackupNow);

document.querySelectorAll("[data-analytics-days]").forEach(button => {
  button.addEventListener("click", () => {
    loadAnalytics(Number(button.dataset.analyticsDays || 7));
  });
});

logoutButton.addEventListener("click", async () => {
  try {
    await api("/auth/v1/logout", { method: "POST" });
  } catch {
    // Local logout is sufficient if remote logout fails.
  }

  clearSession();
  dashboardView.classList.add("is-hidden");
  loginView.classList.remove("is-hidden");
  loginForm.reset();
  closeEditor();
  setStatus(loginStatus, "Вы вышли из админки.", "success");
});

(async () => {
  if (!currentToken()) return;

  try {
    await showDashboard();
  } catch {
    clearSession();
  }
})();
