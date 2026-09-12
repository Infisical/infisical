import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeComboboxItems } from "./combobox-items";

const id = (value: string) => value;
describe("Combobox selected items", () => {
  it("retains a saved ID absent from a server page without fabricating an API record", () => {
    assert.deepEqual(mergeComboboxItems(["first-page"], ["saved-workspace"], id, true), [
      "first-page",
      "saved-workspace"
    ]);
  });
  it("can omit saved selections from search results without mutating the controlled value", () => {
    const selection = ["saved-workspace"];
    assert.deepEqual(mergeComboboxItems([], selection, id, false), []);
    assert.deepEqual(selection, ["saved-workspace"]);
  });
  it("deduplicates a selection when a later page includes it", () => {
    assert.deepEqual(mergeComboboxItems(["saved"], ["saved"], id, true), ["saved"]);
  });
  it("retains multiple missing selections without duplicating IDs", () => {
    assert.deepEqual(mergeComboboxItems(["a"], ["a", "b", "b", "c"], id, true), ["a", "b", "c"]);
  });
  it("drops the prior selection after clearing or switching parent scope", () => {
    assert.deepEqual(mergeComboboxItems(["new-parent"], [], id, true), ["new-parent"]);
  });
  it("preserves selected object identity when its ID is present in refreshed results", () => {
    const selected = { id: "one", label: "Selected" };
    assert.equal(
      mergeComboboxItems(
        [{ id: "one", label: "Reloaded" }],
        [selected],
        (option) => option.id,
        true
      )[0],
      selected
    );
  });
});
