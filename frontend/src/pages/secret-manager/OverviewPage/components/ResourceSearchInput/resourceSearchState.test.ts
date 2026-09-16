import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getResourceSearchStateTransition } from "./resourceSearchState";

describe("Resource search state", () => {
  it("syncs an external navigation without re-emitting the stale debounced value", () => {
    assert.deepEqual(
      getResourceSearchStateTransition({
        externalValue: "DATABASE_URL",
        previousExternalValue: "api",
        debouncedInputValue: "api",
        lastEmittedValue: "api"
      }),
      { type: "sync", value: "DATABASE_URL" }
    );
  });

  it("emits a locally debounced search change", () => {
    assert.deepEqual(
      getResourceSearchStateTransition({
        externalValue: "api",
        previousExternalValue: "api",
        debouncedInputValue: "api-key",
        lastEmittedValue: "api"
      }),
      { type: "emit", value: "api-key" }
    );
  });

  it("does nothing when external and local search state are synchronized", () => {
    assert.equal(
      getResourceSearchStateTransition({
        externalValue: "api",
        previousExternalValue: "api",
        debouncedInputValue: "api",
        lastEmittedValue: "api"
      }),
      undefined
    );
  });
});
