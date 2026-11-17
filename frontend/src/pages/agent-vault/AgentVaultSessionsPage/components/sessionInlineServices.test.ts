import { describe, expect, it } from "vitest";

import { TAgentVaultSessionSkill } from "@app/hooks/api/agentVault/types";

import { sessionInlineSkills, sessionNamedSkills } from "./sessionInlineServices";

describe("session skill helpers", () => {
  it("split a session's skills into named and inline ones", () => {
    const named = {
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

    expect(sessionNamedSkills({ skills: [named, inline] })).toEqual([named]);
    expect(sessionInlineSkills({ skills: [named, inline] })).toEqual([inline]);
  });

  it("read a session from an API that predates session skills as having none", () => {
    expect(sessionNamedSkills({})).toEqual([]);
    expect(sessionInlineSkills({})).toEqual([]);
  });
});
