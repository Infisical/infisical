import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { getComboboxCreationInput } from "./combobox-creation";

type Option = { id: string; label: string };

const baseProps = {
  options: [{ id: "production", label: "Production" }],
  selectedOptions: [{ id: "saved", label: "Saved option" }],
  getOptionLabel: (option: Option) => option.label
};

describe("Combobox creation input", () => {
  it("trims a valid input", () => {
    assert.equal(
      getComboboxCreationInput({ ...baseProps, inputValue: "  New option  " }),
      "New option"
    );
  });

  it("rejects blank input and exact labels from options or selected values", () => {
    assert.equal(getComboboxCreationInput({ ...baseProps, inputValue: "   " }), null);
    assert.equal(getComboboxCreationInput({ ...baseProps, inputValue: "Production" }), null);
    assert.equal(getComboboxCreationInput({ ...baseProps, inputValue: "Saved option" }), null);
  });

  it("keeps the default duplicate check case-sensitive", () => {
    assert.equal(
      getComboboxCreationInput({ ...baseProps, inputValue: "production" }),
      "production"
    );
  });

  it("supports domain-specific duplicate rules", () => {
    assert.equal(
      getComboboxCreationInput({
        ...baseProps,
        inputValue: "PRODUCTION",
        isDuplicate: (input, option) => option.id === input.toLocaleLowerCase()
      }),
      null
    );
  });

  it("passes current options and selections to domain validation", () => {
    assert.equal(
      getComboboxCreationInput({
        ...baseProps,
        inputValue: "member@example.com",
        isValid: (input, context) =>
          input.endsWith("@example.com") && context.selectedOptions.length === 0
      }),
      null
    );
  });
});
