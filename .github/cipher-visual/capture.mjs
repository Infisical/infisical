// Captures the v4 demo pages listed in pages.json from a running preview server.
// node capture.mjs <base-url> <out-dir> [pages.json] [ids-file]
// ids-file holds a JSON array of page ids to capture; without it every page is captured.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const [baseUrl, out, manifestFile = new URL("./pages.json", import.meta.url).pathname, idsFile] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
const only = idsFile && existsSync(idsFile) ? new Set(JSON.parse(readFileSync(idsFile, "utf8"))) : null;
const pages = manifest.pages.filter((p) => !only || only.has(p.id));
const NOW = new Date("2026-06-15T17:00:00Z");
const FREEZE = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}";
const VIEWPORTS = [
  ["desktop", { width: 1706, height: 971 }],
  ["mobile", { width: 390, height: 844 }]
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const blocked = new Set();
const failures = [];
const step = async (page, s) => {
  if (s.waitFor) return page.locator(s.waitFor).first().waitFor({ state: "visible", timeout: 15000 });
  const c = s.click;
  const target = c.role ? page.getByRole(c.role, { name: new RegExp(c.name, "i") }) : c.text ? page.getByText(new RegExp(c.text, "i")) : page.locator(c.css);
  await target.first().click({ timeout: 15000 });
};

for (const [vp, viewport] of VIEWPORTS) {
  const list = pages.filter((p) => vp === "desktop" || p.mobile);
  if (!list.length) continue;
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, timezoneId: "UTC", locale: "en-US", colorScheme: "light", reducedMotion: "reduce" });
  await context.addInitScript(() => localStorage.setItem("infisical-theme", "light"));
  await context.addInitScript((css) => {
    const add = () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); };
    if (document.head) add(); else document.addEventListener("DOMContentLoaded", add);
  }, FREEZE);
  const origin = new URL(baseUrl).origin;
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin && !url.pathname.startsWith("/api/")) return route.continue();
    const stub = url.origin === origin && manifest.stubs?.[url.pathname];
    if (stub) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(stub) });
    blocked.add(url.origin === origin ? url.pathname : url.origin);
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
  for (const p of list) {
    const page = await context.newPage();
    await page.clock.setFixedTime(NOW);
    const file = path.join(out, vp, p.id + ".png");
    mkdirSync(path.dirname(file), { recursive: true });
    try {
      await page.goto(baseUrl + p.url, { waitUntil: "networkidle", timeout: 60000 });
      await page.locator("[data-slot=skeleton]").first().waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(800);
      for (const s of p.open ?? []) await step(page, s);
      if (!p.open) { await page.mouse.move(0, 0); await page.evaluate(() => document.activeElement?.blur?.()); }
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      await page.screenshot({ path: file, animations: "disabled", caret: "hide", mask: (p.mask ?? []).map((m) => page.locator(m)), maskColor: "#ff00ff" });
      console.log("captured", vp, p.id);
    } catch (e) {
      failures.push(vp + "/" + p.id);
      console.log("FAILED", vp, p.id, e.message.split("\n")[0]);
      await page.screenshot({ path: file }).catch(() => {});
    }
    await page.close();
  }
  await context.close();
}
await browser.close();
console.log("blocked requests:", [...blocked].sort().join(", ") || "none");
if (failures.length) { console.log("failed pages:", failures.join(", ")); process.exitCode = 1; }
