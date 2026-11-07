
const header = document.getElementById("header");
const menu = document.getElementById("menu");
const nav = document.getElementById("nav");

function updateHeader(){
  header?.classList.toggle("scrolled", window.scrollY > 12);
}
updateHeader();
window.addEventListener("scroll", updateHeader, {passive:true});

menu?.addEventListener("click", ()=>{
  const opened = nav.classList.toggle("open");
  menu.classList.toggle("open", opened);
  document.body.style.overflow = opened ? "hidden" : "";
});

document.querySelectorAll(".nav a").forEach(a=>{
  a.addEventListener("click", ()=>{
    nav.classList.remove("open");
    menu?.classList.remove("open");
    document.body.style.overflow = "";
  });
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
  email:     { label: "", url: "" }
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
});

async function supabaseRequest(path, options = {}) {
  const headers = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Supabase error ${response.status}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

document.querySelectorAll("form.demo-form").forEach(form=>{
  const status = form.querySelector(".form-status");

  form.addEventListener("submit", async e=>{
    e.preventDefault();

    const inputs = form.querySelectorAll("input");
    const textarea = form.querySelector("textarea");
    const button = form.querySelector('button[type="submit"]');

    const payload = {
      name: (inputs[0]?.value || "").trim(),
      contact: (inputs[1]?.value || "").trim(),
      message: (textarea?.value || "").trim(),
      source: "website",
      status: "new"
    };

    if (!payload.name || !payload.contact || !payload.message) {
      status.textContent = "Заполни все поля.";
      return;
    }

    button.disabled = true;
    status.textContent = "Отправляем…";

    try {
      await supabaseRequest("contact_requests", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(payload)
      });

      form.reset();
      status.textContent = "Готово. Заявка отправлена.";
    } catch (error) {
      console.error(error);
      status.textContent = "Не получилось отправить заявку. Попробуй ещё раз.";
    } finally {
      button.disabled = false;
    }
  });
});

async function loadProjects() {
  const grid = document.getElementById("projectsGrid");
  const empty = document.getElementById("projectsEmpty");

  if (!grid || !empty) return;

  try {
    const projects = await supabaseRequest(
      "projects?select=slug,title,short_description,type,status,cover_url&published=eq.true&order=sort_order.asc,created_at.desc"
    );

    if (!projects || projects.length === 0) {
      grid.innerHTML = "";
      empty.style.display = "block";
      return;
    }

    empty.style.display = "none";
    grid.innerHTML = projects.map(project => `
      <a class="project project-link reveal" href="project.html?slug=${encodeURIComponent(project.slug)}" aria-label="Открыть кейс: ${project.title}">
        <div class="project__visual" ${project.cover_url ? `style="background-image:url('${project.cover_url}');background-size:cover;background-position:center"` : ""}>
          ${project.cover_url ? "" : '<div class="project__dot"></div>'}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:20px">
          ${project.type ? `<span class="tag">${project.type}</span>` : ""}
          ${project.status ? `<span class="tag">${PROJECT_STATUS_LABELS[project.status] || project.status}</span>` : ""}
        </div>
        <h3>${project.title}</h3>
        <p>${project.short_description || ""}</p>
        <span class="project__open">Открыть кейс <span aria-hidden="true">↗</span></span>
      </a>
    `).join("");

    document.querySelectorAll("#projectsGrid .reveal").forEach(el => revealObserver.observe(el));
  } catch (error) {
    console.error(error);
    grid.innerHTML = "";
    empty.style.display = "block";
    const p = empty.querySelector("p");
    if (p) p.textContent = "Не удалось загрузить проекты. Проверь подключение к Supabase.";
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
