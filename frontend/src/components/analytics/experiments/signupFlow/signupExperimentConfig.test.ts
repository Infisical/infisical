import { describe, expect, it } from "vitest";

import { resolveSignupFlowVariant, SignupFlowVariant } from "./signupExperimentConfig";

describe("resolveSignupFlowVariant", () => {
  it("keeps assigned experiment variants sticky", () => {
    expect(resolveSignupFlowVariant("control")).toEqual({
      variant: SignupFlowVariant.Control,
      shouldPersist: true
    });
    expect(resolveSignupFlowVariant("test")).toEqual({
      variant: SignupFlowVariant.DashboardPreview,
      shouldPersist: true
    });
  });

  it("falls back without persisting inactive or unavailable flags", () => {
    [false, undefined, "unexpected-variant"].forEach((value) => {
      expect(resolveSignupFlowVariant(value)).toEqual({
        variant: SignupFlowVariant.Control,
        shouldPersist: false
      });
    });
  });
});
