import { useEffect, useRef } from "react";
import { history } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import {
  Annotation,
  Compartment,
  EditorState,
  type Extension,
  Transaction
} from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers as lineNumbersGutter,
  placeholder as placeholderText
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

import { cn } from "../../utils";
import { codeEditorEditing, lineEndingsFor } from "./codeEditorExtensions";
import { getValueSync } from "./getChangedRange";

type CodeEditorLanguage = "markdown" | "plain";

type CodeEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  language?: CodeEditorLanguage;
  isReadOnly?: boolean;
  hasLineNumbers?: boolean;
  hasLineWrapping?: boolean;
  placeholder?: string;
  /**
   * Names the document being edited. Changing it puts the current document's undo history and selection aside and
   * brings back the new one's, for as long as the editor stays mounted, so switching between files keeps each one's
   * history. A document whose text changed while it was away starts a fresh history.
   */
  stateKey?: string;
  /** Drops the border, radius and background, for an editor that fills a panel which already draws them. */
  isBorderless?: boolean;
  className?: string;
  "aria-label"?: string;
};

const editorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "12px", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--font-mono)",
    lineHeight: "1.6",
    scrollbarWidth: "thin",
    scrollbarColor: "var(--color-scrollbar-track-thumb) transparent"
  },
  ".cm-content": { padding: "8px 0", caretColor: "var(--color-foreground)" },
  ".cm-line": { padding: "0 12px" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid var(--color-border)",
    color: "var(--color-muted)"
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 12px", minWidth: "36px" },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--color-border-control) 35%, transparent)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in srgb, var(--color-border-control) 35%, transparent)",
    color: "var(--color-foreground)"
  },
  ".cm-cursor": { borderLeftColor: "var(--color-foreground)" },
  ".cm-selectionBackground": { backgroundColor: "var(--color-border-control) !important" },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--color-border-control) !important"
  },
  ".cm-placeholder": { color: "var(--color-muted)" }
});

const highlightStyle = HighlightStyle.define(
  [
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
    { tag: tags.number, color: "var(--color-warning)" },
    { tag: tags.comment, color: "var(--color-muted)", fontStyle: "italic" },
    { tag: tags.invalid, color: "var(--color-danger)" }
  ],
  { all: { color: "var(--color-foreground)" } }
);

// Marks the dispatch that copies a new `value` prop in, so it is not reported back through `onChange` or undone.
const externalSync = Annotation.define<boolean>();

const languageExtension = (language: CodeEditorLanguage): Extension =>
  language === "markdown" ? markdown() : [];

type TConfigurableOptions = Required<
  Pick<
    CodeEditorProps,
    "language" | "isReadOnly" | "hasLineNumbers" | "hasLineWrapping" | "placeholder"
  >
>;

const configurableExtensions = ({
  language,
  isReadOnly,
  hasLineNumbers,
  hasLineWrapping,
  placeholder
}: TConfigurableOptions): Extension => [
  languageExtension(language),
  EditorState.readOnly.of(isReadOnly),
  EditorView.editable.of(!isReadOnly),
  isReadOnly ? [] : [highlightActiveLine(), highlightActiveLineGutter()],
  hasLineNumbers ? lineNumbersGutter() : [],
  hasLineWrapping ? EditorView.lineWrapping : [],
  placeholder ? placeholderText(placeholder) : []
];

const CodeEditor = ({
  value,
  onChange,
  language = "plain",
  isReadOnly = false,
  hasLineNumbers = true,
  hasLineWrapping = false,
  placeholder = "",
  stateKey,
  isBorderless = false,
  className,
  "aria-label": ariaLabel
}: CodeEditorProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const savedStatesRef = useRef(new Map<string, EditorState>());
  const stateKeyRef = useRef(stateKey);

  const options = { language, isReadOnly, hasLineNumbers, hasLineWrapping, placeholder };

  const createState = (doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        history(),
        codeEditorEditing,
        lineEndingsFor(doc),
        editorTheme,
        syntaxHighlighting(highlightStyle),
        compartmentRef.current.of(configurableExtensions(options)),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          if (update.transactions.some((tr) => tr.annotation(externalSync))) return;
          onChangeRef.current?.(update.state.sliceDoc());
        })
      ]
    });

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const view = new EditorView({ state: createState(value), parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor is created once; later prop changes are applied by the effects below.
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartmentRef.current.reconfigure(configurableExtensions(options))
    });
  }, [language, isReadOnly, hasLineNumbers, hasLineWrapping, placeholder]);

  // Runs before the value effect below, so a swapped-in document is not then replaced as an edit.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || stateKeyRef.current === stateKey) return;
    if (stateKeyRef.current !== undefined) {
      savedStatesRef.current.set(stateKeyRef.current, view.state);
    }
    stateKeyRef.current = stateKey;
    const saved = stateKey === undefined ? undefined : savedStatesRef.current.get(stateKey);
    view.setState(saved && getValueSync(saved, value) === null ? saved : createState(value));
    // A saved state still holds the options it was put aside with.
    view.dispatch({
      effects: compartmentRef.current.reconfigure(configurableExtensions(options))
    });
    view.contentDOM.setAttribute("aria-label", ariaLabel ?? "");
  }, [stateKey]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const sync = getValueSync(view.state, value);
    if (!sync) return;
    if (sync === "replace") {
      view.setState(createState(value));
      view.contentDOM.setAttribute("aria-label", ariaLabel ?? "");
      return;
    }
    // Only the changed range is replaced, so undo history for the rest of the text still maps to the right places.
    view.dispatch({
      changes: sync,
      annotations: [externalSync.of(true), Transaction.addToHistory.of(false)]
    });
  }, [value]);

  useEffect(() => {
    viewRef.current?.contentDOM.setAttribute("aria-label", ariaLabel ?? "");
  }, [ariaLabel]);

  return (
    <div
      ref={containerRef}
      data-slot="code-editor"
      className={cn(
        "min-h-0 min-w-0 overflow-hidden text-foreground",
        isBorderless ? "bg-transparent" : "rounded-md border border-border bg-container",
        className
      )}
    />
  );
};

export { CodeEditor, type CodeEditorLanguage, type CodeEditorProps };
