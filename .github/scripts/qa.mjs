import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const publicPages = [
  "index.html",
  "approach.html",
  "projects.html",
  "identity.html",
  "contacts.html",
  "request.html",
  "project.html",
  "offline.html"
];

const requiredProdUrls = [
  "https://toolsforyourwork.github.io/custom-tools-studio/",
  "https://toolsforyourwork.github.io/custom-tools-studio/approach.html",
  "https://toolsforyourwork.github.io/custom-tools-studio/projects.html",
  "https://toolsforyourwork.github.io/custom-tools-studio/identity.html",
  "https://toolsforyourwork.github.io/custom-tools-studio/contacts.html",
  "https://toolsforyourwork.github.io/custom-tools-studio/request.html",
  "https://toolsforyourwork.github.io/custom-tools-studio/admin/",
  "https://toolsforyourwork.github.io/custom-tools-studio/styles.css",
  "https://toolsforyourwork.github.io/custom-tools-studio/script.js",
  "https://toolsforyourwork.github.io/custom-tools-studio/project.js",
  "https://toolsforyourwork.github.io/custom-tools-studio/manifest.webmanifest",
  "https://toolsforyourwork.github.io/custom-tools-studio/sw.js",
  "https://toolsforyourwork.github.io/custom-tools-studio/robots.txt",
  "https://toolsforyourwork.github.io/custom-tools-studio/sitemap.xml"
];

const errors = [];
const warnings = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function attr(tag, name) {
  const pattern = "\\b" + name + "\\s*=\\s*[\\\"']([^\\\"']*)[\\\"']";
  const match = tag.match(new RegExp(pattern, "i"));
  return match?.[1] ?? null;
}

function localTargetExists(fromFile, rawUrl) {
  if (!rawUrl) return true;

  const value = rawUrl.trim();
  if (
    !value ||
    value.startsWith("#") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("mailto:") ||
    value.startsWith("tel:") ||
    value.startsWith("data:") ||
    value.startsWith("javascript:")
  ) {
    return true;
  }

  const withoutQuery = value.split("#")[0].split("?")[0];
  if (!withoutQuery) return true;

  let target;

  if (withoutQuery.startsWith("/custom-tools-studio/")) {
    target = withoutQuery.slice("/custom-tools-studio/".length);
  } else if (withoutQuery === "/custom-tools-studio") {
    target = "";
  } else if (withoutQuery.startsWith("/")) {
    return true;
  } else {
    target = path.normalize(
      path.join(path.dirname(fromFile), decodeURIComponent(withoutQuery))
    );
  }

  if (!target || target === ".") target = "index.html";
  if (target.endsWith("/")) target = path.join(target, "index.html");

  return fs.existsSync(path.join(root, target));
}

for (const file of publicPages) {
  const html = read(file);

  assert(/<html[^>]*lang=["']ru["']/i.test(html), `${file}: missing lang=ru`);
  assert(/<meta[^>]*name=["']viewport["']/i.test(html), `${file}: missing viewport`);
  assert(/<title>[^<]+<\/title>/i.test(html), `${file}: missing title`);
  assert(/<meta[^>]*name=["']theme-color["']/i.test(html), `${file}: missing theme-color`);
  assert(/<link[^>]*rel=["']manifest["']/i.test(html), `${file}: missing manifest`);

  if (file !== "offline.html") {
    assert(/<meta[^>]*name=["']description["']/i.test(html), `${file}: missing description`);
  }

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    assert(attr(match[0], "alt") !== null, `${file}: img without alt`);
  }

  for (const match of html.matchAll(/<button\b[^>]*>/gi)) {
    assert(attr(match[0], "type") !== null, `${file}: button without type`);
  }

  for (const match of html.matchAll(/<(?:a|link|script|img)\b[^>]*(?:href|src)=["'][^"']+["'][^>]*>/gi)) {
    const tag = match[0];
    const rawUrl = attr(tag, "href") ?? attr(tag, "src");
    assert(
      localTargetExists(file, rawUrl),
      `${file}: broken local reference ${rawUrl}`
    );
  }

  const menu = html.match(/<button\b[^>]*id=["']menu["'][^>]*>/i)?.[0];
  if (menu) {
    assert(attr(menu, "aria-controls") === "nav", `${file}: menu missing aria-controls=nav`);
    assert(attr(menu, "aria-expanded") === "false", `${file}: menu missing initial aria-expanded=false`);
  }
}

const adminHtml = read("admin/index.html");
assert(/noindex/i.test(adminHtml), "admin/index.html: missing noindex");

for (const match of adminHtml.matchAll(/<img\b[^>]*>/gi)) {
  assert(attr(match[0], "alt") !== null, "admin/index.html: img without alt");
}

for (const match of adminHtml.matchAll(/<button\b[^>]*>/gi)) {
  assert(attr(match[0], "type") !== null, "admin/index.html: button without type");
}

const manifest = JSON.parse(read("manifest.webmanifest"));
assert(Boolean(manifest.name), "manifest: missing name");
assert(Boolean(manifest.short_name), "manifest: missing short_name");
assert(Boolean(manifest.start_url), "manifest: missing start_url");
assert(Boolean(manifest.scope), "manifest: missing scope");
assert(["standalone", "fullscreen", "minimal-ui"].includes(manifest.display), "manifest: non-installable display");
assert(manifest.icons?.some(icon => icon.sizes === "192x192"), "manifest: missing 192x192 icon");
assert(manifest.icons?.some(icon => icon.sizes === "512x512"), "manifest: missing 512x512 icon");

const styles = read("styles.css");
assert(styles.includes(":focus-visible"), "styles.css: missing focus-visible");
assert(styles.includes("prefers-reduced-motion"), "styles.css: missing reduced-motion support");

const script = read("script.js");
assert(script.includes('setAttribute("aria-expanded"'), "script.js: menu aria-expanded is not updated");
assert(script.includes('event.key === "Escape"'), "script.js: mobile menu cannot close with Escape");

const serviceWorker = read("sw.js");
assert(serviceWorker.includes("offline.html"), "sw.js: offline fallback missing");
assert(serviceWorker.includes('request.destination === "script"'), "sw.js: scripts are not network-first");
assert(serviceWorker.includes('request.destination === "style"'), "sw.js: styles are not network-first");

async function fetchWithRetry(url, attempts = 6) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "custom-tools-production-qa" }
      });

      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  throw lastError;
}

if (process.env.QA_PRODUCTION === "1") {
  for (const url of requiredProdUrls) {
    try {
      const response = await fetchWithRetry(url);
      console.log(`OK ${response.status} ${url}`);
    } catch (error) {
      errors.push(`production: ${url}: ${error.message}`);
    }
  }

  try {
    const response = await fetchWithRetry(
      "https://bpdqosfgxqawbzljafgb.supabase.co/functions/v1/health-check"
    );
    const health = await response.json();
    assert(health?.ok === true, "production health-check returned ok=false");
    assert(health?.checks?.site?.ok === true, "health-check: site failed");
    assert(health?.checks?.database?.ok === true, "health-check: database failed");
    assert(health?.checks?.content?.ok === true, "health-check: content API failed");
    assert(health?.checks?.form?.ok === true, "health-check: form failed");
    assert(health?.checks?.telegram?.ok === true, "health-check: Telegram failed");
  } catch (error) {
    errors.push(`production health-check: ${error.message}`);
  }
}

for (const warning of warnings) console.warn("WARN", warning);

if (errors.length) {
  console.error("\nProduction QA failed:");
  for (const error of errors) console.error("-", error);
  process.exit(1);
}

console.log("\nProduction QA passed.");
