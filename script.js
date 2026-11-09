
(function routeAdminInviteAuth(){
  try {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    if (!accessToken) return;

    const part = accessToken.split(".")[1];
    if (!part) return;

    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));

    if (payload?.user_metadata?.admin_invite === true) {
      window.location.replace("./admin/" + window.location.hash);
    }
  } catch {}
})();


const header = document.getElementById("header");
const menu = document.getElementById("menu");
const nav = document.getElementById("nav");

function updateHeader(){
  header?.classList.toggle("scrolled", window.scrollY > 12);
}
updateHeader();
window.addEventListener("scroll", updateHeader, {passive:true});

function setMenuOpen(opened) {
  nav?.classList.toggle("open", opened);
  menu?.classList.toggle("open", opened);
  menu?.setAttribute("aria-expanded", opened ? "true" : "false");
  document.body.style.overflow = opened ? "hidden" : "";
}

menu?.addEventListener("click", ()=>{
  const opened = !nav?.classList.contains("open");
  setMenuOpen(opened);
});

document.querySelectorAll(".nav a").forEach(a=>{
  a.addEventListener("click", ()=>setMenuOpen(false));
});

document.addEventListener("keydown", (event)=>{
  if (event.key === "Escape" && nav?.classList.contains("open")) {
    setMenuOpen(false);
    menu?.focus();
  }
});

const revealObserver = new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    if(entry.isIntersecting){
      entry.target.classList.add("visible");
      revealObserver.unobserve(entry.target);
    }
  });
},{threshold:.12});

document.querySelectorAll(".reveal").forEach(el=>revealObserver.observe(el));


const SUPABASE_URL = "https://bpdqosfgxqawbzljafgb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_FQaK_TPRAjA1NMcVG9zqzw_VFvqaRXk";

const ANALYTICS_SESSION_KEY = "custom_tools_analytics_session";
const ANALYTICS_ATTRIBUTION_KEY = "custom_tools_analytics_attribution";

function getAnalyticsSessionId() {
  try {
    let id = sessionStorage.getItem(ANALYTICS_SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(ANALYTICS_SESSION_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function getAnalyticsAttribution() {
  try {
    const params = new URLSearchParams(window.location.search);
    const current = {
      referrer: document.referrer || "",
      utm_source: params.get("utm_source") || "",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || ""
    };

    const hasCurrentAttribution =
      current.utm_source || current.utm_medium || current.utm_campaign;

    const savedRaw = sessionStorage.getItem(ANALYTICS_ATTRIBUTION_KEY);
    const saved = savedRaw ? JSON.parse(savedRaw) : null;

    if (!saved || hasCurrentAttribution) {
      const next = {
        referrer: current.referrer || saved?.referrer || "",
        utm_source: current.utm_source || "",
        utm_medium: current.utm_medium || "",
        utm_campaign: current.utm_campaign || ""
      };
      sessionStorage.setItem(ANALYTICS_ATTRIBUTION_KEY, JSON.stringify(next));
      return next;
    }

    return saved;
  } catch {
    return {
      referrer: document.referrer || "",
      utm_source: "",
      utm_medium: "",
      utm_campaign: ""
    };
  }
}

function trackSiteEvent(eventName, extra = {}) {
  const attribution = getAnalyticsAttribution();

  const payload = {
    event_name: eventName,
    session_id: getAnalyticsSessionId(),
    path: window.location.pathname,
    referrer: attribution.referrer,
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign,
    ...extra
  };

  fetch(`${SUPABASE_URL}/functions/v1/track-event`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {});
}

window.trackSiteEvent = trackSiteEvent;


const PROJECT_STATUS_LABELS = {
  concept: "Концепт",
  in_progress: "В работе",
  paused: "Пауза",
  completed: "Готов"
};

const SITE_RESOURCES = {
  telegram:  { label: "", url: "" },
  instagram: { label: "", url: "" },
  behance:   { label: "", url: "" },
  email:     { label: "customstudioai@gmail.com", url: "mailto:customstudioai@gmail.com" }
};

document.querySelectorAll("[data-resource]").forEach(link => {
  const key = link.dataset.resource;
  const resource = SITE_RESOURCES[key];
  const value = link.querySelector(".resource-value");

  if (!resource?.url) {
    link.classList.add("is-empty");
    link.removeAttribute("href");
    if (value) value.textContent = "Скоро";
    return;
  }

  link.href = resource.url;
  if (/^https?:/i.test(resource.url)) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  if (value) value.textContent = resource.label || resource.url;

  link.addEventListener("click", () => {
    trackSiteEvent("resource_click", { event_value: key });
  });
});

trackSiteEvent("page_view");

if (window.location.pathname.endsWith("/request.html")) {
  trackSiteEvent("request_view");
}

document.querySelectorAll('a[href^="request.html"]').forEach(link => {
  link.addEventListener("click", () => {
    trackSiteEvent("request_click");
  });
});

const REQUEST_TOPICS = Object.freeze({
  excel: "Excel и макросы",
  checkup: "Check-Up вашего бизнеса — отдельная платная услуга",
  development: "Разработка: CRM, боты, AI и интеграции",
  "contract-audit": "Разработка с бесплатным аудитом при заключении договора",
  other: "Другое / пока не знаю"
});

document.querySelectorAll("form.demo-form").forEach(form=>{
  const status = form.querySelector(".form-status");
  const topicSelect = form.elements.service;
  const requestedTopic = new URLSearchParams(window.location.search).get("topic");
  if (topicSelect && Object.hasOwn(REQUEST_TOPICS, requestedTopic)) {
    topicSelect.value = requestedTopic;
  }

  form.addEventListener("submit", async e=>{
    e.preventDefault();

    const button = form.querySelector('button[type="submit"]');

    const payload = {
      name: (form.elements.name?.value || "").trim(),
      email: (form.elements.email?.value || "").trim().toLowerCase(),
      contact: (form.elements.contact?.value || "").trim(),
      message: (form.elements.message?.value || "").trim(),
      website: (form.elements.website?.value || "").trim(),
      consent: Boolean(form.elements.consent?.checked)
    };

    const topic = topicSelect?.value || "";
    if (!Object.hasOwn(REQUEST_TOPICS, topic)) {
      status.textContent = "Выберите направление запроса.";
      return;
    }

    if (!payload.name || !payload.email || !payload.contact || !payload.message) {
      status.textContent = "Заполни все поля.";
      return;
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) {
      status.textContent = "Проверь email.";
      return;
    }

    if (!payload.consent) {
      status.textContent = "Нужно согласиться с обработкой данных.";
      return;
    }

    payload.message = `Направление: ${REQUEST_TOPICS[topic]}\n\n${payload.message}`;

    button.disabled = true;
    status.textContent = "Отправляем…";

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-contact`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 429 || data?.error === "rate_limited") {
          throw new Error("rate_limited");
        }
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      form.reset();
      status.textContent = "Готово. Заявка отправлена. Этот email потом можно использовать для регистрации в клиентском кабинете.";
      trackSiteEvent("request_submit_success");
    } catch (error) {
      console.error(error);
      status.textContent = error.message === "rate_limited"
        ? "Слишком много заявок подряд. Попробуй чуть позже."
        : "Не получилось отправить заявку. Попробуй ещё раз.";
    } finally {
      button.disabled = false;
    }
  });
});

function safeProjectCoverUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const prefix =
      `${SUPABASE_URL}/storage/v1/object/public/project-covers/`;

    if (url.protocol !== "https:" || !url.href.startsWith(prefix)) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

async function loadProjects() {
  const grid = document.getElementById("projectsGrid");
  const empty = document.getElementById("projectsEmpty");

  if (!grid || !empty) return;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/public-content?mode=list`,
      {
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
        cache: "no-store"
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }

    const projects = data.projects || [];

    grid.replaceChildren();

    if (!projects || projects.length === 0) {
      empty.style.display = "block";
      return;
    }

    empty.style.display = "none";

    for (const project of projects) {
      const link = document.createElement("a");
      link.className = "project project-link reveal";
      link.href = `case/${encodeURIComponent(project.slug || "")}/`;
      link.setAttribute(
        "aria-label",
        `Открыть кейс: ${project.title || "проект"}`
      );

      const visual = document.createElement("div");
      visual.className = "project__visual";

      const coverUrl = safeProjectCoverUrl(project.cover_url);
      if (coverUrl) {
        visual.style.backgroundImage = `url("${coverUrl}")`;
        visual.style.backgroundSize = "cover";
        visual.style.backgroundPosition = "center";
      } else {
        const dot = document.createElement("div");
        dot.className = "project__dot";
        visual.appendChild(dot);
      }

      const meta = document.createElement("div");
      meta.style.display = "flex";
      meta.style.gap = "8px";
      meta.style.flexWrap = "wrap";
      meta.style.marginTop = "20px";

      if (project.type) {
        const typeTag = document.createElement("span");
        typeTag.className = "tag";
        typeTag.textContent = project.type;
        meta.appendChild(typeTag);
      }

      if (project.status) {
        const statusTag = document.createElement("span");
        statusTag.className = "tag";
        statusTag.textContent =
          PROJECT_STATUS_LABELS[project.status] || project.status;
        meta.appendChild(statusTag);
      }

      const title = document.createElement("h3");
      title.textContent = project.title || "";

      const description = document.createElement("p");
      description.textContent = project.short_description || "";

      const open = document.createElement("span");
      open.className = "project__open";
      open.append(document.createTextNode("Открыть кейс "));

      const arrow = document.createElement("span");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      open.appendChild(arrow);

      link.append(visual, meta, title, description, open);
      grid.appendChild(link);
      revealObserver.observe(link);
    }
  } catch (error) {
    console.error(error);
    grid.replaceChildren();
    empty.style.display = "block";
    const p = empty.querySelector("p");
    if (p) {
      p.textContent =
        "Не удалось загрузить проекты. Проверь подключение к Supabase.";
    }
  }
}
loadProjects();


document.querySelectorAll("[data-year]").forEach(el=>{
  el.textContent = new Date().getFullYear();
});

const canvas = document.getElementById("network");
if(canvas){
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width, height, dpr, nodes=[];

  function resizeCanvas(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width*dpr;
    canvas.height = height*dpr;
    canvas.style.width = width+"px";
    canvas.style.height = height+"px";
    ctx.setTransform(dpr,0,0,dpr,0,0);

    const count = width < 760 ? 12 : 26;
    nodes = Array.from({length:count},()=>({
      x:Math.random()*width,
      y:Math.random()*height,
      vx:(Math.random()-.5)*.13,
      vy:(Math.random()-.5)*.13,
      r:Math.random()*2.5+1.5,
      color:Math.random()>.55 ? "#D4A72C" : "#647DAF"
    }));
  }

  function draw(){
    if(reduceMotion) return;
    ctx.clearRect(0,0,width,height);

    nodes.forEach(n=>{
      n.x += n.vx; n.y += n.vy;
      if(n.x < -20 || n.x > width+20) n.vx *= -1;
      if(n.y < -20 || n.y > height+20) n.vy *= -1;
    });

    for(let i=0;i<nodes.length;i++){
      for(let j=i+1;j<nodes.length;j++){
        const a=nodes[i], b=nodes[j];
        const dx=a.x-b.x, dy=a.y-b.y;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<185){
          const alpha=(1-dist/185)*.22;
          ctx.strokeStyle=`rgba(100,125,175,${alpha})`;
          ctx.lineWidth=.7;
          ctx.beginPath();
          ctx.moveTo(a.x,a.y);
          ctx.lineTo(b.x,b.y);
          ctx.stroke();
        }
      }
    }

    nodes.forEach(n=>{
      ctx.beginPath();
      ctx.arc(n.x,n.y,n.r,0,Math.PI*2);
      ctx.fillStyle=n.color;
      ctx.globalAlpha=.32;
      ctx.fill();
      ctx.globalAlpha=1;
    });

    requestAnimationFrame(draw);
  }

  resizeCanvas();
  if(!reduceMotion) draw();
  window.addEventListener("resize", resizeCanvas);
}


if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/custom-tools-studio/sw.js", { scope: "/custom-tools-studio/" })
      .catch(error => console.error("Service worker registration failed", error));
  });
}
