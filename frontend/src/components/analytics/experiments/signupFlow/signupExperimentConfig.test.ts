import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveSignupFlowVariant, SignupFlowVariant } from "./signupExperimentConfig";

describe("resolveSignupFlowVariant", () => {
  it("keeps assigned experiment variants sticky", () => {
    assert.deepEqual(resolveSignupFlowVariant("control"), {
      variant: SignupFlowVariant.Control,
      shouldPersist: true
    });
    assert.deepEqual(resolveSignupFlowVariant("test"), {
      variant: SignupFlowVariant.DashboardPreview,
      shouldPersist: true
    });
  });

  it("falls back without persisting inactive or unavailable flags", () => {
    [false, undefined, "unexpected-variant"].forEach((value) => {
      assert.deepEqual(resolveSignupFlowVariant(value), {
        variant: SignupFlowVariant.Control,
        shouldPersist: false
      });
    });
  });
});
