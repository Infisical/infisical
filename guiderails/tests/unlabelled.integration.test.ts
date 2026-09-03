import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createBrowserTools } from "../src/run/browser.js";
import { describeUnlabelled, scanUnlabelled } from "../src/run/unlabelled.js";

/**
 * The scan, against real markup rather than a mock.
 *
 * A fake DOM would prove nothing here: every case this exists for comes from how a real component
 * library renders. The fixtures below are copied from what the running instance actually produces —
 * `<IconButton><ChevronDown /></IconButton>` from `AddResourceButtons.tsx:97`, and Radix's switch,
 * which pairs a visible `<button role="switch">` with a transparent `<input>` of the same size.
 *
 * Uses a blank page rather than the instance, so it stays offline and runs in the ordinary suite.
 */

const PAGE = `
  <div id="toolbar">
    <span><button aria-label="Add Secret">Add Secret</button></span>
    <button class="icon"><svg class="lucide lucide-chevron-down"></svg></button>
  </div>

  <div id="row">
    <span>DATABASE_URL</span>
    <button class="icon"><svg class="svg-inline--fa" data-icon="trash"></svg></button>
  </div>

  <div id="toggle">
    <button role="switch" aria-checked="true"></button>
    <span>Limit access to people within organization</span>
    <input type="checkbox" aria-hidden="true" style="opacity:0;position:absolute;width:36px;height:20px" />
  </div>

  <div id="named">
    <button title="Download">
      <svg class="lucide lucide-download"></svg>
    </button>
  </div>

  <div id="hidden">
    <button style="display:none"><svg class="lucide lucide-ghost"></svg></button>
  </div>
`;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent(`<html><body>${PAGE}</body></html>`);
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe("scanUnlabelled", () => {
  it("finds the controls the app never named, and only those", async () => {
    const controls = await scanUnlabelled(page);
    // The Download button has a title, so it has a name; the hidden one is not on screen; Radix's
    // transparent input is aria-hidden. Three of the six are correctly left out.
    expect(controls.map((control) => control.icon)).toEqual(["chevron-down", "trash", null]);
  });

  it("names the icon the guide would name", async () => {
    // "the chevron next to Add Secret" is how folder.mdx puts it, and lucide's class says
    // chevron-down, so the agent can match the guide's own word to a control.
    const [chevron] = await scanUnlabelled(page);
    expect(chevron?.icon).toBe("chevron-down");
    expect(chevron?.near).toBe("Add Secret");
    expect(chevron?.relation).toBe("after");
  });

  it("reads FontAwesome's icon name too", async () => {
    const controls = await scanUnlabelled(page);
    expect(controls[1]).toMatchObject({ icon: "trash", near: "DATABASE_URL" });
  });

  it("anchors to text that follows the control, not just text before it", async () => {
    // The share dialog's switch is labelled by the span after it. Searching backwards only would
    // describe it by whatever unrelated thing preceded it.
    const controls = await scanUnlabelled(page);
    expect(controls[2]).toMatchObject({
      role: "switch",
      near: "Limit access to people within organization",
      relation: "before"
    });
  });

  it("numbers them the way the snapshot lists them", async () => {
    const controls = await scanUnlabelled(page);
    expect(controls.map((control) => control.index)).toEqual([1, 2, 3]);
    expect(describeUnlabelled(controls[0]!)).toBe('1. button "chevron-down" — after "Add Secret"');
  });
});

describe("clicking an unlabelled control", () => {
  it("clicks the one at that number", async () => {
    await page.setContent(
      `<html><body>${PAGE}<div id="log"></div></body></html>` +
        `<script>document.querySelector("#toolbar .icon").addEventListener("click", () => {
           document.getElementById("log").textContent = "chevron";
         });</script>`
    );
    const tools = createBrowserTools(page);
    const outcome = await tools.clickUnlabelled(1);

    expect(outcome.ok).toBe(true);
    expect(await page.locator("#log").innerText()).toBe("chevron");
  });

  it("records the description rather than the number", async () => {
    await page.setContent(`<html><body>${PAGE}</body></html>`);
    const tools = createBrowserTools(page);
    const outcome = await tools.clickUnlabelled(1);

    // A recording keyed on "1" would click whatever happened to be first a week later.
    expect(outcome.locator?.unlabelled).toEqual({
      role: "button",
      icon: "chevron-down",
      near: "Add Secret"
    });
    expect(outcome.locator?.name).toBeNull();
  });

  it("replays by description", async () => {
    await page.setContent(
      `<html><body>${PAGE}<div id="log"></div></body></html>` +
        `<script>document.querySelector("#row .icon").addEventListener("click", () => {
           document.getElementById("log").textContent = "trash";
         });</script>`
    );
    const tools = createBrowserTools(page);
    const outcome = await tools.clickDescribed({
      role: "button",
      icon: "trash",
      near: "DATABASE_URL"
    });

    expect(outcome.ok).toBe(true);
    expect(await page.locator("#log").innerText()).toBe("trash");
  });

  it("refuses a description that no longer matches anything", async () => {
    await page.setContent(`<html><body>${PAGE}</body></html>`);
    const tools = createBrowserTools(page);
    const outcome = await tools.clickDescribed({
      role: "button",
      icon: "chevron-down",
      near: "Add Secret Rotation"
    });

    // Clicking the chevron anyway, because it is the only chevron, is exactly the confident wrong
    // click this design refuses.
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toContain("Add Secret Rotation");
  });

  it("refuses a number the page does not have", async () => {
    await page.setContent(`<html><body>${PAGE}</body></html>`);
    const tools = createBrowserTools(page);
    const outcome = await tools.clickUnlabelled(9);

    expect(outcome.ok).toBe(false);
    // The refusal carries the current list, so the agent can correct itself without spending
    // another of its eight calls on a second snapshot.
    expect(outcome.detail).toContain("The page now lists 3");
    expect(outcome.detail).toContain('"chevron-down"');
  });

  it("says so when there is nothing unlabelled at all", async () => {
    await page.setContent('<html><body><button aria-label="Save">Save</button></body></html>');
    const tools = createBrowserTools(page);
    const outcome = await tools.clickUnlabelled(1);

    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toContain("no unlabelled controls");
  });
});

describe("snapshot", () => {
  it("lists the unlabelled controls under the tree", async () => {
    await page.setContent(`<html><body>${PAGE}</body></html>`);
    const tools = createBrowserTools(page);
    const text = await tools.snapshot();

    // The tree shows an anonymous control as a bare `- button`, which is what the listing exists
    // to make addressable.
    expect(text).toContain("Unlabelled controls");
    expect(text).toContain('button "chevron-down" — after "Add Secret"');
  });

  it("says nothing when every control has a name", async () => {
    await page.setContent('<html><body><button aria-label="Save">Save</button></body></html>');
    const tools = createBrowserTools(page);
    expect(await tools.snapshot()).not.toContain("Unlabelled controls");
  });
});
