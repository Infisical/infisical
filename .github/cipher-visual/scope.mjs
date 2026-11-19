#!/usr/bin/env node
// Cipher visual check scoping. Given a Cipher checkout and two refs, lists the Cipher source files that
// changed, every public Cipher module those changes reach, and the pages (from a manifest) whose import
// graph uses one of them. Prints JSON. "full": true means scope cannot be narrowed and every page renders.
//
// node scope.mjs --cipher <dir> --base <ref> --candidate <ref> [--pages <manifest.json>] [--showcase]
//   --showcase: the pages are Cipher's own showcase, so changes under site/ count too.
//   manifest: { "root": "frontend/src", "alias": { "@app/": "frontend/src/" }, "pages": [{ "id": "x", "entries": ["frontend/src/pages/x.tsx"] }] }
//   "ignore": [paths] lists consumer files the walk never enters, such as a generated route tree that imports every page.
//   Paths in the manifest are relative to the manifest's directory unless absolute.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const args = Object.fromEntries(
  argv.reduce((acc, value, i, all) => (value.startsWith("--") ? [...acc, [value.slice(2), all[i + 1]?.startsWith("--") ? true : all[i + 1] ?? true]] : acc), [])
);
const showcase = Boolean(args.showcase);
const cipher = path.resolve(args.cipher);
const git = (...a) => execFileSync("git", ["-C", cipher, ...a], { encoding: "utf8" }).trim();

// A release tag is the source commit plus a commit that only adds dist/ and rewrites package.json.
const sourceOf = (ref) => {
  const sha = git("rev-parse", ref + "^{commit}");
  try {
    const parent = git("rev-parse", sha + "^");
    const outside = git("diff", "--name-only", parent, sha, "--", ".", ":!dist", ":!package.json");
    const built = git("diff", "--name-only", parent, sha, "--", "dist");
    if (!outside && built) return parent;
  } catch {}
  return sha;
};

const FULL = [
  [/^src\/tokens\.(json|generated\.css)$/, "design tokens"],
  [/^src\/base\.css$/, "global CSS"],
  [/^src\/styles\.ts$/, "global CSS entry"],
  [/^src\/fonts\//, "fonts"],
  [/^src\/scope\.tsx$/, "CipherScope"],
  [/^src\/lib\/(themes|theme-registry|boot-theme|boot-theme-keys|frame-context|overlay-sections|motion|utils)\.tsx?$/, "theme, frame or overlay primitive"],
  [/^src\/ui\/(frame|overlay|helpers|text|controls|button-geometry|button-material|menu|picker|popover|panes)\.module\.css$/, "frame, overlay or shared control CSS"],
  [/^src\/ui\/(card|dialog|alert-dialog|sheet|popover|dropdown-menu|context-menu|menu-content|menu-inset|tooltip|hover-card|scroll-area|layout|button)\.tsx?$/, "frame or overlay primitive"],
  [/^scripts\/tokens\.ts$/, "token build"],
  [/^(vite\.config\.ts|tsconfig\.build\.json)$/, "build pipeline"],
];
const IGNORE = [/^src\/THIRD_PARTY_NOTICES\.md$/, /\.md$/];

const base = sourceOf(args.base);
const candidate = sourceOf(args.candidate);
const changed = git("diff", "--name-only", base, candidate, "--", "src", "package.json", "package-lock.json", "scripts/tokens.ts", "vite.config.ts", "tsconfig.build.json", ...(showcase ? ["site"] : []))
  .split("\n").filter(Boolean).filter((f) => !IGNORE.some((re) => re.test(f)));

const fullReasons = [];
for (const file of changed) {
  if (file === "package.json" || file === "package-lock.json") {
    // Every release bumps the version, so compare the manifests without it.
    const read = (ref) => {
      const json = JSON.parse(git("show", ref + ":" + file));
      delete json.version;
      if (json.packages?.[""]) delete json.packages[""].version;
      if (file === "package.json") delete json.scripts;
      return JSON.stringify(json);
    };
    if (read(base) !== read(candidate)) fullReasons.push(file + ": dependencies, exports or installed versions changed");
    continue;
  }
  if (file.startsWith("site/")) {
    if (/^site\/src\/(examples\/|catalog\.json$)/.test(file)) continue;
    fullReasons.push(file + ": shared showcase file");
    continue;
  }
  const hit = FULL.find(([re]) => re.test(file));
  if (hit) fullReasons.push(file + ": " + hit[1]);
}

const EXT = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".css"];
const resolveFile = (p) => {
  if (existsSync(p) && statSync(p).isFile()) return p;
  for (const ext of EXT) if (existsSync(p + ext)) return p + ext;
  for (const ext of EXT) if (existsSync(path.join(p, "index" + ext))) return path.join(p, "index" + ext);
  return null;
};
const SPEC = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|@import\s+(?:url\()?["']([^"']+)["']|composes:[^;]*?from\s+["']([^"']+)["']/g;
const specifiers = (file) => {
  const text = readFileSync(file, "utf8");
  const out = [];
  for (const m of text.matchAll(SPEC)) out.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]);
  return out;
};

// Cipher's internal graph at the candidate, read from the working tree.
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const srcRoot = path.join(cipher, "src");
const srcFiles = walk(srcRoot).filter((f) => EXT.includes(path.extname(f)));
const importers = new Map();
const publicSpec = (abs) => {
  const rel = path.relative(srcRoot, abs).replace(/\.(tsx?|css)$/, "");
  if (rel === "scope") return "@infisical/cipher/scope";
  return /^(ui|patterns|lib|hooks)\//.test(rel) ? "@infisical/cipher/" + rel : null;
};
const resolveCipherSpec = (spec, from) => {
  if (spec.startsWith("@infisical/cipher/")) return resolveFile(path.join(srcRoot, spec.slice("@infisical/cipher/".length)));
  if (spec.startsWith(".")) return resolveFile(path.resolve(path.dirname(from), spec));
  return null;
};
for (const file of srcFiles)
  for (const spec of specifiers(file)) {
    const target = resolveCipherSpec(spec, file);
    if (!target) continue;
    if (!importers.has(target)) importers.set(target, new Set());
    importers.get(target).add(file);
  }
// Icon shapes are data keyed by name, so a change to one icon only reaches files that name it.
const ICON_DATA = "src/ui/icon-data.ts";
const iconBlocks = (ref) => {
  let text = "";
  try { text = git("show", ref + ":" + ICON_DATA); } catch { return new Map(); }
  const marks = [...text.matchAll(/^  "?([A-Za-z0-9_-]+)"?: \[/gm)];
  return new Map(marks.map((m, i) => [m[1], text.slice(m.index, marks[i + 1]?.index ?? text.length).replace(/,\s*$/, "").replace(/\s*};?\s*$/, "")]));
};
let icons = [];
if (changed.includes(ICON_DATA)) {
  const before = iconBlocks(base);
  const after = iconBlocks(candidate);
  icons = [...after.keys()].filter((k) => before.get(k) !== after.get(k));
  const dropped = [...before.keys()].filter((k) => !after.has(k));
  if (dropped.length) fullReasons.push("icons removed: " + dropped.join(", "));
}
const namesIcon = (file) => {
  const text = readFileSync(file, "utf8");
  if (/\bicon(Names|Shapes)\b/.test(text)) return true;
  // A quoted name counts within a few lines of an icon reference (a JSX expression can split name={ and
  // the string), so a "tag" or "key" elsewhere doesn't.
  const lines = text.split("\n");
  return lines.some(
    (line, i) =>
      icons.some((name) => line.includes('"' + name + '"') || line.includes("'" + name + "'")) &&
      lines.slice(Math.max(0, i - 4), i + 1).some((near) => /icon|name=|name:|media/i.test(near))
  );
};
const reached = new Set();
const queue = changed.filter((f) => f.startsWith("src/") && f !== ICON_DATA).map((f) => path.join(cipher, f)).filter((f) => existsSync(f));
const ICON_RENDERERS = new Set([ICON_DATA, "src/ui/icon.tsx"].map((f) => path.join(cipher, f)));
if (icons.length) for (const file of srcFiles) if (!ICON_RENDERERS.has(file) && namesIcon(file)) queue.push(file);
const removed = changed.filter((f) => f.startsWith("src/") && !existsSync(path.join(cipher, f)));
if (removed.length) fullReasons.push("removed files: " + removed.join(", "));
while (queue.length) {
  const file = queue.pop();
  if (reached.has(file)) continue;
  reached.add(file);
  for (const next of importers.get(file) ?? []) queue.push(next);
}
const modules = [...new Set([...reached].map(publicSpec).filter(Boolean))].sort();

let pages = null;
let unmapped = [];
if (args.pages) {
  const manifestPath = path.resolve(args.pages);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const rel = (p) => (path.isAbsolute(p) ? p : path.resolve(path.dirname(manifestPath), p));
  const alias = Object.entries(manifest.alias ?? {}).map(([k, v]) => [k, rel(v)]);
  const ignore = new Set((manifest.ignore ?? []).map((p) => resolveFile(rel(p))));
  const resolveConsumer = (spec, from) => {
    let file = null;
    if (spec.startsWith(".")) file = resolveFile(path.resolve(path.dirname(from), spec));
    else for (const [prefix, target] of alias) if (spec.startsWith(prefix)) { file = resolveFile(path.join(target, spec.slice(prefix.length))); break; }
    return file && ignore.has(file) ? null : file;
  };
  const cache = new Map();
  const iconFiles = new Set();
  const uses = (entry) => {
    iconFiles.clear();
    const seen = new Set();
    const found = new Set();
    const stack = [entry];
    while (stack.length) {
      const file = stack.pop();
      if (!file || seen.has(file)) continue;
      seen.add(file);
      let specs = cache.get(file);
      if (!specs) { specs = specifiers(file); cache.set(file, specs); }
      if (icons.length && !iconFiles.has(file) && namesIcon(file)) iconFiles.add(file);
      if (changedAbs.has(file)) found.add("changed: " + path.relative(cipher, file));
      for (const spec of specs) {
        if (spec.startsWith("@infisical/cipher")) found.add(spec.replace(/\.(css|js)$/, ""));
        else stack.push(resolveConsumer(spec, file));
      }
    }
    // Any Cipher component that takes an icon prop renders it through Icon, so naming one is enough.
    if (iconFiles.size && found.size) found.add("icon names: " + icons.join(", "));
    return found;
  };
  const changedAbs = new Set(changed.map((f) => path.join(cipher, f)));
  const catalogChanged = new Set();
  if (showcase && changed.includes("site/src/catalog.json")) {
    const entries = (ref) => new Map(JSON.parse(git("show", ref + ":site/src/catalog.json")).map((e) => [e.id, JSON.stringify(e)]));
    const before = entries(base);
    const after = entries(candidate);
    for (const [id, entry] of after) if (before.get(id) !== entry) catalogChanged.add(id);
    // Pages come from the candidate catalog, so a removed page can only be reported by a full run.
    const removedPages = [...before.keys()].filter((id) => !after.has(id));
    if (removedPages.length) fullReasons.push("showcase pages removed: " + removedPages.join(", "));
  }
  const touched = new Set(modules);
  if (icons.length) touched.add("icon names: " + icons.join(", "));
  pages = [];
  for (const page of manifest.pages) {
    const used = new Set(page.entries.flatMap((e) => [...uses(rel(e))]));
    if (!used.size) unmapped.push(page.id);
    const hits = [...used].filter((m) => touched.has(m) || m.startsWith("changed: "));
    if (catalogChanged.has(page.id)) hits.push("catalog entry");
    if (hits.length || !used.size) pages.push({ id: page.id, via: hits });
  }
}

console.log(JSON.stringify({
  base: { ref: args.base, source: base },
  candidate: { ref: args.candidate, source: candidate },
  full: fullReasons.length > 0,
  fullReasons,
  changed,
  icons,
  modules,
  pages,
  unmapped,
}, null, 2));
