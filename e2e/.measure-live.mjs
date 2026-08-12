import fs from "node:fs";

import { chromium } from "playwright";

const TOKEN = fs.readFileSync("/tmp/twtest/access.txt", "utf8").trim();
const ORG = "966b63f6-b545-4262-a1c6-f3ddcf47f67a";
const PROJECT = "82406fb5-b9b8-4ebb-ba33-960552a5a8f5";
const URL = `http://localhost:8080/organizations/${ORG}/projects/secret-management/${PROJECT}/agent-proxy?selectedTab=activity`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

await page.route("**/api/v1/auth/token", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ token: TOKEN, organizationId: ORG })
  })
);

// Hold the audit-log request open so isPending stays true and the skeleton rows stay on screen.
let held = 0;
await page.route("**/api/v1/organization/audit-logs**", async (route) => {
  held += 1;
  await new Promise((r) => setTimeout(r, 60_000));
  await route.fallback();
});

await page.goto(URL, { waitUntil: "domcontentloaded" });

try {
  await page.waitForSelector("tbody tr", { timeout: 45_000 });
} catch {
  console.log("no tbody tr; page text:", (await page.textContent("body"))?.slice(0, 400));
  await page.screenshot({ path: "/tmp/twtest/live-fail.png", fullPage: true });
  await browser.close();
  process.exit(1);
}

const rows = await page.evaluate(() => {
  const trs = [...document.querySelectorAll("tbody tr")];
  return trs.map((tr, i) => {
    const cs = getComputedStyle(tr);
    const td = tr.querySelector("td");
    return {
      i,
      classes: tr.className.split(" ").filter((c) => /h-/.test(c)).join(" ") || "(none)",
      rectH: +tr.getBoundingClientRect().height.toFixed(1),
      computedH: cs.height,
      tdH: td ? +td.getBoundingClientRect().height.toFixed(1) : null,
      tdComputedH: td ? getComputedStyle(td).height : null
    };
  });
});

const cssRule = await page.evaluate(() => {
  const out = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const r of rules) {
      if (r.selectorText && /\\!h-16|\\!min-h-16/.test(r.selectorText)) out.push(r.cssText);
    }
  }
  return out;
});

console.log("held audit-log requests:", held);
console.log("matching CSS rules in the live document:", cssRule);
console.table(rows);
await page.screenshot({ path: "/tmp/twtest/live-skeleton.png", fullPage: false });
await browser.close();
