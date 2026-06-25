import RE2 from "re2";
import { z } from "zod";

import { PamAccountType } from "./pam-enums";

export enum PamPolicyType {
  RequireMfa = "require-mfa",
  RequireReason = "require-reason",
  MaxSessionDuration = "max-session-duration",
  CommandBlocking = "command-blocking"
}

export enum PamSettingType {
  SessionLogMasking = "session-log-masking"
}

export const splitPatternString = (raw: unknown): string[] => {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
};

export const patternsStringSchema = (maxPatterns = 20, maxPatternLength = 500) =>
  z
    .string()
    .max(maxPatterns * (maxPatternLength + 1))
    .refine(
      (val) => {
        const patterns = splitPatternString(val);
        return patterns.length <= maxPatterns && patterns.every((p) => p.length <= maxPatternLength);
      },
      { message: `Maximum ${maxPatterns} patterns, each up to ${maxPatternLength} characters` }
    )
    .refine(
      (val) => {
        const patterns = splitPatternString(val);
        return patterns.every((p) => {
          try {
            // eslint-disable-next-line no-new
            new RE2(p);
            return true;
          } catch {
            return false;
          }
        });
      },
      { message: "One or more patterns are not valid regular expressions" }
    );

type TPamPolicyDefinition = {
  label: string;
  description: string;
  appliesTo: PamAccountType[] | "all";
  schema: z.ZodTypeAny;
};

export const PAM_POLICY_DEFINITIONS: Record<PamPolicyType, TPamPolicyDefinition> = {
  [PamPolicyType.RequireMfa]: {
    label: "Require MFA",
    description: "Users must re-authenticate with MFA before accessing.",
    appliesTo: "all",
    schema: z.boolean()
  },
  [PamPolicyType.RequireReason]: {
    label: "Require Reason",
    description: "Users must provide a reason before accessing.",
    appliesTo: "all",
    schema: z.boolean()
  },
  [PamPolicyType.MaxSessionDuration]: {
    label: "Max Session Duration",
    description: "Maximum session length in seconds (60 to 86400).",
    appliesTo: "all",
    schema: z.number().int().min(60).max(86400)
  },
  [PamPolicyType.CommandBlocking]: {
    label: "Command Blocking",
    description: "Matching commands will be rejected (one regex per line).",
    appliesTo: [PamAccountType.SSH],
    schema: patternsStringSchema()
  }
};

export const PamPolicyDescriptorSchema = z.object({
  key: z.nativeEnum(PamPolicyType),
  label: z.string(),
  description: z.string()
});

export const policyAppliesTo = (policy: PamPolicyType, accountType: PamAccountType): boolean => {
  const { appliesTo } = PAM_POLICY_DEFINITIONS[policy];
  return appliesTo === "all" || appliesTo.includes(accountType);
};

export const getApplicablePolicies = (accountType: PamAccountType) =>
  (Object.entries(PAM_POLICY_DEFINITIONS) as [PamPolicyType, TPamPolicyDefinition][])
    .filter(([key]) => policyAppliesTo(key, accountType))
    .map(([key, def]) => ({ key, label: def.label, description: def.description }));

export type TValidatePolicyValuesResult = { ok: true; data: Record<string, unknown> } | { ok: false; message: string };

export const validatePolicyValues = (
  accountType: PamAccountType,
  policies: Record<string, unknown> | null | undefined
): TValidatePolicyValuesResult => {
  if (!policies) return { ok: true, data: {} };

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(policies)) {
    const validPolicies = getApplicablePolicies(accountType)
      .map((p) => p.key)
      .join(", ");

    if (!(key in PAM_POLICY_DEFINITIONS)) {
      return {
        ok: false,
        message: `Unknown PAM policy '${key}'. Valid policies for ${accountType}: ${validPolicies}`
      };
    }

    const policy = key as PamPolicyType;
    if (!policyAppliesTo(policy, accountType)) {
      return {
        ok: false,
        message: `Policy '${key}' does not apply to account type '${accountType}'. Valid policies for ${accountType}: ${validPolicies}`
      };
    }

    const parsed = PAM_POLICY_DEFINITIONS[policy].schema.safeParse(value);
    if (!parsed.success) {
      const reason = parsed.error.issues.map((issue) => issue.message).join("; ");
      return { ok: false, message: `Invalid configuration for policy '${key}': ${reason}` };
    }
    data[key] = parsed.data;
  }

  return { ok: true, data };
};

export const resolvePolicy = (policyMap: unknown, policy: PamPolicyType): unknown => {
  if (!policyMap || typeof policyMap !== "object") return null;
  const parsed = PAM_POLICY_DEFINITIONS[policy].schema.safeParse((policyMap as Record<string, unknown>)[policy]);
  return parsed.success ? parsed.data : null;
};

export type TPamAccessControls = {
  requireReason: boolean;
  requireMfa: boolean;
  maxSessionDurationSeconds: number | null;
};

const PamPolicyRulePatternSchema = z.object({ patterns: z.array(z.string()) });

export const PamPolicyRulesSchema = z
  .object({
    [PamPolicyType.CommandBlocking]: PamPolicyRulePatternSchema.optional(),
    [PamSettingType.SessionLogMasking]: PamPolicyRulePatternSchema.optional()
  })
  .nullable()
  .optional();

export const resolveAccessControls = (policyMap: unknown): TPamAccessControls => {
  const duration = resolvePolicy(policyMap, PamPolicyType.MaxSessionDuration);
  return {
    requireReason: resolvePolicy(policyMap, PamPolicyType.RequireReason) === true,
    requireMfa: resolvePolicy(policyMap, PamPolicyType.RequireMfa) === true,
    maxSessionDurationSeconds: typeof duration === "number" ? duration : null
  };
};
