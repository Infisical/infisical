import { BadRequestError } from "@app/lib/errors";

import {
  AGENT_VAULT_BUILTIN_SKILL_NAME,
  assertSkillNameNotReserved,
  getAgentVaultBuiltinSkill
} from "./agent-vault-builtin-skill";
import { parseSkillHeader } from "./agent-vault-skill-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe("built-in Agent Vault skill", () => {
  test("loads as a valid skill under its reserved name", async () => {
    const skill = await getAgentVaultBuiltinSkill();
    expect(skill.name).toBe(AGENT_VAULT_BUILTIN_SKILL_NAME);
    expect(skill.files.map((file) => file.path)).toEqual(["SKILL.md"]);
    expect(skill.id).toMatch(/^[0-9a-f-]{36}$/);

    const content = Buffer.from(skill.files[0].contentBase64, "base64");
    expect(parseSkillHeader(content).description.length).toBeLessThanOrEqual(1024);
    expect(skill.description).toBe(parseSkillHeader(content).description);
    expect(content.toString("utf8")).not.toContain("—");
  });

  test("its name is reserved for library skills", () => {
    expect(() => assertSkillNameNotReserved(AGENT_VAULT_BUILTIN_SKILL_NAME)).toThrow(BadRequestError);
    expect(() => assertSkillNameNotReserved("deploy-runbook")).not.toThrow();
  });

  test("a built-in skill that can't be read is left out, and the next request reads it again", async () => {
    vi.resetModules();
    const fsPromises = (await import("node:fs/promises")).default;
    const readFile = vi.spyOn(fsPromises, "readFile").mockRejectedValueOnce(new Error("ENOENT: no such file"));
    const { getAgentVaultBuiltinSkillOrNull } = await import("./agent-vault-builtin-skill");

    await expect(getAgentVaultBuiltinSkillOrNull()).resolves.toBeNull();
    await expect(getAgentVaultBuiltinSkillOrNull()).resolves.toMatchObject({ name: "infisical-agent-vault" });
    readFile.mockRestore();
  });
});
