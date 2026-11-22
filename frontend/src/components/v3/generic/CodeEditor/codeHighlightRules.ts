import type { TagStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// Kept apart from CodeEditor.tsx so read-only highlighting can share the palette without pulling the
// editor's view into its chunk.
export const CODE_HIGHLIGHT_RULES: TagStyle[] = [
  { tag: tags.heading, color: "var(--color-foreground)", fontWeight: "600" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--color-info)" },
  { tag: tags.monospace, color: "var(--color-success)" },
  { tag: tags.quote, color: "var(--color-label)", fontStyle: "italic" },
  {
    tag: [tags.processingInstruction, tags.contentSeparator, tags.meta],
    color: "var(--color-muted)"
  },
  { tag: tags.list, color: "var(--color-label)" },
  { tag: tags.keyword, color: "var(--color-info)" },
  { tag: tags.string, color: "var(--color-success)" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--color-warning)" },
  { tag: tags.comment, color: "var(--color-muted)", fontStyle: "italic" },
  { tag: tags.invalid, color: "var(--color-danger)" }
];
