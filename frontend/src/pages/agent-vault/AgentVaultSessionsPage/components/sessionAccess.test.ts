import { describe, expect, it } from "vitest";

import { AgentVaultHttpMethod } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultSessionSkill } from "@app/hooks/api/agentVault/types";

import { inlineServiceHookText, sessionInlineSkills, sessionListedSkills } from "./sessionAccess";

describe("session skill helpers", () => {
  it("split a session's skills into listed and inline ones", () => {
    const listed = {
      id: "s1",
      name: "deploy",
      description: "d",
      isInline: false
    } as TAgentVaultSessionSkill;
    const inline = {
      id: "s2",
      name: "scratch",
      description: "d",
      isInline: true
    } as TAgentVaultSessionSkill;

    expect(sessionListedSkills({ skills: [listed, inline] })).toEqual([listed]);
    expect(sessionInlineSkills({ skills: [listed, inline] })).toEqual([inline]);
  });

  it("read a session from an API that predates session skills as having none", () => {
    expect(sessionListedSkills({})).toEqual([]);
    expect(sessionInlineSkills({})).toEqual([]);
  });
});

describe("inlineServiceHookText", () => {
  it("names an inline service's hook with what it checks", () => {
    expect(
      inlineServiceHookText({
        hook: {
          id: "h1",
          name: "refund-approval",
          methods: [AgentVaultHttpMethod.Post],
          paths: ["/v1/refunds"]
        }
      })
    ).toBe("Hook: refund-approval · POST on /v1/refunds");
    expect(inlineServiceHookText({ hook: { id: "h1", name: "refund-approval" } })).toBe(
      "Hook: refund-approval"
    );
  });

  it("is null without a hook, or for a caller who can't read hooks", () => {
    expect(inlineServiceHookText({ hook: null })).toBeNull();
    expect(inlineServiceHookText({})).toBeNull();
  });
});
