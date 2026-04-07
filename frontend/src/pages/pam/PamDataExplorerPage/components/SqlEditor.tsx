import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap, type ViewUpdate } from "@codemirror/view";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onExecute: (sql: string) => void;
  onSelectionChange: (hasSelection: boolean) => void;
  onSqlToRunChange: (sql: string) => void;
};

export function SqlEditor({
  value,
  onChange,
  onExecute,
  onSelectionChange,
  onSqlToRunChange
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
          sql({ dialect: PostgreSQL }),
          oneDark,
          EditorView.theme({
            "&": { height: "100%", fontSize: "13px" },
            ".cm-scroller": {
              overflow: "auto",
              fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace"
            },
            ".cm-content": { padding: "8px 0" }
          }),
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
