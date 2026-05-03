const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const MAX_SIZE = 96;
const OUTPUTS = {
  tracks: path.join(ROOT, "assets", "picker-icons", "tracks"),
  characters: path.join(ROOT, "assets", "picker-icons", "characters"),
  vehicles: path.join(ROOT, "assets", "picker-icons", "vehicles"),
};

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8").replace(/^\uFEFF/, ""));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function toSourcePath(relativePath) {
  const normalized = String(relativePath || "").replace(/\\/g, "/").trim();
  if (!normalized) return "";
  return path.join(ROOT, normalized);
}

function outputPath(group, sourcePath) {
  const parsed = path.parse(sourcePath);
  return path.join(OUTPUTS[group], `${parsed.name}.png`);
}

async function writePickerIcon(group, sourcePath) {
  const targetPath = outputPath(group, sourcePath);
  ensureDir(path.dirname(targetPath));
  await sharp(sourcePath)
    .resize({
      width: MAX_SIZE,
      height: MAX_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png({
      compressionLevel: 9,
      palette: true,
      quality: 90,
      effort: 10,
    })
    .toFile(targetPath);
  return targetPath;
}

function collectJobs() {
  const jobs = [];
  const seen = new Set();

  const trackMap = readJson("track_icon_map.json");
  for (const iconPath of Object.values(trackMap || {})) {
    const sourcePath = toSourcePath(iconPath);
    if (!sourcePath || !fs.existsSync(sourcePath)) continue;
    const key = `tracks|${sourcePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({ group: "tracks", sourcePath });
  }

  const comboMap = readJson("combo_icon_map.json");
  for (const item of Object.values(comboMap?.characters || {})) {
    const sourcePath = toSourcePath(item?.path);
    if (!sourcePath || !fs.existsSync(sourcePath)) continue;
    const key = `characters|${sourcePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({ group: "characters", sourcePath });
  }

  for (const item of Object.values(comboMap?.vehicles || {})) {
    const sourcePath = toSourcePath(item?.path);
    if (!sourcePath || !fs.existsSync(sourcePath)) continue;
    const key = `vehicles|${sourcePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({ group: "vehicles", sourcePath });
  }

  return jobs;
}

(async () => {
  const jobs = collectJobs();
  for (const dir of Object.values(OUTPUTS)) ensureDir(dir);
  const written = [];
  for (const job of jobs) {
    written.push(await writePickerIcon(job.group, job.sourcePath));
  }
  const totalBytes = written.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  console.log(`Generated ${written.length} picker icons (${Math.round(totalBytes / 1024)} KB total).`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
