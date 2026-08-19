import type { Callout, CodeBlock, FieldSpec, GuideStep, ImageRef } from "../types.js";
import { attr, childrenOf, hasAttr, isJsx, lineOf, type Node } from "./ast.js";
import type { ImageResolver } from "./images.js";
import { extractNavPaths, isNavPath, type InlineToken } from "./nav.js";

const CALLOUT_NAMES: Record<string, Callout["kind"]> = {
  note: "Note",
  warning: "Warning",
  tip: "Tip",
  info: "Info",
  check: "Check",
  danger: "Danger"
};

/**
 * Separates a field label from its description in the
 * `- **Label** — description` bullet convention. Covers the em dash, en dash,
 * hyphen and colon forms, all of which appear in docs/.
 */
const FIELD_SEPARATOR = /^\s*(?:[—–-]|:)\s*/;

/**
 * Trailing punctuation is documentation syntax, not part of the UI string. `**Max Views:**`
 * labels a control called "Max Views", and searching the accessibility tree for the colon
 * would never match.
 */
const stripLabelPunctuation = (label: string): string => label.replace(/[\s:—–-]+$/, "").trim();

export type StepContext = {
  images: ImageResolver;
  guideFile: string;
};

const fileOf = (node: Node, ctx: StepContext): string => node._grFile ?? ctx.guideFile;

// ---------------------------------------------------------------------------
// Inline text
// ---------------------------------------------------------------------------

const plainText = (nodes: Node[]): string => {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text" || node.type === "inlineCode") out += node.value ?? "";
    else if (node.type === "break") out += " ";
    else if (node.type === "mdxTextExpression" || node.type === "mdxFlowExpression") continue;
    else out += plainText(childrenOf(node));
  }
  return out;
};

/**
 * Flattens inline content into a bold/plain token stream. The stream is what nav-path
 * detection needs: `**Project** > **Integrations**` is only one breadcrumb because the
 * text between the two bold spans is exactly a separator, and that is invisible once the
 * content has been flattened to a single string.
 *
 * Inline code counts as bold. Both are ways of explicitly delimiting a UI target, and
 * about 6% of imperative instructions in docs/ use backticks where the style guide would
 * use bold (`select \`encrypt data\``).
 */
const inlineTokens = (nodes: Node[]): InlineToken[] => {
  const tokens: InlineToken[] = [];

  const walk = (list: Node[], bold: boolean): void => {
    for (const node of list) {
      switch (node.type) {
        case "text":
          tokens.push({ bold, text: node.value ?? "" });
          break;
        case "inlineCode":
          tokens.push({ bold: true, text: node.value ?? "" });
          break;
        case "strong":
          walk(childrenOf(node), true);
          break;
        case "break":
          tokens.push({ bold: false, text: " " });
          break;
        case "image":
        case "mdxTextExpression":
        case "mdxFlowExpression":
          break;
        default:
          walk(childrenOf(node), bold);
      }
    }
  };

  walk(nodes, false);
  return tokens;
};

/** Merges adjacent same-emphasis tokens so a split `strong` reads as one target. */
const coalesce = (tokens: InlineToken[]): InlineToken[] => {
  const out: InlineToken[] = [];
  for (const token of tokens) {
    const last = out[out.length - 1];
    if (last && last.bold === token.bold) last.text += token.text;
    else out.push({ ...token });
  }
  return out;
};

// ---------------------------------------------------------------------------
// Step assembly
// ---------------------------------------------------------------------------

type Collected = {
  images: ImageRef[];
  codeBlocks: CodeBlock[];
  callouts: Callout[];
  fields: FieldSpec[];
  /** Nodes that contribute to the step's own instruction text. */
  textNodes: Node[];
};

const emptyCollected = (): Collected => ({
  images: [],
  codeBlocks: [],
  callouts: [],
  fields: [],
  textNodes: []
});

const readImageNode = (node: Node, ctx: StepContext): ImageRef | null => {
  if (node.type === "image") {
    return ctx.images.resolve(node.url ?? "", fileOf(node, ctx), node.alt ?? "", lineOf(node));
  }
  if (isJsx(node, "img")) {
    const src = attr(node, "src");
    if (!src) return null;
    return ctx.images.resolve(src, fileOf(node, ctx), attr(node, "alt") ?? "", lineOf(node));
  }
  return null;
};

/**
 * A field-documentation bullet rather than an action. Two spellings occur in docs/, and
 * they differ in where the punctuation sits relative to the bold span:
 *
 *   - **Privilege Name** — A slug-friendly identifier.   separator outside the bold
 *   - **Name (optional):** A friendly name.              colon inside the bold
 *
 * Recognising both keeps modal-field documentation out of the instruction text, where it
 * would otherwise read as a list of things to click.
 */
const readFieldBullet = (item: Node): FieldSpec | null => {
  const [firstChild] = childrenOf(item);
  if (!firstChild) return null;

  const inline = firstChild.type === "paragraph" ? childrenOf(firstChild) : childrenOf(item);
  const [head, ...rest] = inline;
  if (!head || head.type !== "strong") return null;

  const rawLabel = plainText(childrenOf(head)).trim();
  if (!rawLabel) return null;

  const colonInsideBold = rawLabel.endsWith(":");
  const remainder = plainText(rest).trim();

  // Without either punctuation form this is an ordinary bolded lead-in, not a field.
  if (!colonInsideBold && !FIELD_SEPARATOR.test(remainder)) return null;

  return {
    label: stripLabelPunctuation(rawLabel),
    description: remainder.replace(FIELD_SEPARATOR, "").trim(),
    required: false,
    type: null
  };
};

const readParamField = (node: Node): FieldSpec => ({
  label: attr(node, "path") ?? attr(node, "name") ?? "",
  description: plainText(childrenOf(node)).trim(),
  required: hasAttr(node, "required"),
  type: attr(node, "type")
});

/**
 * Walks a step's body, sorting content into the buckets a plan needs. Recurses through
 * layout-only wrappers (`<Frame>`, `<Tooltip>`) so a framed screenshot is still found,
 * and pulls callout bodies out of the instruction text so a `<Warning>` is not read as
 * another action.
 */
/**
 * Finds every screenshot in a step body, at any depth.
 *
 * Has to be a recursive pass of its own. A markdown `![alt](url)` is an `image` node nested
 * inside a `paragraph`, and `<img>` is often wrapped in a `<Frame>`, so inspecting only the
 * step body's top-level nodes finds nothing at all. That was a silent bug: every step reported
 * zero screenshots while the document-level count was correct, which made the whole screenshot
 * comparison path a no-op and looked like a model failure rather than a parser one.
 */
const harvestImages = (nodes: Node[], ctx: StepContext, into: ImageRef[]): void => {
  for (const node of nodes) {
    const image = readImageNode(node, ctx);
    if (image) {
      into.push(image);
      continue;
    }
    harvestImages(childrenOf(node), ctx, into);
  }
};

const collect = (nodes: Node[], ctx: StepContext, into: Collected): void => {
  for (const node of nodes) {
    // Images are harvested separately by harvestImages; skip them here so a top-level one is
    // not counted twice. They contribute no text either way.
    if (readImageNode(node, ctx)) continue;

    if (node.type === "code") {
      into.codeBlocks.push({
        lang: node.lang ?? null,
        value: node.value ?? "",
        line: lineOf(node)
      });
      continue;
    }

    if (isJsx(node)) {
      const name = (node.name ?? "").toLowerCase();

      const calloutKind = CALLOUT_NAMES[name];
      if (calloutKind) {
        into.callouts.push({
          kind: calloutKind,
          text: plainText(childrenOf(node)).trim(),
          line: lineOf(node)
        });
        continue;
      }

      if (name === "paramfield") {
        into.fields.push(readParamField(node));
        continue;
      }

      // Layout-only wrappers: descend, but contribute nothing themselves.
      collect(childrenOf(node), ctx, into);
      continue;
    }

    if (node.type === "list") {
      let anyField = false;
      for (const item of childrenOf(node)) {
        const field = readFieldBullet(item);
        if (field) {
          into.fields.push(field);
          anyField = true;
        }
      }
      // A list of field documentation is not instruction text; a list of actions is.
      if (!anyField) into.textNodes.push(node);
      else {
        for (const item of childrenOf(node)) {
          if (!readFieldBullet(item)) into.textNodes.push(item);
        }
      }
      continue;
    }

    into.textNodes.push(node);
  }
};

export const buildStep = (
  params: {
    index: number;
    title: string | null;
    body: Node[];
    line: number;
    file: string;
  },
  ctx: StepContext
): GuideStep => {
  const collected = emptyCollected();
  harvestImages(params.body, ctx, collected.images);
  collect(params.body, ctx, collected);

  // The title is frequently the entire instruction, so it leads the token stream and
  // contributes its own targets. In several guides the body is nothing but a screenshot.
  const titleTokens: InlineToken[] = params.title
    ? [{ bold: false, text: `${params.title}. ` }]
    : [];
  const bodyTokens = inlineTokens(collected.textNodes);
  const tokens = coalesce([...titleTokens, ...bodyTokens]);

  const navPaths = extractNavPaths(tokens);

  const boldTargets: string[] = [];
  for (const token of tokens) {
    if (!token.bold) continue;
    // Multi-segment bold spans are breadcrumbs; navPaths already owns them.
    if (isNavPath(token.text.trim())) continue;
    const text = stripLabelPunctuation(token.text);
    if (!text) continue;
    if (!boldTargets.includes(text)) boldTargets.push(text);
  }

  const prose = [params.title, plainText(collected.textNodes)]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(". ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    index: params.index,
    title: params.title,
    prose,
    boldTargets,
    navPaths,
    images: collected.images,
    codeBlocks: collected.codeBlocks,
    fields: collected.fields,
    callouts: collected.callouts,
    line: params.line,
    file: params.file
  };
};

export { plainText, inlineTokens };
