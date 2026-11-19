// Pixel-diffs two snapshot trees and writes the report the Cipher visual check uploads.
// node compare.mjs <before-dir> <after-dir> <out-dir> [scope.json]
// PIXEL_THRESHOLD sets pixelmatch's per-pixel color threshold (0 to 1, default 0.1); 0 counts any changed pixel.
// Writes out/summary.json, out/summary.md and out/changed/<name>.{before,after,diff}.png.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const [before, after, out, scopeFile] = process.argv.slice(2);
const threshold = Number(process.env.PIXEL_THRESHOLD ?? 0.1);
const list = (root, dir = "") =>
  existsSync(path.join(root, dir))
    ? readdirSync(path.join(root, dir)).flatMap((name) => {
        const rel = path.join(dir, name);
        return statSync(path.join(root, rel)).isDirectory() ? list(root, rel) : rel.endsWith(".png") ? [rel] : [];
      })
    : [];
const a = new Set(list(before));
const b = new Set(list(after));
const result = { changed: [], added: [], removed: [], unchanged: 0, total: new Set([...a, ...b]).size };
const save = (key, kind, source) => {
  const file = path.join(out, "changed", key.replace(/\.png$/, "." + kind + ".png"));
  mkdirSync(path.dirname(file), { recursive: true });
  if (Buffer.isBuffer(source)) writeFileSync(file, source);
  else copyFileSync(source, file);
};
for (const key of [...b].sort()) {
  if (!a.has(key)) {
    result.added.push(key);
    save(key, "after", path.join(after, key));
    continue;
  }
  const x = readFileSync(path.join(before, key));
  const y = readFileSync(path.join(after, key));
  if (x.equals(y)) { result.unchanged += 1; continue; }
  const px = PNG.sync.read(x);
  const py = PNG.sync.read(y);
  const resized = px.width !== py.width || px.height !== py.height;
  const width = Math.max(px.width, py.width);
  const height = Math.max(px.height, py.height);
  const pad = (png) => {
    if (png.width === width && png.height === height) return png.data;
    const out = new PNG({ width, height });
    PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
    return out.data;
  };
  const diff = new PNG({ width, height });
  const pixels = pixelmatch(pad(px), pad(py), diff.data, width, height, { threshold, includeAA: threshold === 0 });
  if (pixels === 0 && !resized) { result.unchanged += 1; continue; }
  result.changed.push({ file: key, pixels: resized ? pixels + " (size " + px.width + "x" + px.height + " -> " + py.width + "x" + py.height + ")" : pixels });
  save(key, "before", path.join(before, key));
  save(key, "after", path.join(after, key));
  save(key, "diff", PNG.sync.write(diff));
}
for (const key of [...a].sort()) if (!b.has(key)) result.removed.push(key);
const scope = scopeFile && existsSync(scopeFile) ? JSON.parse(readFileSync(scopeFile, "utf8")) : null;
const summary = { ...result, scope };
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "summary.json"), JSON.stringify(summary, null, 2));
const lines = [
  "## Cipher visual check",
  "",
  scope ? "Base " + scope.base.ref + " (" + scope.base.source.slice(0, 7) + "), candidate " + scope.candidate.ref + " (" + scope.candidate.source.slice(0, 7) + "). Scope: " + (scope.mode === "scoped" && !scope.full ? "scoped to " + (scope.pages?.length ?? 0) + " pages" : "full" + (scope.fullReasons?.length ? " (" + scope.fullReasons.join("; ") + ")" : "")) + "." : "",
  "",
  "**" + result.changed.length + " changed** of " + result.total + " snapshots, " + result.added.length + " added, " + result.removed.length + " removed, " + result.unchanged + " unchanged.",
  "",
];
if (result.changed.length) lines.push("| Changed | Pixels |", "| --- | --- |", ...result.changed.map((c) => "| " + c.file + " | " + c.pixels + " |"), "");
if (result.added.length) lines.push("Added: " + result.added.join(", "), "");
if (result.removed.length) lines.push("Removed: " + result.removed.join(", "), "");
writeFileSync(path.join(out, "summary.md"), lines.join("\n"));
console.log(lines.join("\n"));
