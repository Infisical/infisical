// Capture docs screenshots from the shared self-hosted Infisical instance.

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

export const BASE = process.env.INFISICAL_URL || "http://143.198.182.42";
export const ORG = process.env.INFISICAL_ORG_ID || "12af406e-433e-405a-b7cf-2f7f99b48e1b";
export const EMAIL = process.env.INFISICAL_EMAIL || "dana.park@example.com";
const PASSWORD = process.env.INFISICAL_PASSWORD;

// The house size. Viewport x deviceScaleFactor is the only size any docs image ships
// at, including ones currently stored at some other size. Never change this to match
// an existing image.
export const VIEWPORT = { width: 1706, height: 971 };
export const DSF = 2;
const EXPECTED = { w: VIEWPORT.width * DSF, h: VIEWPORT.height * DSF };

export const expand = (s) => s.replace(/\{base\}/g, BASE).replace(/\{org\}/g, ORG);

export const url = (p) => {
  const s = expand(String(p));
  return /^https?:\/\//.test(s) ? s : BASE + (s.startsWith("/") ? s : "/" + s);
};

/** Launch Chrome and sign in fresh. Never reuse storageState: it expires quickly and
 *  a stale session silently lands on the login page instead of erroring, so you
 *  capture the login form and do not notice. */
export async function open() {
  if (!PASSWORD) {
    throw new Error(
      "Set INFISICAL_PASSWORD. Ask the operator for the screenshot instance password; " +
        "it is not committed because this repository is public."
    );
  }
  // Playwright's bundled Chromium is often not installed on operator machines, so a
  // plain chromium.launch() fails. Use the system Chrome.
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DSF,
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();

  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="password"]').first().waitFor({ state: "visible", timeout: 20000 });
  await page.fill('input[name="email"], input[type="email"], input[placeholder*="company"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button:has-text("Continue with Email")');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });
  await page.waitForTimeout(3000); // let the "Successfully logged in" toast clear
  return { browser, page };
}

/** Strip anything that is an artifact of this box rather than product UI: the HTTPS
 *  and SMTP warning banners, lingering toasts, and any in flight animation or text
 *  caret that would make two runs of the same shot differ. */
export async function clean(page) {
  await page.addStyleTag({
    content:
      `[data-testid="toast"], .toast, [class*="Toastify"] { display: none !important; }` +
      `*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important;` +
      ` transition-duration: 0s !important; transition-delay: 0s !important; caret-color: transparent !important; }`,
  });
  for (const text of ["not secured via HTTPS", "SMTP has not been configured"]) {
    const banner = page.locator(`div:has-text("${text}")`).last();
    if (!(await banner.count())) continue;
    const buttons = banner.locator("button");
    for (let i = (await buttons.count()) - 1; i >= 0; i--) {
      try {
        await buttons.nth(i).click({ timeout: 1000 });
        break;
      } catch {}
    }
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(600);
}

export const settle = async (page, ms = 2600) => {
  await page.waitForTimeout(ms);
  await clean(page);
};

/** Projects created by the bootstrap machine identity have no human member, so their
 *  pages render a join prompt instead of the real UI. Safe to call on any page. */
export async function joinProjectIfPrompted(page) {
  const btn = page.locator('button:has-text("Join Project as Admin")').first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(4000);
  }
}

export async function go(page, target, { wait = 2600 } = {}) {
  await page.goto(url(target), { waitUntil: "networkidle" });
  await joinProjectIfPrompted(page);
  await settle(page, wait);
}

export async function clickAny(page, selectors, timeout = 4000) {
  for (const s of selectors) {
    const el = page.locator(s).first();
    if (await el.count()) {
      try {
        await el.click({ timeout });
        return s;
      } catch {}
    }
  }
  return null;
}

/** Click a control by its visible label, preferring a real button over stray text
 *  that happens to contain the same words. Throws rather than continuing quietly,
 *  because a silently skipped click produces a valid screenshot of the wrong state. */
export async function click(page, label, { timeout = 5000 } = {}) {
  const hit = await clickAny(
    page,
    [
      `button:has-text("${label}")`,
      `[role="button"]:has-text("${label}")`,
      `a:has-text("${label}")`,
      `:text-is("${label}")`,
      `:text("${label}")`,
    ],
    timeout
  );
  if (!hit) throw new Error(`no clickable control matching ${JSON.stringify(label)}`);
  await page.waitForTimeout(1200);
  return hit;
}

/** The block that owns a labelled field, scoped to the open dialog when there is one.
 *
 *  Walks up from the label until it reaches an ancestor that actually contains a
 *  control, because the input is often several levels below the label's own parent.
 *  Two traps this avoids: field labels are frequently repeated verbatim in a dialog's
 *  subtitle, so matching label text anywhere lands on a paragraph and every later
 *  action silently goes nowhere; and labels carry trailing info icons, so compare by
 *  prefix rather than equality. */
const FIELD_TAG = "data-docshot-field";
async function fieldBlock(page, label) {
  const ok = await page.evaluate(
    ({ label, tag }) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      const root = dialogs.length ? dialogs[dialogs.length - 1] : document.body;
      const CONTROL =
        'input:not([type="hidden"]), textarea, select,' +
        ' [class*="css-"][class*="-container"], [role="combobox"], [aria-haspopup]';
      const labels = [...root.querySelectorAll("label")].filter((l) =>
        (l.textContent || "").trim().startsWith(label)
      );
      for (const l of labels) {
        let n = l.parentElement;
        for (let i = 0; i < 6 && n; i++, n = n.parentElement) {
          if (n.querySelector(CONTROL)) {
            document.querySelectorAll("[" + tag + "]").forEach((e) => e.removeAttribute(tag));
            n.setAttribute(tag, "1");
            return true;
          }
        }
      }
      return false;
    },
    { label, tag: FIELD_TAG }
  );
  if (!ok) throw new Error(`no field labelled ${JSON.stringify(label)} with a control under it`);
  return page.locator(`[${FIELD_TAG}]`).first();
}

export async function fill(page, label, value) {
  const direct = page.locator(`[placeholder="${label}"]`).first();
  if (await direct.count()) {
    await direct.fill(value);
    await page.waitForTimeout(500);
    return;
  }
  const block = await fieldBlock(page, label);
  const input = block.locator('input:not([type="hidden"]), textarea').first();
  if (!(await input.count())) throw new Error(`no input for field ${JSON.stringify(label)}`);
  await input.fill(value);
  await page.waitForTimeout(500);
}

/** Close an open dropdown without pressing Escape. Escape closes the whole dialog,
 *  not the menu inside it, and the resulting shot of the page behind it passes every
 *  size check. Blur onto the dialog's own title instead. */
export async function closeMenu(page) {
  const dlg = page.locator('[role="dialog"]').last();
  const anchor = (await dlg.count())
    ? dlg.locator("h1, h2, h3").first()
    : page.locator("h1, h2, h3").first();
  if (await anchor.count()) await anchor.click({ force: true, timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

/** This UI has two unrelated select families and they share no selectors, so try both:
 *  Radix exposes [role="combobox"] with [role="option"] items, while react-select has
 *  no ARIA roles at all, its trigger is the container div, and its options are
 *  portalled out of the dialog with react-select-N-option-M ids. */
export async function choose(page, label, option) {
  const block = await fieldBlock(page, label);

  const reactSelect = block.locator('[class*="css-"][class*="-container"]').first();
  const isReactSelect = await reactSelect.count();
  if (isReactSelect) {
    await reactSelect.click();
  } else {
    const trigger = block.locator('[role="combobox"], button, [aria-haspopup]').first();
    if (!(await trigger.count())) throw new Error(`no dropdown for field ${JSON.stringify(label)}`);
    await trigger.click();
  }
  await page.waitForTimeout(1200);

  const hit = await clickAny(page, [
    `[id^="react-select"][id*="option"]:has-text("${option}")`,
    `[role="option"]:has-text("${option}")`,
    `[role="menuitem"]:has-text("${option}")`,
    `li:has-text("${option}")`,
  ]);
  if (!hit) throw new Error(`option ${JSON.stringify(option)} not found under ${JSON.stringify(label)}`);
  await closeMenu(page);
}

/** Hand a file to a drop zone. These zones also accept a browse click, so drive the
 *  hidden input rather than synthesising a drag event. */
export async function upload(page, { name = "secrets.env", contents }) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "docshot-")), name);
  fs.writeFileSync(file, contents);
  const input = page.locator('input[type="file"]').first();
  if (!(await input.count())) throw new Error("no file input on this page");
  await input.setInputFiles(file);
  await page.waitForTimeout(3200);
}

/** Fail loudly unless this text is on screen. The size check in shoot cannot tell a
 *  correct screen from a wrong one, and selector drift produces a perfectly valid
 *  screenshot of the wrong thing, so assert something unique to the screen you meant. */
export async function expect(page, text) {
  const found = await page
    .locator(`:text("${text}")`)
    .first()
    .isVisible()
    .catch(() => false);
  if (!found) throw new Error(`expected ${JSON.stringify(text)} on screen, not found`);
}

/** Draw a red callout box over an element. Unused by current screenshots, which rely
 *  on the bold UI labels in the prose instead, so reach for it only if a page already
 *  has callouts to stay consistent with. */
export async function annotate(page, selector, nth = 0) {
  const box = await page.locator(selector).nth(nth).boundingBox();
  if (!box) throw new Error("annotate: no bounding box for " + selector);
  await page.evaluate(
    ({ x, y, w, h }) => {
      const d = document.createElement("div");
      d.style.cssText =
        `position:fixed;left:${x - 6}px;top:${y - 6}px;width:${w + 12}px;height:${h + 12}px;` +
        `border:3px solid #ef4444;border-radius:8px;z-index:2147483647;pointer-events:none;`;
      document.body.appendChild(d);
    },
    { x: box.x, y: box.y, w: box.width, h: box.height }
  );
}

function pngSize(file) {
  const fd = fs.openSync(file, "r");
  const head = Buffer.alloc(24);
  fs.readSync(fd, head, 0, 24, 0);
  fs.closeSync(fd);
  return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) };
}

/** No clip and no fullPage, ever: docs images are full viewport
 *  frames, including when the image being replaced is a crop. A wrong size is deleted
 *  rather than left where it could be copied into docs by mistake. */
export async function shoot(page, outPath, { expect: want } = {}) {
  for (const text of [].concat(want || [])) await expect(page, text);
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  await clean(page);
  await page.screenshot({ path: outPath });
  const got = pngSize(outPath);
  if (got.w !== EXPECTED.w || got.h !== EXPECTED.h) {
    fs.unlinkSync(outPath);
    throw new Error(
      `expected a full viewport frame of ${EXPECTED.w}x${EXPECTED.h}, got ${got.w}x${got.h}. ` +
        `Do not pass clip or fullPage. If the image you are replacing is cropped, replace it ` +
        `with a full frame anyway. Deleted the bad capture.`
    );
  }
  return `${got.w}x${got.h}`;
}

// CLI mode. Anything it cannot express is a script that imports the helpers above.

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const argv = process.argv.slice(2);
  const clicks = [];
  const expects = [];
  let wait = 2600;
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--click") clicks.push(argv[++i]);
    else if (argv[i] === "--expect") expects.push(argv[++i]);
    else if (argv[i] === "--wait") wait = Number(argv[++i]);
    else positional.push(argv[i]);
  }
  const [out, target] = positional;
  if (!out || !target) {
    console.error(
      "usage: node capture.mjs <out.png> <url|path> [--click LABEL]... [--expect TEXT]... [--wait ms]\n\n" +
        "  node capture.mjs docs/images/platform/identities/identities-org.png \\\n" +
        '    "/organizations/{org}/access-management?selectedTab=identities" \\\n' +
        '    --expect "Machine Identities"\n\n' +
        "  <out.png> is the image's own path under docs/, so a re-capture is a plain git diff.\n" +
        "  {org} and {base} expand. --click and --expect repeat. Anything more needs a script\n" +
        "  that imports the helpers in this file; see SKILL.md."
    );
    process.exit(2);
  }

  let browser, page;
  try {
    ({ browser, page } = await open());
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  try {
    await go(page, target, { wait });
    for (const label of clicks) await click(page, label);
    const size = await shoot(page, out, { expect: expects });
    console.log(`ok   ${out}  ${size}`);
    console.log("Open it and look at it before you commit: a correct size is not a correct screen.");
  } catch (e) {
    console.error(`FAIL ${out}: ${e.message.split("\n")[0]}`);
    await browser.close();
    process.exit(1);
  }
  await browser.close();
}
