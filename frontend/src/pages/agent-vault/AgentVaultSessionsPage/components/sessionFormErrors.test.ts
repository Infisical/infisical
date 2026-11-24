import { describe, expect, it } from "vitest";

import { AgentVaultSessionErrorCode } from "@app/hooks/api/agentVault/enums";

import { sessionFieldErrorOf } from "./sessionFormErrors";

const picked = { services: ["github"], skills: ["code-review"] };

describe("sessionFieldErrorOf", () => {
  it("puts a refused service under Services, by its error name", () => {
    expect(
      sessionFieldErrorOf(
        {
          error: AgentVaultSessionErrorCode.ServiceNotGranted,
          message: "You can't use a service called 'github'."
        },
        picked
      )
    ).toEqual({ servicesError: "You can't use a service called 'github'." });
    expect(
      sessionFieldErrorOf(
        {
          error: AgentVaultSessionErrorCode.ServiceHostConflict,
          message: "The services both cover api.example.com."
        },
        picked
      )
    ).toEqual({ servicesError: "The services both cover api.example.com." });
  });

  it("puts a refused skill under Skills", () => {
    expect(
      sessionFieldErrorOf(
        {
          error: AgentVaultSessionErrorCode.SkillNotGranted,
          message: "You can't use a skill called 'code-review'."
        },
        picked
      )
    ).toEqual({ skillsError: "You can't use a skill called 'code-review'." });
  });

  it("leaves a refusal to a toast when its field holds nothing, or the error belongs to no field", () => {
    expect(
      sessionFieldErrorOf(
        { error: AgentVaultSessionErrorCode.SkillNotGranted, message: "Refused." },
        { services: ["github"], skills: [] }
      )
    ).toBeUndefined();
    expect(
      sessionFieldErrorOf({ error: "BadRequest", message: "can't use a service" }, picked)
    ).toBeUndefined();
    expect(
      sessionFieldErrorOf({ error: "AccessBundleNotGranted", message: "Refused." }, picked)
    ).toBeUndefined();
    expect(sessionFieldErrorOf(undefined, picked)).toBeUndefined();
  });
});
