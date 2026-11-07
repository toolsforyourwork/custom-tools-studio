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
let slugWasEdited = false;

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

async function verifyAdmin() {
  const userId = sessionStorage.getItem(USER_KEY);
  if (!currentToken() || !userId) return false;

  const rows = await api(
    `/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(userId)}`,
    { method: "GET" }
  );

  return Array.isArray(rows) && rows.length === 1;
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
  document.querySelector("#project-cover-url").value = project.cover_url || "";
  document.querySelector("#project-published").checked = Boolean(project.published);

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

async function loadProjects() {
  setStatus(dashboardStatus, "Загружаю проекты…");

  try {
    projects = await api(
      "/rest/v1/projects?select=id,slug,title,short_description,description,type,status,cover_url,sort_order,published,created_at,updated_at&order=sort_order.asc,created_at.desc",
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
    await api(
      `/rest/v1/projects?id=eq.${encodeURIComponent(project.id)}`,
      { method: "DELETE", headers: { Prefer: "return=minimal" } }
    );

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
    cover_url: document.querySelector("#project-cover-url").value.trim() || null,
    published: document.querySelector("#project-published").checked
  };

  const saveButton = document.querySelector("#save-project");
  saveButton.disabled = true;
  setStatus(editorStatus, "Сохраняю…");

  try {
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
      await api(
        "/rest/v1/projects",
        {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(payload)
        }
      );
      setStatus(editorStatus, "Проект создан.", "success");
    }

    await loadProjects();
    setTimeout(closeEditor, 450);
  } catch (error) {
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

newProjectButton.addEventListener("click", openNewProject);
cancelEdit.addEventListener("click", closeEditor);
cancelEditBottom.addEventListener("click", closeEditor);
refreshButton.addEventListener("click", loadProjects);

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
