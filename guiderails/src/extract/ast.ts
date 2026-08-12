import fs from "node:fs";
import path from "node:path";

import remarkFrontmatter from "remark-frontmatter";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parse as parseYaml } from "yaml";

/**
 * A deliberately structural node type rather than the full mdast + mdast-util-mdx-jsx
 * type surface. The extractor only ever reads a handful of fields, and every one of them
 * is optional in practice, so a narrow local shape is more honest than casting between
 * a dozen imported union members.
 */
export type Node = {
  type: string;
  name?: string | null;
  value?: string;
  lang?: string | null;
  ordered?: boolean;
  depth?: number;
  url?: string;
  alt?: string | null;
  attributes?: JsxAttribute[];
  children?: Node[];
  position?: { start: { line: number }; end: { line: number } };
  /** Stamped during snippet inlining so line numbers stay attributable. */
  _grFile?: string;
};

export type JsxAttribute = {
  type: string;
  name?: string | null;
  value?: string | { type?: string; value?: string } | null;
};

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkMdx);

export const parseMdx = (source: string): Node => processor.parse(source) as unknown as Node;

export const lineOf = (node: Node): number => node.position?.start.line ?? 0;

export const childrenOf = (node: Node): Node[] => node.children ?? [];

/** Reads a JSX attribute as a plain string. Expression-valued attributes yield null. */
export const attr = (node: Node, name: string): string | null => {
  for (const attribute of node.attributes ?? []) {
    if (attribute.type !== "mdxJsxAttribute" || attribute.name !== name) continue;
    const { value } = attribute;
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && typeof value.value === "string") {
      // An expression attribute such as title={`...`}. Best-effort: strip quotes/backticks.
      return value.value.replace(/^[`'"]|[`'"]$/g, "");
    }
    // A bare attribute (`required`) has value null and is truthy by presence.
    if (value === null) return "";
  }
  return null;
};

export const hasAttr = (node: Node, name: string): boolean =>
  (node.attributes ?? []).some(
    (attribute) => attribute.type === "mdxJsxAttribute" && attribute.name === name
  );

export const isJsx = (node: Node, ...names: string[]): boolean => {
  if (node.type !== "mdxJsxFlowElement" && node.type !== "mdxJsxTextElement") return false;
  if (names.length === 0) return true;
  const name = node.name ?? "";
  return names.some((candidate) => candidate.toLowerCase() === name.toLowerCase());
};

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

export type Frontmatter = Record<string, unknown>;

export const readFrontmatter = (root: Node): Frontmatter => {
  const yamlNode = childrenOf(root).find((child) => child.type === "yaml");
  if (!yamlNode?.value) return {};
  try {
    const parsed = parseYaml(yamlNode.value);
    return parsed && typeof parsed === "object" ? (parsed as Frontmatter) : {};
  } catch {
    return {};
  }
};

// ---------------------------------------------------------------------------
// Snippet inlining
// ---------------------------------------------------------------------------

/**
 * `docs/snippets/` files are imported as components and rendered inline, so a page that
 * looks two steps long can expand to thirteen. Inlining has to be recursive: two of the
 * kubernetes templating snippets import a third.
 *
 * Only .mdx snippets are inlined. The seven .jsx snippets are interactive React browsers
 * with no prose steps in them; treating their source as content would produce garbage.
 */

const IMPORT_PATTERN = /import\s+(\w+)\s+from\s+["']([^"']+)["']/g;

const collectImports = (root: Node): Map<string, string> => {
  const imports = new Map<string, string>();
  for (const child of childrenOf(root)) {
    if (child.type !== "mdxjsEsm" || !child.value) continue;
    for (const match of child.value.matchAll(IMPORT_PATTERN)) {
      const [, name, source] = match;
      if (name && source) imports.set(name, source);
    }
  }
  return imports;
};

/** Recursively stamp a subtree so every node reports the file it really came from. */
const stampFile = (node: Node, file: string): void => {
  node._grFile = file;
  for (const child of childrenOf(node)) stampFile(child, file);
};

const resolveSnippetPath = (source: string, docsRoot: string, containingFile: string): string =>
  source.startsWith("/")
    ? path.join(docsRoot, source)
    : path.resolve(path.dirname(containingFile), source);

export type InlineResult = {
  children: Node[];
  /** Snippet files that were pulled in, for cache invalidation and hashing. */
  inlinedFiles: string[];
};

export const inlineSnippets = (
  root: Node,
  docsRoot: string,
  guideFile: string
): InlineResult => {
  const inlinedFiles: string[] = [];

  /**
   * `inherited` carries the enclosing file's import map downward. Imports are only ever
   * declared at a file's root, but the components they name are used arbitrarily deep
   * (`<ConfigureProject />` inside a `<Tab>` inside a `<Steps>`), so re-collecting per
   * node would leave every nested usage unexpanded.
   */
  const expand = (
    node: Node,
    file: string,
    stack: string[],
    inherited: Map<string, string>
  ): Node[] => {
    const imports = new Map([...inherited, ...collectImports(node)]);

    const out: Node[] = [];
    for (const child of childrenOf(node)) {
      // Import declarations and JSX comments carry no reader-visible content.
      if (child.type === "mdxjsEsm" || child.type === "mdxFlowExpression") continue;

      const componentName = isJsx(child) ? (child.name ?? "") : "";
      const importSource = componentName ? imports.get(componentName) : undefined;

      if (importSource && importSource.endsWith(".mdx")) {
        const snippetPath = resolveSnippetPath(importSource, docsRoot, file);

        // Cycle guard. A snippet importing an ancestor would otherwise recurse forever.
        if (stack.includes(snippetPath)) continue;
        if (!fs.existsSync(snippetPath)) continue;

        const snippetRoot = parseMdx(fs.readFileSync(snippetPath, "utf8"));
        stampFile(snippetRoot, snippetPath);
        inlinedFiles.push(snippetPath);

        // A snippet's own imports start from its own root, not the importer's.
        out.push(...expand(snippetRoot, snippetPath, [...stack, snippetPath], new Map()));
        continue;
      }

      // Non-mdx component imports (the .jsx browsers) render no prose; drop them.
      if (importSource) continue;

      if (child.children) {
        child.children = expand(child, file, stack, imports);
      }
      out.push(child);
    }

    return out;
  };

  return {
    children: expand(root, guideFile, [guideFile], new Map()),
    inlinedFiles: [...new Set(inlinedFiles)]
  };
};
