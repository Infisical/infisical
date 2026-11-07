import path from "node:path";

import fs from "node:fs/promises";

import { BadRequestError } from "@app/lib/errors";

import { AGENT_VAULT_SKILL_MANIFEST, validateSkillFiles } from "./agent-vault-skill-fns";
import { AgentVaultSkillFileMode } from "./agent-vault-skill-types";

// Every session's skills include this one. Infisical holds the only copy: the CLI and the proxy keep none, and
// agent-vault run gets it through the proxy with the session's other skills.
export const AGENT_VAULT_BUILTIN_SKILL_NAME = "infisical-agent-vault";

// Fixed, so a CLI that installed the skill once recognizes its own folder on the next run.
export const AGENT_VAULT_BUILTIN_SKILL_ID = "8f1c2d4e-6a7b-4c3d-9e8f-0a1b2c3d4e5f";

export const AGENT_VAULT_BUILTIN_SKILL_VERSION = 1;

export type TAgentVaultBuiltinSkill = {
  id: string;
  name: string;
  description: string;
  version: number;
  sha256: string;
  files: { path: string; mode: AgentVaultSkillFileMode; contentBase64: string }[];
};

let builtinSkill: Promise<TAgentVaultBuiltinSkill> | undefined;

export const getAgentVaultBuiltinSkill = () => {
  if (!builtinSkill) {
    builtinSkill = fs
      .readFile(path.join(__dirname, "builtin-skill", AGENT_VAULT_SKILL_MANIFEST))
      .then((content): TAgentVaultBuiltinSkill => {
        const validated = validateSkillFiles([
          {
            path: AGENT_VAULT_SKILL_MANIFEST,
            mode: AgentVaultSkillFileMode.Regular,
            contentBase64: content.toString("base64")
          }
        ]);
        return {
          id: AGENT_VAULT_BUILTIN_SKILL_ID,
          name: validated.name,
          description: validated.description,
          version: AGENT_VAULT_BUILTIN_SKILL_VERSION,
          sha256: validated.sha256,
          files: validated.files
        };
      });
    // A failed read is not cached, so the next call tries again.
    builtinSkill.catch(() => {
      builtinSkill = undefined;
    });
  }
  return builtinSkill;
};

// Agents get the built-in skill under this name, so a library skill can't take it.
export const assertSkillNameNotReserved = (name: string) => {
  if (name === AGENT_VAULT_BUILTIN_SKILL_NAME) {
    throw new BadRequestError({
      message: `'${AGENT_VAULT_BUILTIN_SKILL_NAME}' is reserved for the skill Agent Vault gives every agent. Choose another name in ${AGENT_VAULT_SKILL_MANIFEST}.`
    });
  }
};
