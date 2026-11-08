import { describe, expect, it } from "vitest";

import { AgentVaultCredentialType } from "@app/hooks/api/agentVault";

import {
  AGENT_VAULT_TEMPLATES,
  AgentVaultTemplateCategory,
  findTemplateForHostPattern
} from "./agentVaultTemplates";

describe("agent vault service templates", () => {
  it("keeps template keys unique", () => {
    const keys = AGENT_VAULT_TEMPLATES.map((template) => template.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("offers Runcrate as a bearer-token LLM provider", () => {
    const template = AGENT_VAULT_TEMPLATES.find(({ key }) => key === "runcrate");

    expect(template).toMatchObject({
      name: "Runcrate",
      image: "Runcrate.png",
      category: AgentVaultTemplateCategory.Llm,
      hostPattern: "api.runcrate.ai",
      credential: { type: AgentVaultCredentialType.Bearer }
    });
  });

  it("finds the Runcrate template from its API host, with or without a port", () => {
    expect(findTemplateForHostPattern("api.runcrate.ai")?.key).toBe("runcrate");
    expect(findTemplateForHostPattern("api.runcrate.ai:443")?.key).toBe("runcrate");
    expect(findTemplateForHostPattern("runcrate.ai")).toBeUndefined();
  });
});
