import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap, type ViewUpdate } from "@codemirror/view";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
};

export function SqlEditor({ value, onChange, onExecute }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onExecuteRef = useRef(onExecute);
  const onChangeRef = useRef(onChange);
  onExecuteRef.current = onExecute;
  onChangeRef.current = onChange;

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
              run: () => {
                onExecuteRef.current();
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
              onChangeRef.current(update.state.doc.toString());
            }
          })
        ]
      }),
      parent: containerRef.current
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes into the editor
  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      const current = view.state.doc.toString();
      if (current !== value) {
        view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
      }
    }
  }, [value]);

  return <div ref={containerRef} className="h-full w-full" />;
}
