import { indentWithTab } from "@codemirror/commands";
import { EditorState, Transaction } from "@codemirror/state";
import { describe, expect, test } from "vitest";

import { codeEditorEditing, codeEditorKeymap, lineEndingsFor } from "./codeEditorExtensions";
import { getValueSync, isCrlfText } from "./getChangedRange";

const createState = (doc: string, extensions = [codeEditorEditing]) =>
  EditorState.create({ doc, extensions: [...extensions, lineEndingsFor(doc)] });

const runTab = (state: EditorState, readOnly = false) => {
  let next = state;
  const target = readOnly
    ? EditorState.create({
        doc: state.doc,
        selection: state.selection,
        extensions: [codeEditorEditing, EditorState.readOnly.of(true)]
      })
    : state;
  const handled = indentWithTab.run!({
    state: target,
    dispatch: (tr: Transaction) => {
      next = tr.state;
    }
  } as never);
  return { handled, text: next.sliceDoc() };
};

describe("CRLF files", () => {
  const crlf = "---\r\nname: a\r\n---\r\n\r\nline one\r\nline two\r\n";

  test("a one-line edit keeps every other line ending", () => {
    const state = createState(crlf);
    expect(state.doc.lines).toBe(7);
    const at = state.doc.toString().indexOf("line one") + "line one".length;
    const typed = state.update({ changes: { from: at, insert: "X" } }).state;
    expect(typed.sliceDoc()).toBe(crlf.replace("line one", "line oneX"));

    const enter = typed.update({ changes: { from: at, insert: typed.lineBreak } }).state;
    expect(enter.sliceDoc()).toBe(crlf.replace("line one", "line one\r\nX"));
  });

  test("an outside change to one line is applied as that line only", () => {
    const state = createState(crlf);
    const next = crlf.replace("line two", "line two edited");
    const sync = getValueSync(state, next);
    expect(sync).toEqual({
      from: state.doc.toString().indexOf("line two") + 8,
      to: state.doc.toString().indexOf("line two") + 8,
      insert: " edited"
    });
    const synced = state.update({ changes: sync as Exclude<typeof sync, "replace" | null> }).state;
    expect(synced.sliceDoc()).toBe(next);
    expect(getValueSync(synced, next)).toBeNull();
  });

  test("a mixed file keeps today's handling, without merging its \\n lines", () => {
    const mixed = "a\r\nb\nc\r\n";
    expect(isCrlfText(mixed)).toBe(false);
    const state = createState(mixed);
    expect(state.lineBreak).toBe("\n");
    expect(state.doc.lines).toBe(4);
    expect(getValueSync(state, mixed)).toBeNull();
  });

  test("an LF file is unchanged", () => {
    const state = createState("a\nb\n");
    expect(state.lineBreak).toBe("\n");
    const typed = state.update({ changes: { from: 1, insert: "X" } }).state;
    expect(typed.sliceDoc()).toBe("aX\nb\n");
  });

  test("a value whose line endings change needs a new state", () => {
    expect(getValueSync(createState("a\nb\n"), "a\r\nb\r\n")).toBe("replace");
    expect(getValueSync(createState("a\r\nb\r\n"), "a\nb\n")).toBe("replace");
    expect(getValueSync(createState("a\r\nb\r\n"), "ab")).toEqual({ from: 1, to: 4, insert: "b" });
  });
});

describe("Tab", () => {
  test("is bound to indent", () => {
    expect(codeEditorKeymap[0]).toBe(indentWithTab);
  });

  test("indents with two spaces, never a tab character", () => {
    const { handled, text } = runTab(createState("a\nb"));
    expect(handled).toBe(true);
    expect(text).toBe("  a\nb");
    expect(text).not.toContain("\t");
  });

  test("does nothing in a read-only editor, so the focus can move on", () => {
    expect(runTab(createState("a"), true).handled).toBe(false);
  });
});
