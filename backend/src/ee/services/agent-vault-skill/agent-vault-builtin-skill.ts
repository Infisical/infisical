import path from "node:path";

import fs from "node:fs/promises";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

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

// Null, with an error in the log, when the built-in skill can't be read or isn't a valid skill, so a session still
// gets its library skills.
export const getAgentVaultBuiltinSkillOrNull = () =>
  getAgentVaultBuiltinSkill().catch((error: unknown) => {
    logger.error(error, "getAgentVaultBuiltinSkill: the built-in skill couldn't be read, so it was left out");
    return null;
  });

// Agents get the built-in skill under this name, so a library skill can't take it.
export const assertSkillNameNotReserved = (name: string) => {
  if (name === AGENT_VAULT_BUILTIN_SKILL_NAME) {
    throw new BadRequestError({
      message: `'${AGENT_VAULT_BUILTIN_SKILL_NAME}' is reserved for the skill Agent Vault gives every agent. Choose another name in ${AGENT_VAULT_SKILL_MANIFEST}.`
    });
  }
};
