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

const loginView = document.querySelector("#client-login-view");
const dashboardView = document.querySelector("#client-dashboard-view");
const loginForm = document.querySelector("#client-login-form");
const loginStatus = document.querySelector("#client-login-status");
const dashboardStatus = document.querySelector("#client-dashboard-status");
const passwordPanel = document.querySelector("#client-password-panel");
const projectsSection = document.querySelector("#client-projects-section");
const projectsRoot = document.querySelector("#client-projects");

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
    throw new Error(data?.error_description || data?.msg || data?.error || `HTTP ${response.status}`);
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

function renderProjects(projects) {
  projectsRoot.replaceChildren();

  if (!projects.length) {
    const empty = document.createElement("div");
    empty.className = "client-empty";
    empty.textContent = "Пока вам не назначено ни одного проекта.";
    projectsRoot.appendChild(empty);
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

    const coverUrl = safeMediaUrl(project.cover_url, "project-covers");
    if (coverUrl) {
      const cover = document.createElement("img");
      cover.className = "client-cover";
      cover.src = coverUrl;
      cover.alt = `Обложка проекта «${project.title || "Проект"}»`;
      body.appendChild(cover);
    }

    const copy = document.createElement("div");
    copy.className = "client-copy";
    addCopyBlock(copy, "Контекст", project.description);
    addCopyBlock(copy, "Задача", project.task);
    addCopyBlock(copy, "Решение", project.solution);
    addCopyBlock(copy, "Результат", project.result);
    body.appendChild(copy);

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
          image.alt = item.caption || `Материал проекта «${project.title || "Проект"}»`;
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

      body.appendChild(gallery);
    }

    card.append(summary, body);
    projectsRoot.appendChild(card);
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

  if (password.length < 10 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
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
  setStatus(loginStatus, "Вы вышли из кабинета.", "success");
});

(async () => {
  if (!token()) return;

  try {
    await loadDashboard();
  } catch {
    clearSession();
  }
})();
