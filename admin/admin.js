const SUPABASE_URL = "https://bpdqosfgxqawbzljafgb.supabase.co";
const SUPABASE_KEY = "sb_publishable_FQaK_TPRAjA1NMcVG9zqzw_VFvqaRXk";

const loginView = document.querySelector("#login-view");
const dashboardView = document.querySelector("#dashboard-view");
const loginForm = document.querySelector("#login-form");
const loginStatus = document.querySelector("#login-status");
const dashboardStatus = document.querySelector("#dashboard-status");
const adminUser = document.querySelector("#admin-user");
const projectsCount = document.querySelector("#projects-count");
const projectsList = document.querySelector("#projects-list");
const logoutButton = document.querySelector("#logout-button");
const refreshButton = document.querySelector("#refresh-button");

const TOKEN_KEY = "custom_tools_admin_access_token";
const EMAIL_KEY = "custom_tools_admin_email";
const USER_KEY = "custom_tools_admin_user_id";

function setLoginStatus(message, type = "") {
  loginStatus.textContent = message;
  loginStatus.dataset.type = type;
}

function setDashboardStatus(message, type = "") {
  dashboardStatus.textContent = message;
  dashboardStatus.dataset.type = type;
}

function saveSession(data) {
  sessionStorage.setItem(TOKEN_KEY, data.access_token);
  sessionStorage.setItem(EMAIL_KEY, data.user?.email || "");
  sessionStorage.setItem(USER_KEY, data.user?.id || "");
}

function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(EMAIL_KEY);
  sessionStorage.removeItem(USER_KEY);
}

function currentToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

async function api(path, options = {}) {
  const token = currentToken();
  const headers = {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers,
  });

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

async function loadProjects() {
  setDashboardStatus("Загружаю проекты…");

  try {
    const rows = await api(
      "/rest/v1/projects?select=id,title,type,status,published,sort_order,created_at&order=sort_order.asc,created_at.desc",
      { method: "GET" }
    );

    projectsCount.textContent = rows.length;
    projectsList.innerHTML = "";

    if (!rows.length) {
      projectsList.innerHTML = '<div class="admin-empty">В базе пока нет проектов. На следующем этапе добавим форму создания.</div>';
      setDashboardStatus("");
      return;
    }

    for (const project of rows) {
      const row = document.createElement("article");
      row.className = "admin-project-row";
      row.innerHTML = `
        <div>
          <strong></strong>
          <span></span>
        </div>
        <span class="admin-project-state"></span>
      `;
      row.querySelector("strong").textContent = project.title || "Без названия";
      row.querySelector("div span").textContent = project.type || "Без типа";
      row.querySelector(".admin-project-state").textContent =
        project.published ? "Опубликован" : "Черновик";
      projectsList.appendChild(row);
    }

    setDashboardStatus("Подключение к базе работает.", "success");
  } catch (error) {
    setDashboardStatus(`Ошибка: ${error.message}`, "error");
  }
}

async function showDashboard() {
  const ok = await verifyAdmin();
  if (!ok) {
    clearSession();
    loginView.classList.remove("is-hidden");
    dashboardView.classList.add("is-hidden");
    setLoginStatus("Этот аккаунт не имеет прав администратора.", "error");
    return;
  }

  loginView.classList.add("is-hidden");
  dashboardView.classList.remove("is-hidden");
  adminUser.textContent = sessionStorage.getItem(EMAIL_KEY) || "Администратор";
  await loadProjects();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoginStatus("Проверяю доступ…");

  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;

  try {
    const data = await api("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    saveSession(data);
    await showDashboard();
  } catch (error) {
    clearSession();
    setLoginStatus("Не удалось войти. Проверь email и пароль.", "error");
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await api("/auth/v1/logout", { method: "POST" });
  } catch {
    // local logout is enough
  }

  clearSession();
  dashboardView.classList.add("is-hidden");
  loginView.classList.remove("is-hidden");
  loginForm.reset();
  setLoginStatus("Вы вышли из админки.", "success");
});

refreshButton.addEventListener("click", loadProjects);

(async () => {
  if (!currentToken()) return;

  try {
    await showDashboard();
  } catch {
    clearSession();
  }
})();
