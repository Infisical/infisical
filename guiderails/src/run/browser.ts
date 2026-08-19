import type { Page } from "@playwright/test";

import type { ResolvedLocator } from "../types.js";
import {
  CONTROL_SELECTOR,
  describeDescriptor,
  describeUnlabelled,
  descriptorOf,
  renderUnlabelled,
  sameControl,
  scanUnlabelled,
  type UnlabelledControl,
  type UnlabelledDescriptor
} from "./unlabelled.js";

/**
 * The browser surface the agent acts through.
 *
 * Addressing is by ARIA role and accessible name, never by CSS selector or coordinates. Three
 * reasons, in order of importance:
 *
 *  1. frontend/ has zero data-testid attributes, so there is no test-only handle to use, while
 *     269 .tsx files set aria-label. Role plus name is the only stable addressing available.
 *  2. It is what a reader does. The guide says "click Add Secret", and matching on the
 *     accessible name is the closest mechanical equivalent to a person reading the label.
 *  3. It is serializable. A resolved role/name pair replays as ordinary Playwright, which is
 *     what turns a successful agent run into a deterministic spec.
 *
 * Not every control has an accessible name, though: several icon-only buttons have none at all,
 * including the chevron beside Add Secret that folder.mdx step 1 asks the reader to click. Those
 * are addressed instead by their icon and the text beside them, which is how the guides refer to
 * them anyway. See `./unlabelled.ts` for why that is worth the weakening it represents.
 */

export type ToolOutcome = {
  ok: boolean;
  detail: string;
  locator?: ResolvedLocator;
};

const SETTLE_MS = 400;

/** Playwright roles the compiler is allowed to narrow a click to. */
const KNOWN_ROLES = new Set([
  "button",
  "link",
  "tab",
  "checkbox",
  "radio",
  "menuitem",
  "option",
  "textbox",
  "combobox",
  "switch",
  "heading"
]);

export const createBrowserTools = (page: Page) => {
  const settle = async (): Promise<void> => {
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(SETTLE_MS);
  };

  /**
   * The accessibility tree as the agent's only view of the page. Two orders of magnitude
   * cheaper than a screenshot per step, and it yields the selector we can replay.
   *
   * The tree renders a control the app never named as a bare `- button:`, which tells the agent
   * something is there but gives it no way to say which one it means. So the unlabelled controls
   * are listed underneath, with the icon and neighbouring text that identify them.
   */
  const snapshot = async (): Promise<string> => {
    await settle();
    const tree = await page.locator("body").ariaSnapshot();
    // Long enough to include the page's controls, short enough to keep the step cheap.
    const trimmed =
      tree.length > 12_000 ? `${tree.slice(0, 12_000)}\n... (snapshot truncated)` : tree;
    // Appended after the truncation, or the listing would be the first thing cut from a big page.
    return `${trimmed}${renderUnlabelled(await scanUnlabelled(page))}`;
  };

  const resolve = (role: string | null, name: string) => {
    if (role && KNOWN_ROLES.has(role)) {
      return page.getByRole(role as Parameters<Page["getByRole"]>[0], {
        name,
        exact: false
      });
    }
    // No usable role: fall back to any element whose accessible name or text matches.
    return page.getByText(name, { exact: false }).first();
  };

  const click = async (name: string, role: string | null): Promise<ToolOutcome> => {
    const target = resolve(role, name);
    const count = await target.count();

    if (count === 0) {
      return {
        ok: false,
        detail:
          `No element found with accessible name matching "${name}"` +
          `${role ? ` and role ${role}` : ""}. The label in the guide may not match the app.`
      };
    }

    try {
      await target.first().click({ timeout: 8000 });
      await settle();
      return {
        ok: true,
        detail: `clicked "${name}"${count > 1 ? ` (first of ${count} matches)` : ""}`,
        locator: { action: "click", role, name, value: null }
      };
    } catch (error) {
      return {
        ok: false,
        detail: `found "${name}" but could not click it: ${
          error instanceof Error ? error.message.split("\n")[0] : String(error)
        }`
      };
    }
  };

  /**
   * Clicks a control the app never named, chosen from the listing the last snapshot showed.
   *
   * The listing is recomputed rather than remembered, and the entry at that position has to still
   * describe the same control. Anything else is a page that moved under the agent, and clicking
   * whatever now sits third in the list would be exactly the confident wrong click this design has
   * always refused.
   */
  const clickUnlabelled = async (index: number): Promise<ToolOutcome> => {
    await settle();
    const controls = await scanUnlabelled(page);

    if (controls.length === 0) {
      return { ok: false, detail: "There are no unlabelled controls on this page." };
    }

    const control = controls.find((candidate) => candidate.index === index);
    if (!control) {
      // The current list comes back with the refusal. Answering "take a new snapshot" alone costs
      // the agent a second call out of a budget of eight, which a real run spent doing exactly that.
      return {
        ok: false,
        detail:
          `There is no unlabelled control ${index}. The page now lists ${controls.length}: ` +
          controls.map((candidate) => describeUnlabelled(candidate)).join("; ")
      };
    }

    return clickResolved(control, describeUnlabelled(control));
  };

  /** The replay path: same click, addressed by the recorded description instead of a position. */
  const clickDescribed = async (descriptor: UnlabelledDescriptor): Promise<ToolOutcome> => {
    await settle();
    const controls = await scanUnlabelled(page);
    const matches = controls.filter((candidate) => sameControl(descriptor, candidate));

    if (matches.length === 0) {
      return {
        ok: false,
        detail: `No ${describeDescriptor(descriptor)} on this page.`
      };
    }
    // More than one identical description means the recording cannot distinguish them, so the
    // first is as good an answer as exists. Said out loud rather than hidden.
    const [control] = matches;
    if (!control) return { ok: false, detail: `No ${describeDescriptor(descriptor)}.` };

    return clickResolved(
      control,
      `${describeDescriptor(descriptor)}${matches.length > 1 ? ` (first of ${matches.length})` : ""}`
    );
  };

  const clickResolved = async (
    control: UnlabelledControl,
    described: string
  ): Promise<ToolOutcome> => {
    const target = page.locator(CONTROL_SELECTOR).nth(control.domIndex);
    try {
      await target.click({ timeout: 8000 });
      await settle();
      return {
        ok: true,
        detail: `clicked ${described}`,
        locator: {
          action: "click",
          role: control.role,
          // Null is the whole point: this control has no name to record.
          name: null,
          value: null,
          unlabelled: descriptorOf(control)
        }
      };
    } catch (error) {
      return {
        ok: false,
        detail: `found ${described} but could not click it: ${
          error instanceof Error ? error.message.split("\n")[0] : String(error)
        }`
      };
    }
  };

  const fill = async (field: string, value: string): Promise<ToolOutcome> => {
    const byLabel = page.getByLabel(field, { exact: false });
    const byPlaceholder = page.getByPlaceholder(field, { exact: false });
    const byRole = page.getByRole("textbox", { name: field, exact: false });

    for (const [strategy, locator] of [
      ["label", byLabel],
      ["role", byRole],
      ["placeholder", byPlaceholder]
    ] as const) {
      if ((await locator.count()) === 0) continue;
      try {
        await locator.first().fill(value, { timeout: 8000 });
        await settle();
        return {
          ok: true,
          detail: `filled "${field}" via ${strategy}`,
          locator: { action: "fill", role: "textbox", name: field, value }
        };
      } catch {
        // Try the next strategy rather than failing on the first miss.
      }
    }

    return {
      ok: false,
      detail: `No fillable field found for "${field}" by label, role or placeholder.`
    };
  };

  const select = async (field: string, option: string): Promise<ToolOutcome> => {
    const combobox = page.getByRole("combobox", { name: field, exact: false });

    if ((await combobox.count()) > 0) {
      try {
        await combobox.first().click({ timeout: 8000 });
        await settle();
        const choice = page.getByRole("option", { name: option, exact: false });
        if ((await choice.count()) > 0) {
          await choice.first().click({ timeout: 8000 });
          await settle();
          return {
            ok: true,
            detail: `selected "${option}" in "${field}"`,
            locator: { action: "select", role: "combobox", name: field, value: option }
          };
        }
        return {
          ok: false,
          detail: `opened "${field}" but found no option matching "${option}".`
        };
      } catch (error) {
        return {
          ok: false,
          detail: `could not operate "${field}": ${
            error instanceof Error ? error.message.split("\n")[0] : String(error)
          }`
        };
      }
    }

    // Radio groups are the other documented "select" shape in these guides.
    const radio = page.getByRole("radio", { name: option, exact: false });
    if ((await radio.count()) > 0) {
      await radio.first().click({ timeout: 8000 });
      await settle();
      return {
        ok: true,
        detail: `selected radio "${option}"`,
        locator: { action: "select", role: "radio", name: option, value: option }
      };
    }

    return { ok: false, detail: `No dropdown or radio group found for "${field}".` };
  };

  const expectVisible = async (text: string): Promise<ToolOutcome> => {
    await settle();
    const match = page.getByText(text, { exact: false });
    const count = await match.count();
    return count > 0
      ? {
          ok: true,
          detail: `"${text}" is present`,
          locator: { action: "expect_visible", role: null, name: text, value: null }
        }
      : { ok: false, detail: `"${text}" is not present on the page.` };
  };

  const screenshot = async (): Promise<Buffer> => {
    await settle();
    return page.screenshot({ type: "png", fullPage: false });
  };

  const currentUrl = (): string => page.url();

  return {
    snapshot,
    click,
    clickUnlabelled,
    clickDescribed,
    fill,
    select,
    expectVisible,
    screenshot,
    currentUrl,
    settle
  };
};

export type BrowserTools = ReturnType<typeof createBrowserTools>;
