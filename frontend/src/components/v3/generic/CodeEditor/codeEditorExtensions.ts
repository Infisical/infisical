import { defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

import { isCrlfText } from "./getChangedRange";

// Tab indents rather than moving the focus; a read-only editor refuses the indent, so Tab still moves on there.
export const codeEditorKeymap = [indentWithTab, ...historyKeymap, ...defaultKeymap];

export const codeEditorEditing = [indentUnit.of("  "), keymap.of(codeEditorKeymap)];

/**
 * Keeps a CRLF file's line endings: lines are joined with \r\n, Enter inserts one, and pasted text is converted to
 * them, so typing one character doesn't rewrite every line ending in the file.
 */
export const lineEndingsFor = (value: string) =>
  isCrlfText(value)
    ? [
        EditorState.lineSeparator.of("\r\n"),
        EditorView.clipboardInputFilter.of((text) => text.replace(/\r\n?|\n/g, "\r\n"))
      ]
    : [];
