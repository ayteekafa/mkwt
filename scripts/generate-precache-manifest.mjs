import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(repoRoot, "dist");
const baseUrl = "https://mkwt.local/";

function isIgnoredUrl(value){
  const raw = String(value || "").trim();
  if (!raw) return true;
  if (raw.startsWith("#")) return true;
  return /^(?:https?:|data:|blob:|mailto:|tel:|javascript:)/i.test(raw);
}

function distPathFor(pathname){
  const clean = pathname.replace(/^\/+/, "");
  if (!clean) return join(distDir, "index.html");
  return join(distDir, clean);
}

function normalizeLocalUrl(value, htmlFile){
  const raw = String(value || "").trim();
  if (isIgnoredUrl(raw)) return "";
  let url;
  try {
    url = new URL(raw, new URL(htmlFile, baseUrl));
  } catch {
    return "";
  }
  if (url.origin !== baseUrl.slice(0, -1)) return "";
  const pathname = url.pathname || "/";
  if (!existsSync(distPathFor(pathname))) return "";
  return `${pathname}${url.search || ""}`;
}

function extractAssetUrls(html, htmlFile){
  const urls = [];
  const tagPattern = /<(link|script|img)\b[^>]*>/gi;
  const attrPattern = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let tagMatch;
  while ((tagMatch = tagPattern.exec(html))) {
    const tag = tagMatch[0];
    attrPattern.lastIndex = 0;
    let attrMatch;
    while ((attrMatch = attrPattern.exec(tag))) {
      const normalized = normalizeLocalUrl(attrMatch[1] ?? attrMatch[2] ?? attrMatch[3], htmlFile);
      if (normalized) urls.push(normalized);
    }
  }
  return urls;
}

if (!existsSync(distDir)) {
  throw new Error("dist directory does not exist. Run vite build first.");
}

const entries = new Set(["/"]);
const htmlFiles = readdirSync(distDir).filter((file) => file.endsWith(".html")).sort();

for (const htmlFile of htmlFiles) {
  entries.add(`/${htmlFile}`);
  const html = readFileSync(join(distDir, htmlFile), "utf8");
  for (const url of extractAssetUrls(html, htmlFile)) {
    entries.add(url);
  }
}

const manifest = Array.from(entries).sort((a, b) => a.localeCompare(b));
const body = `self.__MKWTPRECACHE__ = ${JSON.stringify(manifest, null, 2)};\n`;
writeFileSync(join(distDir, "precache-manifest.js"), body);

console.log(`Generated dist/precache-manifest.js with ${manifest.length} entries.`);
