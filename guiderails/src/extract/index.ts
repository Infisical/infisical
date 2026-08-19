import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  GuideDoc,
  GuideStep,
  ImageRef,
  Procedure,
  UnverifiedRegion
} from "../types.js";
import {
  attr,
  childrenOf,
  inlineSnippets,
  isJsx,
  lineOf,
  parseMdx,
  readFrontmatter,
  type Node
} from "./ast.js";
import { createImageResolver } from "./images.js";
import { buildStep, plainText, type StepContext } from "./step.js";

/**
 * Verbs that mark a sentence as an instruction rather than description. Used to decide
 * whether a numbered list is a procedure and which prose paragraphs are steps.
 */
const UI_VERB =
  /\b(?:click(?:ing)?|select(?:ing)?|navigat(?:e|ing)|press(?:ing)?|choos(?:e|ing)|enter(?:ing)?|fill(?:ing)?(?:\s+in)?|go\s+to|head\s+(?:to|over\s+to)|open(?:ing)?|toggl(?:e|ing)|tap(?:ping)?|type|paste|switch\s+to|expand|scroll)\b/i;

/** The tab we walk when a page offers alternatives. */
const DEFAULT_TAB = "Infisical UI";

const looksLikeProcedureList = (node: Node): boolean => {
  if (node.type !== "list" || !node.ordered) return false;
  const items = childrenOf(node);
  if (items.length < 2) return false;
  const withVerb = items.filter((item) => UI_VERB.test(plainText(childrenOf(item)))).length;
  return withVerb * 2 >= items.length;
};

type FlattenResult = {
  /** Content nodes in reading order, with tab alternatives already resolved. */
  nodes: Node[];
  unverified: UnverifiedRegion[];
  availableTabs: string[];
  chosenTab: string | null;
};

/**
 * Resolves `<Tabs>` down to a single branch and flattens the rest of the tree into a
 * linear reading order.
 *
 * 268 files use tabs, and the `Infisical UI` / `API` pair appears 179 times. Walking every
 * branch would double-count the same procedure and try to click through a curl example, so
 * one branch is chosen and the others are recorded as explicitly unverified. They are
 * reported rather than dropped: a guide whose API tab we skipped must never read as fully
 * verified.
 */
const flatten = (nodes: Node[], preferredTab: string | null): FlattenResult => {
  const unverified: UnverifiedRegion[] = [];
  const availableTabs: string[] = [];
  let chosenTab: string | null = null;

  const want = (preferredTab ?? DEFAULT_TAB).toLowerCase();

  const walk = (list: Node[]): Node[] => {
    const out: Node[] = [];

    for (const node of list) {
      if (isJsx(node, "Tabs")) {
        const tabs = childrenOf(node).filter((child) => isJsx(child, "Tab"));
        const titles = tabs.map((tab) => attr(tab, "title") ?? "");
        availableTabs.push(...titles.filter(Boolean));

        const preferredIndex = titles.findIndex((title) => title.toLowerCase() === want);
        const index = preferredIndex >= 0 ? preferredIndex : 0;

        tabs.forEach((tab, i) => {
          const title = titles[i] ?? "";
          if (i === index) {
            chosenTab = title || chosenTab;
            return;
          }
          unverified.push({
            reason: `Alternative "${title}" tab not walked; only the "${titles[index] ?? ""}" tab is verified.`,
            tab: title,
            line: lineOf(tab)
          });
        });

        const chosen = tabs[index];
        if (chosen) out.push(...walk(childrenOf(chosen)));
        continue;
      }

      // Steps must survive as a unit so procedure grouping can see the boundary.
      if (isJsx(node, "Steps")) {
        out.push(node);
        continue;
      }

      // Accordions and layout wrappers hold real content; descend into them.
      if (isJsx(node, "Accordion", "AccordionGroup", "Frame", "Card", "CardGroup", "Tooltip")) {
        out.push(...walk(childrenOf(node)));
        continue;
      }

      out.push(node);
    }

    return out;
  };

  return { nodes: walk(nodes), unverified, availableTabs, chosenTab };
};

/**
 * Groups the flattened stream into procedures, in descending order of how explicitly the
 * guide declares its own structure.
 *
 *   <Steps>       the style-guide form, 328 files
 *   numbered list 43 files under docs/documentation use this instead
 *   prose         pages like folder.mdx describe actions in running text
 *
 * The prose fallback only engages when neither of the first two produced anything, so a
 * page with real Steps never also emits a speculative prose procedure.
 */
const buildProcedures = (nodes: Node[], ctx: StepContext): Procedure[] => {
  const procedures: Procedure[] = [];
  let heading: string | null = null;

  const push = (
    kind: Procedure["kind"],
    steps: GuideStep[],
    line: number,
    under: string | null
  ): void => {
    if (steps.length === 0) return;
    procedures.push({ index: procedures.length + 1, heading: under, kind, steps, line });
  };

  for (const node of nodes) {
    if (node.type === "heading") {
      heading = plainText(childrenOf(node)).trim() || null;
      continue;
    }

    if (isJsx(node, "Steps")) {
      const steps = childrenOf(node)
        .filter((child) => isJsx(child, "Step"))
        .map((child, i) =>
          buildStep(
            {
              index: i + 1,
              title: attr(child, "title"),
              body: childrenOf(child),
              line: lineOf(child),
              file: child._grFile ?? ctx.guideFile
            },
            ctx
          )
        );
      push("steps", steps, lineOf(node), heading);
      continue;
    }

    if (looksLikeProcedureList(node)) {
      const steps = childrenOf(node).map((item, i) =>
        buildStep(
          {
            index: i + 1,
            title: null,
            body: childrenOf(item),
            line: lineOf(item),
            file: item._grFile ?? ctx.guideFile
          },
          ctx
        )
      );
      push("ordered-list", steps, lineOf(node), heading);
    }
  }

  if (procedures.length > 0) return procedures;

  /**
   * Prose fallback. Each action-bearing paragraph becomes one step; a paragraph often
   * contains several actions, and turning one step into several actions is the compiler's
   * job rather than something to guess at from sentence splitting.
   *
   * A heading change closes the current procedure. On a page like folder.mdx that is not
   * cosmetic: "Managing folders", "Comparing folders" and "Replicating Folder Contents"
   * are three independent flows that must not be walked as one nine-step sequence.
   */
  let proseSteps: GuideStep[] = [];
  let proseHeading: string | null = null;
  let firstLine = 0;

  const flushProse = (): void => {
    push("prose", proseSteps, firstLine, proseHeading);
    proseSteps = [];
  };

  for (const node of nodes) {
    if (node.type === "heading") {
      flushProse();
      proseHeading = plainText(childrenOf(node)).trim() || null;
      continue;
    }
    if (node.type !== "paragraph") continue;
    const text = plainText(childrenOf(node));
    if (!UI_VERB.test(text)) continue;

    if (proseSteps.length === 0) firstLine = lineOf(node);
    proseSteps.push(
      buildStep(
        {
          index: proseSteps.length + 1,
          title: null,
          body: [node],
          line: lineOf(node),
          file: node._grFile ?? ctx.guideFile
        },
        ctx
      )
    );
  }
  flushProse();

  return procedures;
};

/** Every image in the file, including ones outside any procedure. Drives the linter. */
const collectAllImages = (nodes: Node[], ctx: StepContext): ImageRef[] => {
  const out: ImageRef[] = [];

  const walk = (list: Node[]): void => {
    for (const node of list) {
      if (node.type === "image") {
        out.push(
          ctx.images.resolve(
            node.url ?? "",
            node._grFile ?? ctx.guideFile,
            node.alt ?? "",
            lineOf(node)
          )
        );
      } else if (isJsx(node, "img")) {
        const src = attr(node, "src");
        if (src) {
          out.push(
            ctx.images.resolve(
              src,
              node._grFile ?? ctx.guideFile,
              attr(node, "alt") ?? "",
              lineOf(node)
            )
          );
        }
      }
      walk(childrenOf(node));
    }
  };

  walk(nodes);
  return out;
};

/**
 * Hash over the semantic content only, so cosmetic edits (reflowed prose, a reworded
 * callout) do not invalidate a committed plan while a changed button label does.
 */
const hashDoc = (doc: Omit<GuideDoc, "contentHash">): string => {
  const semantic = doc.procedures.map((procedure) => ({
    kind: procedure.kind,
    steps: procedure.steps.map((step) => ({
      title: step.title,
      boldTargets: step.boldTargets,
      navPaths: step.navPaths,
      images: step.images.map((image) => image.raw),
      fields: step.fields.map((field) => field.label),
      prose: step.prose
    }))
  }));
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ guide: doc.guide, tab: doc.tab, semantic }))
    .digest("hex");
};

export type ExtractOptions = {
  /** Repo root, used to make `guide` paths repo-relative. */
  repoRoot: string;
  docsRoot: string;
  /** Overrides the default `Infisical UI` tab choice. */
  tab?: string | null;
};

export const extractGuide = (absolutePath: string, options: ExtractOptions): GuideDoc => {
  const source = fs.readFileSync(absolutePath, "utf8");
  const root = parseMdx(source);

  const frontmatter = readFrontmatter(root);
  const { children } = inlineSnippets(root, options.docsRoot, absolutePath);

  const flattened = flatten(children, options.tab ?? null);

  const ctx: StepContext = {
    images: createImageResolver(options.docsRoot),
    guideFile: absolutePath
  };

  const procedures = buildProcedures(flattened.nodes, ctx);
  const allImages = collectAllImages(children, ctx);

  const guide = path.relative(options.repoRoot, absolutePath);
  const title =
    typeof frontmatter.title === "string" && frontmatter.title.trim()
      ? frontmatter.title.trim()
      : path.basename(absolutePath, ".mdx");
  const description =
    typeof frontmatter.description === "string" ? frontmatter.description : null;

  const draft: Omit<GuideDoc, "contentHash"> = {
    guide,
    title,
    description,
    frontmatter,
    tab: flattened.chosenTab,
    availableTabs: [...new Set(flattened.availableTabs)],
    procedures,
    unverified: flattened.unverified,
    allImages
  };

  return { ...draft, contentHash: hashDoc(draft) };
};

export { createImageResolver } from "./images.js";
