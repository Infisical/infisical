import { describe, expect, it } from "vitest";

import { TAgentVaultSessionSkill } from "@app/hooks/api/agentVault/types";

import { sessionInlineSkills, sessionListedSkills } from "./sessionAccess";

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
