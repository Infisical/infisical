import { EditorState } from "@codemirror/state";

/** The smallest single replacement that turns `current` into `next`: the text between their common prefix and suffix. */
export const getChangedRange = (current: string, next: string) => {
  const max = Math.min(current.length, next.length);
  let start = 0;
  while (start < max && current[start] === next[start]) start += 1;
  let end = 0;
  while (end < max - start && current[current.length - 1 - end] === next[next.length - 1 - end])
    end += 1;
  return { from: start, to: current.length - end, insert: next.slice(start, next.length - end) };
};

// CodeMirror splits lines on \r\n and \r as well and its document joins them with \n, so a value is compared in that form.
export const toEditorText = (value: string) => value.replace(/\r\n?/g, "\n");

const LONE_LINE_BREAK_RE = /\r(?!\n)|(?<!\r)\n/;

/** A value whose every line break is \r\n, such as a file written on Windows. */
export const isCrlfText = (value: string) =>
  value.includes("\r\n") && !LONE_LINE_BREAK_RE.test(value);

/**
 * The change that brings an editor showing `state` to `value`, null when it already shows it, or "replace" when the
 * value's line endings don't fit the ones the state was made for, so it needs a new state.
 */
export const getValueSync = (state: EditorState, value: string) => {
  const isCrlfState = state.lineBreak === "\r\n";
  // A CRLF file edited down to one line keeps its state, so its undo history survives.
  if (isCrlfState ? LONE_LINE_BREAK_RE.test(value) : isCrlfText(value)) return "replace" as const;
  if (state.sliceDoc() === (isCrlfState ? value : toEditorText(value))) return null;
  // Positions count each line break as one character, so the range is found on the \n form of both texts.
  const range = getChangedRange(state.doc.toString(), toEditorText(value));
  return isCrlfState ? { ...range, insert: range.insert.replace(/\n/g, "\r\n") } : range;
};
