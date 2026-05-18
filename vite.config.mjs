import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const outDir = resolve(rootDir, "dist");

const htmlEntries = Object.fromEntries(
  readdirSync(rootDir)
    .filter((file) => file.endsWith(".html"))
    .map((file) => [basename(file, ".html"), resolve(rootDir, file)])
);

const copyDirs = new Set([
  "assets",
  "icons",
]);

const copyFiles = new Set([
  "_headers",
  "_redirects",
  "_worker.js",
  "apple-touch-icon.png",
  "favicon-32.png",
  "favicon.ico",
  "manifest.webmanifest",
  "og-card.png",
  "robots.txt",
  "sitemap.xml"
]);

const copyExtensions = new Set([".css", ".js", ".json", ".webmanifest"]);
const skipRootFiles = new Set(["package.json", "package-lock.json"]);

function copyIfExists(from, to){
  if(!existsSync(from)) return;
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

function copyStaticRootAssets(){
  return {
    name: "mkwt-copy-static-root-assets",
    apply: "build",
    closeBundle(){
      for(const dir of copyDirs){
        copyIfExists(resolve(rootDir, dir), resolve(outDir, dir));
      }
      for(const entry of readdirSync(rootDir)){
        const source = resolve(rootDir, entry);
        if(!statSync(source).isFile()) continue;
        if(skipRootFiles.has(entry)) continue;
        if(entry.endsWith(".html")) continue;
        if(copyFiles.has(entry) || copyExtensions.has(extname(entry))){
          copyIfExists(source, resolve(outDir, entry));
        }
      }
    }
  };
}

function cleanStaticOutDir(){
  return {
    name: "mkwt-clean-static-out-dir",
    apply: "build",
    buildStart(){
      rmSync(outDir, { recursive: true, force: true });
    }
  };
}

function disableServiceWorkerInDev(){
  const devServiceWorker = `
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("mkwt-")).map((key) => caches.delete(key)));
    await self.registration.unregister();
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
`.trimStart();

  return {
    name: "mkwt-disable-service-worker-in-dev",
    apply: "serve",
    configureServer(server){
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url || "/", "http://localhost").pathname;
        if(pathname !== "/sw.js") return next();
        res.statusCode = 200;
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        res.end(devServiceWorker);
      });
    }
  };
}

function serveRootCssAsStylesheets(){
  return {
    name: "mkwt-serve-root-css-as-stylesheets",
    configureServer(server){
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url || "/", "http://localhost").pathname;
        if(!pathname.endsWith(".css")) return next();
        const filename = decodeURIComponent(pathname.slice(1));
        if(filename.includes("/") || filename.includes("\\") || filename.includes("..")) return next();
        const source = resolve(rootDir, filename);
        if(!existsSync(source) || !statSync(source).isFile()) return next();
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/css; charset=utf-8");
        res.end(readFileSync(source));
      });
    }
  };
}

function serveCleanHtmlRoutes(){
  return {
    name: "mkwt-serve-clean-html-routes",
    apply: "serve",
    configureServer(server){
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        let pathname = url.pathname || "/";
        try { pathname = decodeURIComponent(pathname); } catch (e) { return next(); }
        if(pathname === "/" || pathname.includes(".") || pathname.includes("\\") || pathname.includes("..")) return next();
        if(pathname.endsWith("/")) pathname = pathname.slice(0, -1);
        const filename = `${pathname.replace(/^\/+/, "")}.html`;
        if(!htmlEntries[basename(filename, ".html")]) return next();
        req.url = `/${filename}${url.search || ""}`;
        return next();
      });
    }
  };
}

export default defineConfig({
  root: rootDir,
  appType: "mpa",
  publicDir: false,
  plugins: [
    serveCleanHtmlRoutes(),
    disableServiceWorkerInDev(),
    serveRootCssAsStylesheets(),
    cleanStaticOutDir(),
    copyStaticRootAssets()
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8788",
        changeOrigin: true
      }
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  },
  build: {
    outDir,
    emptyOutDir: false,
    rollupOptions: {
      input: htmlEntries
    }
  }
});
