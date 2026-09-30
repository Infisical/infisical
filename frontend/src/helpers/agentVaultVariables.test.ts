import { describe, expect, it } from "vitest";

import { findVariableReferenceAtCaret } from "./agentVaultVariables";

describe("findVariableReferenceAtCaret", () => {
  it("reads the whole key of an unfinished reference when the caret moves back into it", () => {
    const text = "{{API_TOKEN";
    expect(findVariableReferenceAtCaret(text, "{{API".length)).toEqual({
      start: 0,
      query: "API_TOKEN",
      end: text.length
    });
  });

  it("ends a closed reference after its braces, so a pick replaces all of it", () => {
    const text = "Bearer {{API_TOKEN}} rest";
    expect(findVariableReferenceAtCaret(text, "Bearer {{API".length)).toEqual({
      start: "Bearer ".length,
      query: "API_TOKEN",
      end: "Bearer {{API_TOKEN}}".length
    });
  });

  it("stops the key at the first character a key can't hold", () => {
    expect(findVariableReferenceAtCaret("{{AP-rest", "{{AP".length)).toEqual({
      start: 0,
      query: "AP",
      end: "{{AP".length
    });
  });

  it("finds nothing when the caret is outside a reference", () => {
    expect(findVariableReferenceAtCaret("{{API}} x", "{{API}} x".length)).toBeNull();
    expect(findVariableReferenceAtCaret("plain", 3)).toBeNull();
  });
});
