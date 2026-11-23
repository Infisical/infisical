import { AgentVaultSessionErrorCode } from "@app/hooks/api/agentVault/enums";

export type TSessionFieldErrors = { servicesError?: string; skillsError?: string };

const SERVICE_FIELD_ERRORS: string[] = [
  AgentVaultSessionErrorCode.ServiceNotGranted,
  AgentVaultSessionErrorCode.ServiceHostConflict
];
const SKILL_FIELD_ERRORS: string[] = [AgentVaultSessionErrorCode.SkillNotGranted];

// Which field a refused session belongs under, read from the error's name: the API has reworded these messages, and
// its names stay put. A refusal of a field that holds nothing has nowhere to show, so it's left to a toast.
export const sessionFieldErrorOf = (
  response: { error?: unknown; message?: unknown } | undefined,
  picked: { services: string[]; skills: string[] }
): TSessionFieldErrors | undefined => {
  if (typeof response?.error !== "string" || typeof response.message !== "string") return undefined;
  if (picked.services.length && SERVICE_FIELD_ERRORS.includes(response.error)) {
    return { servicesError: response.message };
  }
  if (picked.skills.length && SKILL_FIELD_ERRORS.includes(response.error)) {
    return { skillsError: response.message };
  }
  return undefined;
};
