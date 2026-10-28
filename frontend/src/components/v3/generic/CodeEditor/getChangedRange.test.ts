import { history, undo } from "@codemirror/commands";
import { EditorState, Transaction } from "@codemirror/state";
import { describe, expect, test } from "vitest";

import { getChangedRange } from "./getChangedRange";

const createView = (doc: string) => {
  const view = { state: EditorState.create({ doc, extensions: [history()] }) };
  return {
    view,
    edit: (from: number, to: number, insert = "") => {
      view.state = view.state.update({ changes: { from, to, insert } }).state;
    },
    syncFromOutside: (value: string) => {
      view.state = view.state.update({
        changes: getChangedRange(view.state.doc.toString(), value),
        annotations: Transaction.addToHistory.of(false)
      }).state;
    },
    undo: () =>
      undo({
        state: view.state,
        dispatch: (tr) => {
          view.state = tr.state;
        }
      })
  };
};

describe("getChangedRange", () => {
  test("covers only the text between the common prefix and suffix", () => {
    expect(getChangedRange("name: a\nbody", "name: abc\nbody")).toEqual({
      from: 7,
      to: 7,
      insert: "bc"
    });
    expect(getChangedRange("abc", "abc")).toEqual({ from: 3, to: 3, insert: "" });
    expect(getChangedRange("", "new")).toEqual({ from: 0, to: 0, insert: "new" });
    expect(getChangedRange("old", "")).toEqual({ from: 0, to: 3, insert: "" });
    expect(getChangedRange("aaa", "aa")).toEqual({ from: 2, to: 3, insert: "" });
  });

  test("keeps undo of typed text in place after the header is changed from outside", () => {
    const doc = "---\nname: a\ndescription: d\n---\n\n# Title\nbody";
    const editor = createView(doc);
    const end = doc.indexOf("body") + 4;
    editor.edit(end, end, " TYPED");

    editor.syncFromOutside(editor.view.state.doc.toString().replace("name: a", "name: abc"));
    editor.undo();

    expect(editor.view.state.doc.toString()).toBe(doc.replace("name: a", "name: abc"));
  });
});
