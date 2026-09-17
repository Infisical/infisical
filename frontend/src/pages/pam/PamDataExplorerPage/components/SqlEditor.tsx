import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { MySQL, PostgreSQL, sql } from "@codemirror/lang-sql";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState, type Transaction } from "@codemirror/state";
import { EditorView, keymap, placeholder, type ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";

import type { SqlDialect } from "../sql-generation";

const infisicalTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", backgroundColor: "var(--color-card)" },
  "&.cm-editor": { backgroundColor: "var(--color-card)" },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace",
    backgroundColor: "var(--color-card)",
    scrollbarWidth: "thin",
    scrollbarColor: "var(--color-scrollbar-track-thumb) transparent"
  },
  ".cm-scroller::-webkit-scrollbar": { width: "4px", height: "4px" },
  ".cm-scroller::-webkit-scrollbar-track": { background: "transparent" },
  ".cm-scroller::-webkit-scrollbar-thumb": {
    background: "var(--color-scrollbar-track-thumb)",
    borderRadius: "2px"
  },
  ".cm-content": {
    padding: "8px 0",
    caretColor: "var(--color-project)",
    backgroundColor: "var(--color-card)"
  },
  ".cm-line": { backgroundColor: "transparent" },
  ".cm-gutters": {
    backgroundColor: "var(--color-card)",
    borderRight: "1px solid var(--color-border)",
    color: "#707174"
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 12px 0 8px" },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--color-border-control) 50%, transparent)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in srgb, var(--color-border-control) 50%, transparent)"
  },
  ".cm-cursor": { borderLeftColor: "var(--color-project)" },
  ".cm-selectionBackground": { backgroundColor: "var(--color-border-control) !important" },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--color-border-control) !important"
  },
  ".cm-matchingBracket": {
    backgroundColor: "var(--color-surface-selected)",
    color: "var(--color-project) !important"
  }
});

const infisicalHighlight = HighlightStyle.define(
  [
    { tag: tags.keyword, color: "#63b0bd", fontWeight: "600" },
    { tag: tags.string, color: "#29b866" },
    { tag: tags.number, color: "#f39c12" },
    { tag: tags.comment, color: "#707174", fontStyle: "italic" },
    { tag: tags.operator, color: "#adaeb0" },
    { tag: tags.punctuation, color: "#adaeb0" },
    { tag: tags.separator, color: "#adaeb0" },
    { tag: tags.bracket, color: "#adaeb0" },
    { tag: tags.name, color: "#ebebeb" },
    { tag: tags.function(tags.name), color: "#63b0bd" },
    { tag: tags.typeName, color: "#f39c12" },
    { tag: tags.bool, color: "#63b0bd" },
    { tag: tags.null, color: "#707174" },
    { tag: tags.special(tags.string), color: "#29b866" },
    { tag: tags.invalid, color: "#e74c3c" }
  ],
  { all: { color: "#ebebeb" } }
);

const MAX_SQL_BYTES = 50 * 1024; // 50KB — matches backend Zod limit

const maxSqlLength = EditorState.transactionFilter.of((tr: Transaction) => {
  if (tr.docChanged && tr.newDoc.length > MAX_SQL_BYTES) return [];
  return tr;
});

type Props = {
  value: string;
  onChange: (value: string) => void;
  onExecute: (sql: string) => void;
  onSelectionChange: (hasSelection: boolean) => void;
  onSqlToRunChange: (sql: string) => void;
  sqlDialect: SqlDialect;
};

export function SqlEditor({
  value,
  onChange,
  onExecute,
  onSelectionChange,
  onSqlToRunChange,
  sqlDialect
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onExecuteRef = useRef(onExecute);
  const onChangeRef = useRef(onChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onSqlToRunChangeRef = useRef(onSqlToRunChange);
  onExecuteRef.current = onExecute;
  onChangeRef.current = onChange;
  onSelectionChangeRef.current = onSelectionChange;
  onSqlToRunChangeRef.current = onSqlToRunChange;

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([
            {
              key: "Mod-Enter",
              run: (v) => {
                const selection = v.state.selection.main;
                const selectedText = selection.empty
                  ? v.state.doc.toString()
                  : v.state.sliceDoc(selection.from, selection.to);
                onExecuteRef.current(selectedText);
                return true;
              }
            },
            ...historyKeymap,
            ...defaultKeymap
          ]),
          maxSqlLength,
          placeholder("Start writing SQL..."),
          sql({ dialect: sqlDialect === "mysql" ? MySQL : PostgreSQL }),
          infisicalTheme,
          syntaxHighlighting(infisicalHighlight),
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged) {
              const doc = update.state.doc.toString();
              onChangeRef.current(doc);
              if (update.state.selection.main.empty) {
                onSqlToRunChangeRef.current(doc);
              }
            }
            if (update.selectionSet) {
              const selection = update.state.selection.main;
              if (selection.empty) {
                onSqlToRunChangeRef.current(update.state.doc.toString());
                onSelectionChangeRef.current(false);
              } else {
                onSqlToRunChangeRef.current(update.state.sliceDoc(selection.from, selection.to));
                onSelectionChangeRef.current(true);
              }
            }
          })
        ]
      }),
      parent: containerRef.current
    });

    viewRef.current = view;
    onSqlToRunChangeRef.current(value);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
