import RE2 from "re2";
import { z } from "zod";

import { PamAccountPoliciesSchema } from "@app/db/schemas";

import { PamAccountPolicyRuleType } from "./pam-account-policy-enums";

const re2PatternSchema = z
  .string()
  .min(1)
  .max(500, "Pattern must be at most 500 characters")
  .refine(
    (pattern) => {
      try {
        // eslint-disable-next-line no-new
        new RE2(pattern);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid regular expression" }
  );

const RuleConfigSchema = z.object({
  patterns: z.array(re2PatternSchema).min(1).max(20, "A rule can have at most 20 patterns")
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

export const SanitizedPamAccountPolicySchema = PamAccountPoliciesSchema.extend({
  rules: PolicyRulesBaseSchema
});
