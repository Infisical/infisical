import { BadRequestError } from "@app/lib/errors";

import { assertSkillNameNotReserved } from "../agent-vault-skill/agent-vault-builtin-skill";
import { skillNameOf, TValidatedSkill, validateSkillFiles } from "../agent-vault-skill/agent-vault-skill-fns";
import { TAgentVaultInlineSkillRow } from "./agent-vault-session-inline-skill-dal";
import { TAgentVaultInlineSkillInput, TAgentVaultSessionInlineSkillSummary } from "./agent-vault-session-types";

// The files of every inline skill travel in the one request that creates the session, so its body limit bounds their
// size together. This bounds how many there are.
export const AGENT_VAULT_MAX_SESSION_INLINE_SKILLS = 5;

export type TPreparedInlineSkill = TValidatedSkill & { position: number };

// Each folder is checked the way an upload to the project is, and an error names the skill it is about.
export const prepareInlineSkills = (
  inputs: TAgentVaultInlineSkillInput[],
  positions: number[]
): TPreparedInlineSkill[] =>
  inputs.map((input, index) => {
    const position = positions[index];
    try {
      const validated = validateSkillFiles(input.files);
      assertSkillNameNotReserved(validated.name);
      return { ...validated, position };
    } catch (error) {
      if (error instanceof BadRequestError) {
        const name = skillNameOf(input.files);
        throw new BadRequestError({
          message: `Skill ${name ? `'${name}'` : `at index ${position}`}: ${error.message}`
        });
      }
      throw error;
    }
  });

export const toInlineSkillSummary = ({
  id,
  name,
  description,
  sha256,
  sizeBytes,
  fileCount
}: TAgentVaultInlineSkillRow): TAgentVaultSessionInlineSkillSummary => ({
  id,
  name,
  description,
  sha256,
  sizeBytes,
  fileCount,
  isInline: true
});
