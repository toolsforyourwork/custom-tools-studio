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

  function fillBlock(blockId, textId, value) {
    if (!value?.trim()) return;
    document.querySelector(textId).textContent = value.trim();
    document.querySelector(blockId).classList.remove("is-hidden");
  }

  async function loadCase() {
    const slug = new URLSearchParams(window.location.search).get("slug")?.trim();
    if (!slug) {
      showNotFound();
      return;
    }

    try {
      const query =
        "projects?select=id,slug,title,short_description,description,task,solution,result,type,status,cover_url" +
        `&slug=eq.${encodeURIComponent(slug)}&published=eq.true&limit=1`;

      const response = await fetch(`${CASE_SUPABASE_URL}/rest/v1/${query}`, {
        headers: {
          apikey: CASE_SUPABASE_KEY,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const rows = await response.json();
      const project = rows?.[0];
      if (!project) {
        showNotFound();
        return;
      }

      document.querySelector("#caseTitle").textContent = project.title;
      document.querySelector("#caseLead").textContent =
        project.short_description || "";

      const meta = document.querySelector("#caseMeta");
      addTag(meta, project.type);
      addTag(meta, STATUS_LABELS[project.status] || project.status);

      if (project.cover_url) {
        const cover = document.querySelector("#caseCover");
        cover.src = project.cover_url;
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

      try {
        const mediaResponse = await fetch(
          `${CASE_SUPABASE_URL}/rest/v1/project_media?select=id,kind,url,caption,sort_order&project_id=eq.${encodeURIComponent(project.id)}&order=sort_order.asc,created_at.asc`,
          {
            headers: {
              apikey: CASE_SUPABASE_KEY,
              "Content-Type": "application/json"
            }
          }
        );

        if (mediaResponse.ok) {
          const media = await mediaResponse.json();
          if (Array.isArray(media) && media.length) {
            const grid = document.querySelector("#caseMediaGrid");
            grid.innerHTML = "";

            for (const item of media) {
              const figure = document.createElement("figure");
              figure.className = "case-media-item";

              if (item.kind === "video") {
                const video = document.createElement("video");
                video.src = item.url;
                video.controls = true;
                video.preload = "metadata";
                video.playsInline = true;
                figure.appendChild(video);
              } else {
                const img = document.createElement("img");
                img.src = item.url;
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

            document.querySelector("#caseMediaSection").classList.remove("is-hidden");
          }
        }
      } catch (mediaError) {
        console.error("Project media error", mediaError);
      }

      document.title = `${project.title} — Studio`;
      const descriptionMeta = document.querySelector('meta[name="description"]');
      if (descriptionMeta && project.short_description) {
        descriptionMeta.content = project.short_description.slice(0, 160);
      }

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
