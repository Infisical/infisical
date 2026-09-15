import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getComboboxInputAriaLabel } from "./combobox-accessibility";

describe("Combobox input accessible name", () => {
  it("lets an associated field label name an input with an ID", () => {
    assert.equal(
      getComboboxInputAriaLabel({ id: "projects", searchAriaLabel: "Search projects" }),
      undefined
    );
  });

  it("lets aria-labelledby take precedence over the search hint", () => {
    assert.equal(
      getComboboxInputAriaLabel({
        ariaLabelledBy: "projects-label",
        searchAriaLabel: "Search projects"
      }),
      undefined
    );
  });

  it("preserves explicit aria-label and unlabeled search fallback compatibility", () => {
    assert.equal(
      getComboboxInputAriaLabel({
        ariaLabel: "Project picker",
        id: "projects",
        searchAriaLabel: "Search projects"
      }),
      "Project picker"
    );
    assert.equal(
      getComboboxInputAriaLabel({ searchAriaLabel: "Search projects" }),
      "Search projects"
    );
  });
});
