import { chromium } from "@playwright/test";

const BASE = "http://localhost:8080";
const EMAIL = process.env.TEST_USER_EMAIL || "test@localhost.local";
const PASS = process.env.TEST_USER_PASSWORD || "testInfisical@1";

const b = await chromium.launch();
const page = await b.newPage();
const log = (...a) => console.log(...a);

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"], input[type="email"]', EMAIL).catch(() => {});
  await page.fill('input[type="password"]', PASS).catch(() => {});
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/organizations\//, { timeout: 45000 });
  const orgId = page.url().match(/organizations\/([0-9a-f-]{36})/)[1];
  log("LOGIN OK org=", orgId);

  await page.goto(`${BASE}/organizations/${orgId}/sandboxes`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  log("URL      =", page.url());

  const nav = await page.locator("aside a, nav a").allTextContents();
  log("SIDEBAR  =", JSON.stringify(nav.map(t => t.trim()).filter(Boolean)));

  const hrefs = await page.locator("aside a, nav a").evaluateAll(els => els.map(e => e.getAttribute("href")));
  log("HREFS    =", JSON.stringify(hrefs.filter(Boolean)));

  log("H1       =", JSON.stringify((await page.locator("h1").allTextContents()).map(s=>s.trim())));
  log("PAM LEAK =", hrefs.filter(h => h && h.includes("/pam")).length ? "YES (BUG)" : "none");
} catch (e) {
  console.log("FAILED:", e.message.split("\n")[0]);
  console.log("url:", page.url());
  console.log("body:", (await page.locator("body").innerText().catch(()=> "")).slice(0, 400));
} finally {
  await b.close();
}
