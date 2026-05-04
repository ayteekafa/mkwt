const { spawnSync } = require("node:child_process");
const { readdirSync, statSync } = require("node:fs");
const { join, relative } = require("node:path");

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", "dist", "node_modules"]);
const JS_RE = /\.(?:cjs|js|mjs)$/i;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) walk(fullPath, files);
    else if (JS_RE.test(entry)) files.push(fullPath);
  }
  return files;
}

const failures = [];
for (const file of walk(ROOT)) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failures.push({
      file: relative(ROOT, file),
      output: (result.stderr || result.stdout || "").trim(),
    });
  }
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`JS syntax failed: ${failure.file}`);
    console.error(failure.output);
  }
  process.exit(1);
}

console.log(`JS syntax ok (${walk(ROOT).length} files).`);
