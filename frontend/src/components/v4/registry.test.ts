import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

import packageManifest from "../../../package.json";
import registry from "../../../registry.json";

it("ships a lean base and resolves namespaced runtime dependencies without product aliases", () => {
  const base = registry.items.find((item) => item.name === "infisical-base");
  expect(base?.files.some((file) => file.path.includes("/patterns/"))).toBe(false);
  expect(base?.files.some((file) => file.target === "AGENTS.md")).toBe(false);
  const names = new Set(registry.items.map((item) => item.name));
  const declared = new Set(
    Object.entries({ ...packageManifest.devDependencies, ...packageManifest.dependencies }).map(
      ([name, version]) => `${name}@${version}`
    )
  );
  registry.items.forEach((item) => {
    const payload = JSON.parse(readFileSync(path.resolve(`public/r/${item.name}.json`), "utf8"));
    (payload.registryDependencies ?? []).forEach((dependency: string) => {
      expect(dependency.startsWith("@infisical/")).toBe(true);
      expect(names.has(dependency.replace("@infisical/", ""))).toBe(true);
    });
    (payload.dependencies ?? []).forEach((dependency: string) => {
      expect(declared.has(dependency)).toBe(true);
      expect(dependency.startsWith("react@")).toBe(false);
      expect(dependency.startsWith("react-dom@")).toBe(false);
    });
    payload.files.forEach((file: { path: string; content: string; target: string }) => {
      expect(existsSync(path.resolve(file.path))).toBe(true);
      expect(file.content).not.toContain("@app/components/");
      expect(file.target).toBe(file.path);
    });
  });
});

it("embeds the original bundled font bytes in install CSS and ships their licenses", () => {
  const base = JSON.parse(readFileSync(path.resolve("public/r/infisical-base.json"), "utf8"));
  const css = base.files.find((file: { path: string }) => file.path.endsWith("/v4.css"))?.content;
  expect(typeof css).toBe("string");
  const embedded = [...css.matchAll(/data:font\/woff2;base64,([^"')]+)/g)].map((match) =>
    Buffer.from(match[1], "base64")
  );
  const fonts = ["Archivo-Latin.woff2", "Archivo-Italic-Latin.woff2", "GeistMono-Latin.woff2"].map(
    (name) => readFileSync(path.resolve(`src/components/v4/fonts/${name}`))
  );
  const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
  expect(embedded.map(hash).sort()).toEqual(fonts.map(hash).sort());
  expect(base.files.some((file: { path: string }) => file.path.endsWith("Archivo-OFL.txt"))).toBe(
    true
  );
  expect(base.files.some((file: { path: string }) => file.path.endsWith("GeistMono-OFL.txt"))).toBe(
    true
  );
});

it("ships self-contained guide examples with imports resolved for their declared save path", () => {
  const base = JSON.parse(readFileSync(path.resolve("public/r/infisical-base.json"), "utf8"));
  const guides = base.files.filter(
    (file: { path: string }) => file.path.endsWith(".md") && file.path.includes("/docs/")
  );
  let checked = 0;
  guides.forEach((file: { content: string }) => {
    [
      ...file.content.matchAll(/Save this example at `([^`]+)`;[\s\S]*?```tsx\n([\s\S]*?)```/g)
    ].forEach((match) => {
      checked += 1;
      const [, target, code] = match;
      expect(code).not.toContain("@app/");
      [...code.matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g)].forEach((entry) => {
        const local = path.resolve(path.dirname(target), entry[1]);
        expect(
          [local, `${local}.ts`, `${local}.tsx`, `${local}.json`, `${local}.css`].some(existsSync)
        ).toBe(true);
      });
    });
  });
  expect(checked).toBeGreaterThanOrEqual(78);
});
