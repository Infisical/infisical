import { z } from "zod";

import { PamAccountPolicyRuleType } from "./pam-account-policy-enums";

const RuleConfigSchema = z.object({
  patterns: z.array(z.string().min(1)).min(1)
});

export const PolicyRulesBaseSchema = z.object({
  [PamAccountPolicyRuleType.CommandBlocking]: RuleConfigSchema.optional(),
  [PamAccountPolicyRuleType.SessionLogMasking]: RuleConfigSchema.optional()
});

export const PolicyRulesInputSchema = PolicyRulesBaseSchema.refine(
  (rules) => Object.values(rules).some((v) => v !== undefined),
  "At least one rule must be configured"
);

export const PolicyRulesResponseSchema = PolicyRulesBaseSchema;
