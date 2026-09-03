import type { Page } from "@playwright/test";

/**
 * Addressing controls the app gives no accessible name.
 *
 * `frontend/` renders roughly 628 `IconButton`s and only about 258 of them carry an `aria-label`.
 * One of the unlabelled ones is the chevron beside Add Secret, which `folder.mdx` step 1 asks the
 * reader to click. Addressing by accessible name alone therefore fails on a guide that is correct
 * about a control that exists, and the failure reads like a documentation defect.
 *
 * A reader identifies these controls two ways, and both survive into the DOM:
 *
 *  - **The icon.** lucide renders `class="lucide lucide-chevron-down"`, FontAwesome renders
 *    `data-icon="trash"`. That is usually the guide's own word for the control ("the chevron").
 *  - **The text beside it.** Which may sit on either side: the chevron follows the button named
 *    "Add Secret", while the unlabelled switch on the share dialog is followed by the text
 *    "Limit access to people within organization".
 *
 * So the agent is shown a numbered list of these controls, described that way, and picks from it.
 * That is a real weakening of the original rule against positional fallbacks, taken deliberately:
 * a described choice from an enumerated list is a much smaller risk than the systematic false
 * blocking it replaces, and `clickUnlabelled` re-verifies the description before it clicks.
 */

export type UnlabelledControl = {
  /** 1-based, as shown to the agent. Only valid until the page changes. */
  index: number;
  role: string;
  /** lucide or FontAwesome icon name, e.g. "chevron-down". Null when the control has no icon. */
  icon: string | null;
  /** Nearby text that identifies it, and which side of the control that text is on. */
  near: string | null;
  relation: "after" | "before" | "inside" | null;
  disabled: boolean;
  /** Position within `CONTROL_SELECTOR`, so a locator can be re-derived. Not shown to the agent. */
  domIndex: number;
};

/**
 * Everything a reader could click, type into or toggle.
 *
 * Order matters: Playwright resolves this same selector in document order, so `domIndex` from the
 * page-side scan indexes the same element as `page.locator(CONTROL_SELECTOR).nth(domIndex)`.
 */
export const CONTROL_SELECTOR =
  "button, a[href], input:not([type=hidden]), select, textarea, " +
  "[role=button], [role=tab], [role=menuitem], [role=option], [role=combobox], " +
  "[role=switch], [role=checkbox], [role=radio], [role=link]";

/** Enough to identify the control, short enough that twenty of them do not crowd out the tree. */
const MAX_NEAR_CHARS = 60;
const MAX_LISTED = 20;

/**
 * Makes the page tolerate esbuild's output.
 *
 * `tsx` transpiles with esbuild's `keepNames`, which wraps every named function — including a
 * `const fn = () => {}` inside an evaluate callback — in a `__name(...)` helper call. Playwright
 * serialises the callback with `toString()` and runs it in the page, where that helper does not
 * exist, so the scan dies with "__name is not defined".
 *
 * The argument is a string on purpose: Playwright evaluates a string as an expression verbatim, so
 * esbuild never gets the chance to rewrite this one. Re-run per scan rather than once at startup,
 * because a navigation discards it.
 */
const installNameShim = async (page: Page): Promise<void> => {
  await page.evaluate("globalThis.__name = globalThis.__name || ((fn) => fn)");
};

/**
 * Scans the page for controls with no accessible name.
 *
 * The name computation is an approximation of the real accessible-name algorithm, and deliberately
 * errs toward listing: a control wrongly listed costs one line the agent can ignore and is still
 * reachable by name, whereas a control wrongly omitted is exactly the failure this exists to fix.
 */
export const scanUnlabelled = async (page: Page): Promise<UnlabelledControl[]> => {
  await installNameShim(page);

  const found = await page.evaluate(
    ({ selector, maxNear }) => {
      const clean = (text: string | null | undefined): string =>
        (text ?? "").replace(/\s+/g, " ").trim();

      /**
       * Only the sources Playwright's own snapshot agrees with.
       *
       * A wrapping `<label>`, a `label[for=]` and an input's `value` were all tried and all
       * removed: they name controls that the accessibility tree still shows as anonymous, which
       * kept the real ones off the list. Over-listing costs the agent one line it can ignore, and
       * a control that does have a name stays reachable by name, so this errs toward listing.
       */
      const nameOf = (el: Element): string => {
        const labelledBy = el.getAttribute("aria-labelledby");
        const referenced = labelledBy
          ? labelledBy
              .split(" ")
              .map((id) => document.getElementById(id)?.textContent ?? "")
              .join(" ")
          : "";

        return clean(
          el.getAttribute("aria-label") ||
            referenced ||
            el.getAttribute("title") ||
            (el as HTMLElement).innerText ||
            el.getAttribute("placeholder") ||
            el.getAttribute("alt") ||
            ""
        );
      };

      const roleOf = (el: Element): string => {
        const explicit = el.getAttribute("role");
        if (explicit) return explicit;
        const tag = el.tagName.toLowerCase();
        if (tag === "a") return "link";
        if (tag === "input") return el.getAttribute("type") || "textbox";
        return tag;
      };

      const iconOf = (el: Element): string | null => {
        const svg = el.querySelector("svg");
        if (!svg) return null;
        // FontAwesome states the icon outright.
        const fontAwesome = svg.getAttribute("data-icon");
        if (fontAwesome) return fontAwesome;
        // lucide emits both "lucide-share2" and "lucide-share-2"; the longer one is the readable
        // form, and it is the one that matches how a guide would spell it.
        const matches = Array.from(
          (svg.getAttribute("class") || "").matchAll(/lucide-([a-z0-9-]+)/g)
        ).map((match) => match[1] ?? "");
        if (matches.length === 0) return null;
        return matches.sort((a, b) => b.length - a.length)[0] ?? null;
      };

      /**
       * Visible to a reader, not merely present.
       *
       * `aria-hidden` and `opacity: 0` matter more than they look: Radix pairs its switch with a
       * transparent `<input>` of the same size, which passes a bounding-box test and would list
       * every toggle twice. A reader never sees it, so neither should the agent.
       */
      const visible = (el: Element): boolean => {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return false;
        if (el.closest("[aria-hidden=true]")) return false;
        const style = window.getComputedStyle(el);
        return (
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          style.opacity !== "0" &&
          style.pointerEvents !== "none"
        );
      };

      /**
       * Which text identifies this control, and on which side.
       *
       * Sibling before, then sibling after, then the enclosing container, then any earlier named
       * control. The order is what the two real cases need: the chevron follows the "Add Secret"
       * button, and the share dialog's switch precedes its own label text.
       */
      const contextOf = (
        el: Element,
        earlierName: string
      ): { near: string | null; relation: "after" | "before" | "inside" | null } => {
        const previous = clean(el.previousElementSibling?.textContent);
        if (previous) return { near: previous.slice(0, maxNear), relation: "after" };

        const next = clean(el.nextElementSibling?.textContent);
        if (next) return { near: next.slice(0, maxNear), relation: "before" };

        let ancestor = el.parentElement;
        for (let depth = 0; ancestor && depth < 3; depth += 1) {
          const text = clean(ancestor.textContent);
          if (text) return { near: text.slice(0, maxNear), relation: "inside" };
          ancestor = ancestor.parentElement;
        }

        return earlierName
          ? { near: earlierName.slice(0, maxNear), relation: "after" }
          : { near: null, relation: null };
      };

      const all = Array.from(document.querySelectorAll(selector));
      const out: Omit<UnlabelledControl, "index">[] = [];
      let earlierName = "";

      all.forEach((el, domIndex) => {
        const name = nameOf(el);
        if (name) {
          if (visible(el)) earlierName = name;
          return;
        }
        if (!visible(el)) return;

        const { near, relation } = contextOf(el, earlierName);
        out.push({
          role: roleOf(el),
          icon: iconOf(el),
          near,
          relation,
          disabled: el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true",
          domIndex
        });
      });

      return out;
    },
    { selector: CONTROL_SELECTOR, maxNear: MAX_NEAR_CHARS }
  );

  return found
    .slice(0, MAX_LISTED)
    .map((control, position) => ({ ...control, index: position + 1 }));
};

/** How one control reads in the snapshot, and how it is matched again on the next scan. */
export const describeUnlabelled = (control: UnlabelledControl): string => {
  const icon = control.icon ? ` "${control.icon}"` : "";
  const where = control.near ? ` — ${control.relation} "${control.near}"` : "";
  const state = control.disabled ? " (disabled)" : "";
  return `${control.index}. ${control.role}${icon}${where}${state}`;
};

export const renderUnlabelled = (controls: UnlabelledControl[]): string => {
  if (controls.length === 0) return "";
  return [
    "",
    "Unlabelled controls (no accessible name — reach these with click_unlabelled):",
    ...controls.map((control) => `  ${describeUnlabelled(control)}`)
  ].join("\n");
};

/**
 * What gets recorded for replay: the description, never the index.
 *
 * An index is meaningful only against the scan that produced it, so a recording keyed on one would
 * click whatever happened to be third on the page a week later.
 */
export type UnlabelledDescriptor = {
  role: string;
  icon: string | null;
  near: string | null;
};

export const descriptorOf = (control: UnlabelledControl): UnlabelledDescriptor => ({
  role: control.role,
  icon: control.icon,
  near: control.near
});

export const sameControl = (
  descriptor: UnlabelledDescriptor,
  control: UnlabelledControl
): boolean =>
  descriptor.role === control.role &&
  descriptor.icon === control.icon &&
  descriptor.near === control.near;

export const describeDescriptor = (descriptor: UnlabelledDescriptor): string => {
  const icon = descriptor.icon ? ` "${descriptor.icon}"` : "";
  const where = descriptor.near ? ` near "${descriptor.near}"` : "";
  return `unlabelled ${descriptor.role}${icon}${where}`;
};
