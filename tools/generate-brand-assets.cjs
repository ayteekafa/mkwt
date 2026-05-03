const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);

const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if(!chromePath){
  throw new Error("Chrome was not found. Set CHROME_PATH to render brand assets.");
}

const colors = {
  bg: "#05060a",
  card: "#0b0f18",
  card2: "#0f1524",
  blue: "#2f6fff",
  red: "#ef4444",
  ice: "#93c5fd",
  text: "#ffffff",
  muted: "#a7b3c6"
};

function ensureDir(file){
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function sleep(ms){
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options){
  const response = await fetch(url, options);
  if(!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

function cdpClient(wsUrl){
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    const listeners = new Map();
    const client = {
      send(method, params = {}){
        const id = nextId++;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise((res, rej) => pending.set(id, { res, rej, method }));
      },
      on(method, fn){
        if(!listeners.has(method)) listeners.set(method, []);
        listeners.get(method).push(fn);
      },
      close(){
        ws.close();
      }
    };
    ws.onopen = () => resolve(client);
    ws.onerror = () => reject(new Error("CDP websocket error"));
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if(message.id && pending.has(message.id)){
        const item = pending.get(message.id);
        pending.delete(message.id);
        if(message.error) item.rej(new Error(`${item.method}: ${message.error.message}`));
        else item.res(message.result);
        return;
      }
      if(message.method && listeners.has(message.method)){
        for(const fn of listeners.get(message.method)) fn(message.params || {});
      }
    };
  });
}

async function waitForChrome(port){
  const deadline = Date.now() + 12000;
  while(Date.now() < deadline){
    try{
      return await fetchJson(`http://127.0.0.1:${port}/json/version`);
    }catch(_){
      await sleep(150);
    }
  }
  throw new Error("Chrome CDP did not start.");
}

async function waitForLoad(client, timeoutMs = 5000){
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if(!done){
        done = true;
        resolve();
      }
    }, timeoutMs);
    client.on("Page.loadEventFired", () => {
      if(!done){
        done = true;
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

function brandSvg(size){
  const s = size;
  const pad = Math.round(s * 0.08);
  const radius = Math.round(s * 0.22);
  const mkwtSize = Math.round(s * 0.22);
  const bySize = Math.round(s * 0.085);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${colors.bg}"/>
      <stop offset="0.55" stop-color="${colors.card}"/>
      <stop offset="1" stop-color="${colors.card2}"/>
    </linearGradient>
    <linearGradient id="stripe" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${colors.blue}"/>
      <stop offset="0.55" stop-color="${colors.ice}"/>
      <stop offset="1" stop-color="${colors.red}"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${Math.round(s * 0.018)}" stdDeviation="${Math.round(s * 0.018)}" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#bg)"/>
  <rect x="${pad}" y="${pad}" width="${s - pad * 2}" height="${s - pad * 2}" rx="${Math.round(radius * 0.72)}" fill="none" stroke="${colors.blue}" stroke-opacity="0.78" stroke-width="${Math.max(2, Math.round(s * 0.012))}"/>
  <rect x="${pad + Math.round(s * 0.018)}" y="${pad + Math.round(s * 0.018)}" width="${s - (pad + Math.round(s * 0.018)) * 2}" height="${s - (pad + Math.round(s * 0.018)) * 2}" rx="${Math.round(radius * 0.58)}" fill="none" stroke="${colors.red}" stroke-opacity="0.52" stroke-width="${Math.max(1, Math.round(s * 0.006))}"/>
  <circle cx="${Math.round(s * 0.18)}" cy="${Math.round(s * 0.18)}" r="${Math.round(s * 0.09)}" fill="${colors.blue}" opacity="0.22"/>
  <circle cx="${Math.round(s * 0.84)}" cy="${Math.round(s * 0.82)}" r="${Math.round(s * 0.12)}" fill="${colors.red}" opacity="0.18"/>
  <g filter="url(#softShadow)">
    <text x="50%" y="${Math.round(s * 0.49)}" text-anchor="middle" dominant-baseline="middle"
      font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${mkwtSize}" font-weight="900"
      letter-spacing="${Math.round(s * 0.004)}" fill="${colors.text}">MKWT</text>
    <rect x="${Math.round(s * 0.24)}" y="${Math.round(s * 0.61)}" width="${Math.round(s * 0.52)}" height="${Math.max(3, Math.round(s * 0.022))}" rx="${Math.round(s * 0.011)}" fill="url(#stripe)"/>
    <text x="50%" y="${Math.round(s * 0.72)}" text-anchor="middle" dominant-baseline="middle"
      font-family="Arial, Helvetica, sans-serif" font-size="${bySize}" font-weight="800"
      fill="${colors.muted}">by Aytee</text>
  </g>
</svg>`;
}

function ogSvg(){
  const w = 1200;
  const h = 630;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${colors.bg}"/>
      <stop offset="0.54" stop-color="${colors.card}"/>
      <stop offset="1" stop-color="${colors.card2}"/>
    </linearGradient>
    <linearGradient id="stripe" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${colors.blue}"/>
      <stop offset="0.56" stop-color="${colors.ice}"/>
      <stop offset="1" stop-color="${colors.red}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="20" stdDeviation="18" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <circle cx="144" cy="130" r="115" fill="${colors.blue}" opacity="0.18"/>
  <circle cx="1042" cy="510" r="154" fill="${colors.red}" opacity="0.16"/>
  <rect x="62" y="62" width="1076" height="506" rx="60" fill="${colors.card}" fill-opacity="0.62" stroke="${colors.blue}" stroke-opacity="0.72" stroke-width="5"/>
  <rect x="84" y="84" width="1032" height="462" rx="46" fill="none" stroke="${colors.red}" stroke-opacity="0.42" stroke-width="3"/>
  <g filter="url(#shadow)">
    <text x="600" y="274" text-anchor="middle" dominant-baseline="middle"
      font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="150" font-weight="900"
      fill="${colors.text}">MKWT</text>
    <rect x="354" y="362" width="492" height="22" rx="11" fill="url(#stripe)"/>
    <text x="600" y="445" text-anchor="middle" dominant-baseline="middle"
      font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="800" fill="${colors.muted}">by Aytee</text>
  </g>
  <text x="600" y="516" text-anchor="middle" dominant-baseline="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" fill="${colors.ice}" opacity="0.92">Mario Kart World tracker</text>
</svg>`;
}

async function renderSvgToPng(client, svg, output, width, height){
  ensureDir(output);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mkwt-brand-"));
  const svgPath = path.join(tmpDir, "asset.svg");
  const htmlPath = path.join(tmpDir, "render.html");
  fs.writeFileSync(svgPath, svg);
  fs.writeFileSync(htmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${width}px;height:${height}px;background:transparent;overflow:hidden}img{display:block;width:${width}px;height:${height}px}</style></head><body><img src="asset.svg" alt=""></body></html>`);
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  });
  await client.send("Page.navigate", { url: `file:///${htmlPath.replace(/\\/g, "/")}` });
  await waitForLoad(client);
  await sleep(80);
  const capture = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false
  });
  fs.writeFileSync(output, Buffer.from(capture.data, "base64"));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function icoFromPngs(entries){
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const directory = Buffer.alloc(entries.length * 16);
  let offset = 6 + directory.length;
  entries.forEach((entry, index) => {
    const pos = index * 16;
    directory[pos] = entry.size >= 256 ? 0 : entry.size;
    directory[pos + 1] = entry.size >= 256 ? 0 : entry.size;
    directory[pos + 2] = 0;
    directory[pos + 3] = 0;
    directory.writeUInt16LE(1, pos + 4);
    directory.writeUInt16LE(32, pos + 6);
    directory.writeUInt32LE(entry.png.length, pos + 8);
    directory.writeUInt32LE(offset, pos + 12);
    offset += entry.png.length;
  });
  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]);
}

async function main(){
  const port = 9800 + Math.floor(Math.random() * 200);
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "mkwt-brand-chrome-"));
  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
  ], { stdio: "ignore" });

  try{
    await waitForChrome(port);
    const target = await fetchJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    const client = await cdpClient(target.webSocketDebuggerUrl);
    await client.send("Page.enable");

    const outputs = [
      { file: "favicon-32.png", size: 32 },
      { file: "apple-touch-icon.png", size: 180 },
      { file: "icons/icon-192.png", size: 192 },
      { file: "icons/icon-512.png", size: 512 },
      { file: "icons/mkwt-dendo-192.png", size: 192 },
      { file: "icons/mkwt-dendo-512.png", size: 512 }
    ];

    for(const output of outputs){
      await renderSvgToPng(client, brandSvg(output.size), path.join(root, output.file), output.size, output.size);
    }

    const icoEntries = [];
    for(const size of [16, 32, 48]){
      const tmpPng = path.join(os.tmpdir(), `mkwt-favicon-${size}-${Date.now()}.png`);
      await renderSvgToPng(client, brandSvg(size), tmpPng, size, size);
      icoEntries.push({ size, png: fs.readFileSync(tmpPng) });
      fs.rmSync(tmpPng, { force: true });
    }
    fs.writeFileSync(path.join(root, "favicon.ico"), icoFromPngs(icoEntries));

    await renderSvgToPng(client, ogSvg(), path.join(root, "og-card.png"), 1200, 630);
    client.close();
  }finally{
    chrome.kill("SIGKILL");
    await sleep(300);
    try{
      fs.rmSync(profileDir, { recursive: true, force: true });
    }catch(_){}
  }

  console.log("Generated MKWT Dendo Denim brand assets.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
