import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, "assets");
const THRESHOLD_BYTES = 250 * 1024;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".svg"]);

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function relativePath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

function pngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== signature) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(buffer) {
  if (buffer.length < 30 || buffer.subarray(0, 4).toString("ascii") !== "RIFF" || buffer.subarray(8, 12).toString("ascii") !== "WEBP") return null;
  const chunkType = buffer.subarray(12, 16).toString("ascii");
  if (chunkType === "VP8X" && buffer.length >= 30) {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { width, height };
  }
  if (chunkType === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function svgDimensions(text) {
  const widthMatch = text.match(/\bwidth=["']?([\d.]+)(?:px)?["']?/i);
  const heightMatch = text.match(/\bheight=["']?([\d.]+)(?:px)?["']?/i);
  if (widthMatch && heightMatch) {
    return { width: Number(widthMatch[1]), height: Number(heightMatch[1]) };
  }
  const viewBoxMatch = text.match(/\bviewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  if (viewBoxMatch) {
    return { width: Number(viewBoxMatch[1]), height: Number(viewBoxMatch[2]) };
  }
  return null;
}

async function dimensionsFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buffer = await readFile(filePath);
  if (ext === ".png") return pngDimensions(buffer);
  if (ext === ".jpg" || ext === ".jpeg") return jpegDimensions(buffer);
  if (ext === ".webp") return webpDimensions(buffer);
  if (ext === ".svg") return svgDimensions(buffer.toString("utf8"));
  return null;
}

function formatDimensions(dimensions) {
  if (!dimensions || !Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height)) return "dimensions unavailable";
  return `${Math.round(dimensions.width)}x${Math.round(dimensions.height)}`;
}

const files = await walk(ASSETS_DIR);
const largeAssets = [];

for (const filePath of files) {
  const info = await stat(filePath);
  if (info.size < THRESHOLD_BYTES) continue;
  largeAssets.push({
    filePath,
    size: info.size,
    dimensions: await dimensionsFor(filePath).catch(() => null),
  });
}

largeAssets.sort((a, b) => b.size - a.size || relativePath(a.filePath).localeCompare(relativePath(b.filePath)));

if (!largeAssets.length) {
  console.log("No image assets over 250 KB found under assets/.");
} else {
  console.log(`Image assets over 250 KB under assets/ (${largeAssets.length}):`);
  for (const asset of largeAssets) {
    console.log(`${relativePath(asset.filePath)} - ${formatSize(asset.size)} - ${formatDimensions(asset.dimensions)}`);
  }
}
