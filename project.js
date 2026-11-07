(() => {
  const CASE_SUPABASE_URL = "https://bpdqosfgxqawbzljafgb.supabase.co";
  const CASE_SUPABASE_KEY = "sb_publishable_FQaK_TPRAjA1NMcVG9zqzw_VFvqaRXk";

  const STATUS_LABELS = {
    concept: "Концепт",
    in_progress: "В работе",
    paused: "Пауза",
    completed: "Готов"
  };

  const loading = document.querySelector("#caseLoading");
  const notFound = document.querySelector("#caseNotFound");
  const content = document.querySelector("#caseContent");

  function showNotFound() {
    loading.classList.add("is-hidden");
    content.classList.add("is-hidden");
    notFound.classList.remove("is-hidden");
  }

  function addTag(container, text) {
    if (!text) return;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = text;
    container.appendChild(tag);
  }

  function safeCaseMediaUrl(value, bucket) {
    if (!value) return null;

    try {
      const url = new URL(value);
      const prefix =
        `${CASE_SUPABASE_URL}/storage/v1/object/public/${bucket}/`;

      if (url.protocol !== "https:" || !url.href.startsWith(prefix)) {
        return null;
      }

      return url.href;
    } catch {
      return null;
    }
  }

  function setSeoMeta(selector, value, attribute = "content") {
    const el = document.querySelector(selector);
    if (el && value) el.setAttribute(attribute, value);
  }

  function updateProjectSeo(project) {
    const pageUrl =
      window.PROJECT_SHARE_URL ||
      `https://toolsforyourwork.github.io/custom-tools-studio/project.html?slug=${encodeURIComponent(project.slug)}`;
    const ogImage =
      `https://bpdqosfgxqawbzljafgb.supabase.co/functions/v1/og-image?slug=${encodeURIComponent(project.slug)}`;
    const title = `${project.title} — Tools for your work`;
    const description =
      (project.short_description || "Кейс студии кастомных цифровых инструментов").slice(0, 160);

    document.title = title;

    setSeoMeta('meta[name="description"]', description);
    setSeoMeta('meta[property="og:type"]', "article");
    setSeoMeta('meta[property="og:title"]', project.title);
    setSeoMeta('meta[property="og:description"]', description);
    setSeoMeta('meta[property="og:url"]', pageUrl);
    setSeoMeta('meta[property="og:image"]', ogImage);
    setSeoMeta('meta[name="twitter:title"]', project.title);
    setSeoMeta('meta[name="twitter:description"]', description);
    setSeoMeta('meta[name="twitter:image"]', ogImage);
    setSeoMeta('link[rel="canonical"]', pageUrl, "href");
  }

  function fillBlock(blockId, textId, value) {
    if (!value?.trim()) return;
    document.querySelector(textId).textContent = value.trim();
    document.querySelector(blockId).classList.remove("is-hidden");
  }

  async function loadCase() {
    const slug = (
      window.PROJECT_SLUG ||
      new URLSearchParams(window.location.search).get("slug") ||
      ""
    ).trim();

    if (!slug) {
      showNotFound();
      return;
    }

    try {
      const response = await fetch(
        `${CASE_SUPABASE_URL}/functions/v1/public-content?slug=${encodeURIComponent(slug)}`,
        {
          headers: { apikey: CASE_SUPABASE_KEY },
          cache: "no-store"
        }
      );

      const data = await response.json().catch(() => ({}));

      if (response.status === 404) {
        showNotFound();
        return;
      }

      if (!response.ok || !data?.ok || !data?.project) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      const project = data.project;
      const media = Array.isArray(data.media) ? data.media : [];

      document.querySelector("#caseTitle").textContent = project.title;
      document.querySelector("#caseLead").textContent =
        project.short_description || "";

      const meta = document.querySelector("#caseMeta");
      meta.replaceChildren();
      addTag(meta, project.type);
      addTag(meta, STATUS_LABELS[project.status] || project.status);

      const safeCoverUrl = safeCaseMediaUrl(project.cover_url, "project-covers");
      if (safeCoverUrl) {
        const cover = document.querySelector("#caseCover");
        cover.src = safeCoverUrl;
        cover.alt = `Обложка проекта «${project.title}»`;
        document.querySelector("#caseCoverWrap").classList.remove("is-hidden");
      }

      if (project.description?.trim()) {
        document.querySelector("#caseDescription").textContent =
          project.description.trim();
        document.querySelector("#caseIntro").classList.remove("is-hidden");
      }

      fillBlock("#caseTaskBlock", "#caseTask", project.task);
      fillBlock("#caseSolutionBlock", "#caseSolution", project.solution);
      fillBlock("#caseResultBlock", "#caseResult", project.result);

      if (media.length) {
        const grid = document.querySelector("#caseMediaGrid");
        grid.replaceChildren();

        for (const item of media) {
          const mediaUrl = safeCaseMediaUrl(item.url, "project-media");
          if (!mediaUrl) continue;

          const figure = document.createElement("figure");
          figure.className = "case-media-item";

          if (item.kind === "video") {
            const video = document.createElement("video");
            video.src = mediaUrl;
            video.controls = true;
            video.preload = "metadata";
            video.playsInline = true;
            figure.appendChild(video);
          } else {
            const img = document.createElement("img");
            img.src = mediaUrl;
            img.alt = item.caption || `Медиа проекта «${project.title}»`;
            img.loading = "lazy";
            figure.appendChild(img);
          }

          if (item.caption) {
            const caption = document.createElement("figcaption");
            caption.textContent = item.caption;
            figure.appendChild(caption);
          }

          grid.appendChild(figure);
        }

        if (grid.children.length) {
          document.querySelector("#caseMediaSection").classList.remove("is-hidden");
        }
      }

      updateProjectSeo(project);

      loading.classList.add("is-hidden");
      notFound.classList.add("is-hidden");
      content.classList.remove("is-hidden");

      window.trackSiteEvent?.("project_view", {
        project_slug: project.slug
      });
    } catch (error) {
      console.error(error);
      showNotFound();
    }
  }
  loadCase();
})();
