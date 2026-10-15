#!/usr/bin/env node
// Compiles tokens.json into tokens.css and lists the component previews in components/catalog.json,
// which index.html reads. Run from anywhere: `node design-system/scripts/build.mjs`.
// tokens.json and the component folders are the source of truth; never edit the generated files by hand.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = JSON.parse(readFileSync(join(root, "tokens.json"), "utf8"));

const themes = tokens.color.themes.map((t) => t.id);
const [firstTheme, ...otherThemes] = themes;

const prop = (name) => `--${name.replace(/\./g, "\\.")}`;
const resolve = (value) =>
  typeof value === "string" ? value.replace(/^\{([^}]+)\}$/, (_, ref) => `var(${prop(ref)})`) : value;
const valueFor = (token, theme) => {
  if (typeof token.value !== "object") return theme === firstTheme ? token.value : undefined;
  return token.value[theme] ?? (theme === firstTheme ? undefined : token.value[firstTheme]);
};
const isThemed = (token) => typeof token.value === "object";

// Families whose values change per theme go in the theme blocks; the rest are global.
const familyKeys = Object.keys(tokens).filter(
  (key) => key !== "type" && Array.isArray(tokens[key]?.tokens)
);
const themedTokens = familyKeys.flatMap((key) => tokens[key].tokens.filter((t) => key === "color" || isThemed(t)));
const globalTokens = familyKeys.flatMap((key) =>
  key === "color" ? [] : tokens[key].tokens.filter((t) => !isThemed(t))
);

const block = (selector, lines) => `${selector} {\n${lines.map((l) => `  ${l}`).join("\n")}\n}\n`;
const out = [`/* ${tokens.name}, generated from tokens.json by scripts/build.mjs. Do not edit. */\n`];

for (const font of tokens.type.fonts ?? []) {
  out.push(
    block("@font-face", [
      `font-family: "${font.family}";`,
      `src: url("${font.file}") format("woff2");`,
      `font-weight: ${font.weight};`,
      `font-style: ${font.style ?? "normal"};`,
      "font-display: swap;"
    ])
  );
}

out.push(
  block(
    `:root,\n[data-theme="${firstTheme}"]`,
    themedTokens.map((t) => `${prop(t.name)}: ${resolve(valueFor(t, firstTheme))};`)
  )
);

for (const theme of otherThemes) {
  out.push(
    block(
      `[data-theme="${theme}"]`,
      themedTokens
        .map((t) => [t, valueFor(t, theme)])
        .filter(([, v]) => v !== undefined)
        .map(([t, v]) => `${prop(t.name)}: ${resolve(v)};`)
    )
  );
}

out.push(
  block(":root", [
    ...globalTokens.map((t) => `${prop(t.name)}: ${t.value};`),
    ...Object.entries(tokens.type.families).map(([key, stack]) => `--font-${key}: ${stack};`)
  ])
);

const cssProps = {
  fontSize: "font-size",
  lineHeight: "line-height",
  fontWeight: "font-weight",
  letterSpacing: "letter-spacing",
  fontStyle: "font-style",
  textTransform: "text-transform",
  fontStretch: "font-stretch"
};
for (const group of tokens.type.groups) {
  for (const style of group.styles) {
    const lines = [`font-family: var(--font-${style.family ?? group.family});`];
    for (const [key, css] of Object.entries(cssProps)) {
      if (style[key] !== undefined) lines.push(`${css}: ${style[key]};`);
    }
    out.push(block(`.${style.name}`, lines));
  }
}

writeFileSync(join(root, "tokens.css"), out.join("\n"));
console.log(`tokens.css: ${themedTokens.length} themed and ${globalTokens.length} global tokens`);

// Each preview's first line is a marker: <!-- @dsCard group="Forms" height=326 subtitle="..." -->
const componentsDir = join(root, "components");
const catalog = readdirSync(componentsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(componentsDir, entry.name, "preview.html")))
  .map(({ name }) => {
    const marker = readFileSync(join(componentsDir, name, "preview.html"), "utf8").split("\n", 1)[0];
    const attr = (key) => marker.match(new RegExp(`${key}="([^"]*)"`))?.[1];
    return {
      name,
      group: attr("group") ?? null,
      subtitle: attr("subtitle") ?? null,
      height: Number(marker.match(/height=(\d+)/)?.[1] ?? 120),
      pattern: /\spage[\s-]/.test(marker),
      readme: existsSync(join(componentsDir, name, "README.md"))
    };
  });
writeFileSync(join(componentsDir, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`components/catalog.json: ${catalog.length} previews`);
