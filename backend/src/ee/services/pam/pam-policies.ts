import RE2 from "re2";
import { z } from "zod";

import { PamAccountType } from "./pam-enums";

export enum PamPolicyType {
  RequiresApproval = "requires-approval",
  AllowAutoApproval = "allow-auto-approval",
  AllowBreakGlass = "allow-break-glass",
  RequireMfa = "require-mfa",
  RequireReason = "require-reason",
  MaxSessionDuration = "max-session-duration",
  CommandBlocking = "command-blocking",
  OutputMasking = "output-masking"
}

export enum PamOutputMaskingPreset {
  Jwt = "jwt",
  CreditCard = "credit-card",
  Ssn = "ssn",
  Email = "email",
  IpAddress = "ip-address",
  PhoneNumber = "phone-number",
  ConnectionString = "connection-string",
  AccountCredentials = "account-credentials"
}

export const PAM_OUTPUT_MASKING_PRESET_PATTERNS: Record<
  Exclude<PamOutputMaskingPreset, PamOutputMaskingPreset.AccountCredentials | PamOutputMaskingPreset.CreditCard>,
  string
> = {
  [PamOutputMaskingPreset.Jwt]: String.raw`\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*`,
  [PamOutputMaskingPreset.ConnectionString]: String.raw`[A-Za-z][A-Za-z0-9+.-]*://[^\s:/@]*:[^\s/"]*@`,
  [PamOutputMaskingPreset.Ssn]: String.raw`\b\d{3}-\d{2}-\d{4}\b`,
  [PamOutputMaskingPreset.Email]: String.raw`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`,
  [PamOutputMaskingPreset.IpAddress]: String.raw`\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b`,
  [PamOutputMaskingPreset.PhoneNumber]: String.raw`(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\b\d{2,4})[ .-]\d{3,4}[ .-]\d{3,4}\b|\+\d{10,15}\b`
};

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

const PamOutputMaskingSchema = z.object({
  presets: z
    .array(z.nativeEnum(PamOutputMaskingPreset))
    .max(Object.values(PamOutputMaskingPreset).length)
    .transform((presets) => [...new Set(presets)])
    .default([]),
  patterns: patternsStringSchema().default("")
});

type TPamPolicyTypeOverride = {
  description?: string;
  schema?: z.ZodTypeAny;
};

type TPamPolicyDefinition = {
  label: string;
  description: string;
  appliesTo: PamAccountType[] | "all";
  schema: z.ZodTypeAny;
  typeOverrides?: Partial<Record<PamAccountType, TPamPolicyTypeOverride>>;
};

export const PAM_POLICY_DEFINITIONS: Record<PamPolicyType, TPamPolicyDefinition> = {
  [PamPolicyType.RequiresApproval]: {
    label: "Require Approval",
    description: "Users must request and receive approval before launching sessions and viewing credentials.",
    appliesTo: "all",
    schema: z.boolean()
  },
  [PamPolicyType.AllowAutoApproval]: {
    label: "Allow Auto-Approval",
    description:
      "Requests are approved instantly when they pass one of the folder's auto-approval rules. Set the rules under the folder's Approvals tab.",
    appliesTo: "all",
    schema: z.boolean()
  },
  [PamPolicyType.AllowBreakGlass]: {
    label: "Allow Break-Glass",
    description:
      "Designated break-glass users can grant themselves access in an emergency, without an approver. Has no effect until a folder admin names them under the folder's Approvals tab.",
    appliesTo: "all",
    schema: z.boolean()
  },
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
    schema: z.number().int().min(60).max(86400),
    typeOverrides: {
      [PamAccountType.AwsIam]: {
        description: "Maximum session length in seconds (900 to 3600).",
        schema: z.number().int().min(900).max(3600)
      }
    }
  },
  [PamPolicyType.CommandBlocking]: {
    label: "Command Blocking",
    description: "Matching commands will be rejected (one regex per line).",
    appliesTo: [PamAccountType.SSH, PamAccountType.Snowflake, PamAccountType.ClickHouse],
    schema: patternsStringSchema(),
    typeOverrides: {
      [PamAccountType.Snowflake]: {
        description: "Matching SQL statements will be rejected (one regex per line)."
      },
      [PamAccountType.ClickHouse]: {
        description: "Matching SQL statements will be rejected (one regex per line)."
      }
    }
  },
  [PamPolicyType.OutputMasking]: {
    label: "Output Masking",
    description: "Matching output is replaced with [MASKED] before the user sees it.",
    appliesTo: [PamAccountType.SSH, PamAccountType.Postgres],
    schema: PamOutputMaskingSchema,
    typeOverrides: {
      [PamAccountType.Postgres]: {
        description:
          "Matching text in query results is replaced with [MASKED], and other matching values are returned as NULL."
      }
    }
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
    .map(([key, def]) => {
      const override = def.typeOverrides?.[accountType];
      return { key, label: def.label, description: override?.description ?? def.description };
    });

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

    const def = PAM_POLICY_DEFINITIONS[policy];
    const schema = def.typeOverrides?.[accountType]?.schema ?? def.schema;
    const parsed = schema.safeParse(value);
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
  requiresApproval: boolean;
  allowAutoApproval: boolean;
  allowBreakGlass: boolean;
  requireReason: boolean;
  requireMfa: boolean;
  maxSessionDurationSeconds: number | null;
};

const PamPolicyRulePatternSchema = z.object({ patterns: z.array(z.string()) });

const PamSessionLogMaskingRuleSchema = PamPolicyRulePatternSchema.extend({
  builtInDetection: z.boolean()
});

export const PamPolicyRulesSchema = z
  .object({
    [PamPolicyType.CommandBlocking]: PamPolicyRulePatternSchema.optional(),
    [PamPolicyType.OutputMasking]: PamPolicyRulePatternSchema.extend({
      accountCredentials: z.boolean(),
      creditCards: z.boolean()
    }).optional(),
    [PamSettingType.SessionLogMasking]: PamSessionLogMaskingRuleSchema.optional()
  })
  .nullable()
  .optional();

export type TPamPolicyRules = z.infer<typeof PamPolicyRulesSchema>;

/**
 * Assembles the rules the gateway enforces during a session.
 *
 * The masking arm is emitted whenever built-in detection is on, even with no custom patterns —
 * an empty pattern list is no longer the same thing as "no masking".
 */
export const buildPamPolicyRules = ({
  commandBlockingPatterns,
  outputMasking = null,
  maskingPatterns,
  maskingBuiltInDetection
}: {
  commandBlockingPatterns: string[];
  outputMasking?: TPamOutputMaskingRule | null;
  maskingPatterns: string[];
  maskingBuiltInDetection: boolean;
}): TPamPolicyRules => {
  const rules: Record<string, unknown> = {};

  if (commandBlockingPatterns.length > 0) {
    rules[PamPolicyType.CommandBlocking] = { patterns: commandBlockingPatterns };
  }

  if (outputMasking) {
    rules[PamPolicyType.OutputMasking] = outputMasking;
  }

  if (maskingBuiltInDetection || maskingPatterns.length > 0) {
    rules[PamSettingType.SessionLogMasking] = {
      patterns: maskingPatterns,
      builtInDetection: maskingBuiltInDetection
    };
  }

  return Object.keys(rules).length > 0 ? (rules as TPamPolicyRules) : null;
};

type TPamOutputMaskingRule = { patterns: string[]; accountCredentials: boolean; creditCards: boolean };

// The gateway handles account credentials (it already holds them) and card numbers (a Luhn check isn't a regex).
export const resolveOutputMasking = (policyMap: unknown): TPamOutputMaskingRule | null => {
  const masking = resolvePolicy(policyMap, PamPolicyType.OutputMasking) as z.infer<
    typeof PamOutputMaskingSchema
  > | null;
  if (!masking) return null;

  const presets = (
    Object.keys(PAM_OUTPUT_MASKING_PRESET_PATTERNS) as (keyof typeof PAM_OUTPUT_MASKING_PRESET_PATTERNS)[]
  )
    .filter((preset) => masking.presets.includes(preset))
    .map((preset) => PAM_OUTPUT_MASKING_PRESET_PATTERNS[preset]);
  const patterns = [...presets, ...splitPatternString(masking.patterns)];
  const accountCredentials = masking.presets.includes(PamOutputMaskingPreset.AccountCredentials);
  const creditCards = masking.presets.includes(PamOutputMaskingPreset.CreditCard);
  return patterns.length > 0 || accountCredentials || creditCards
    ? { patterns, accountCredentials, creditCards }
    : null;
};

export const resolveAccessControls = (policyMap: unknown): TPamAccessControls => {
  const duration = resolvePolicy(policyMap, PamPolicyType.MaxSessionDuration);
  const requiresApproval = resolvePolicy(policyMap, PamPolicyType.RequiresApproval) === true;
  return {
    requiresApproval,
    allowAutoApproval: requiresApproval && resolvePolicy(policyMap, PamPolicyType.AllowAutoApproval) === true,
    allowBreakGlass: requiresApproval && resolvePolicy(policyMap, PamPolicyType.AllowBreakGlass) === true,
    requireReason: resolvePolicy(policyMap, PamPolicyType.RequireReason) === true,
    requireMfa: resolvePolicy(policyMap, PamPolicyType.RequireMfa) === true,
    maxSessionDurationSeconds: typeof duration === "number" ? duration : null
  };
};
