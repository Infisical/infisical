import RE2 from "re2";
import { z } from "zod";

import { ms } from "@app/lib/ms";

import {
  BaseApprovalPolicySchema,
  BaseApprovalRequestGrantSchema,
  BaseApprovalRequestSchema,
  BaseCreateApprovalPolicySchema,
  BaseCreateApprovalRequestSchema,
  BaseUpdateApprovalPolicySchema
} from "../approval-policy-schemas";
import { CodeSigningScopeField } from "./code-signing-policy-enums";

export const CodeSigningPolicyInputsSchema = z.object({
  signerId: z.string().uuid(),
  approvalPolicyId: z.string().uuid()
});

export const CodeSigningPolicyConditionsSchema = z.object({}).array();

const WindowDurationSchema = z
  .string()
  .refine(
    (val) => {
      const duration = ms(val) / 1000;
      // 1 minute to 30 days
      return duration >= 60 && duration <= 2592000;
    },
    { message: "Window duration must be between 1 minute and 30 days" }
  )
  .optional();

const SHA256_HEX_RE = new RE2("^[a-fA-F0-9]{64}$");

const scopeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

const scopeSha256 = (message: string) =>
  z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((value) => (value === "" ? undefined : value))
    .refine((value) => value === undefined || SHA256_HEX_RE.test(value), message);

export const CodeSigningScopeSchema = z.object({
  [CodeSigningScopeField.Command]: scopeText(2048),
  [CodeSigningScopeField.SigningApplication]: scopeText(256),
  [CodeSigningScopeField.SigningApplicationHash]: scopeSha256(
    "Signing application checksum must be a 64-character SHA-256 hex string"
  ),
  [CodeSigningScopeField.Hostname]: scopeText(256),
  [CodeSigningScopeField.OsUsername]: scopeText(256),
  [CodeSigningScopeField.IpAddress]: z
    .string()
    .trim()
    .max(45)
    .optional()
    .transform((value) => (value === "" ? undefined : value))
    .refine((value) => value === undefined || z.string().ip().safeParse(value).success, "Must be a valid IP address"),
  [CodeSigningScopeField.DataHash]: scopeSha256("Data digest must be a 64-character SHA-256 hex string")
});

export const CodeSigningScopeInputSchema = CodeSigningScopeSchema.strict();

export const CODE_SIGNING_SCOPE_API_DESCRIPTION =
  "Optional parameters to scope this approval to (command, signingApplication, signingApplicationHash, hostname, osUsername, ipAddress, dataHash). Every value declared here must match at signing time or the sign call is denied; parameters left out are not restricted. A command must match exactly, apart from whitespace, so a different order of options is a different command. ipAddress is compared against the address the sign call arrives from and dataHash against the digest of the submitted payload, so those two hold even if a caller reports something else.";

export const CodeSigningPolicyConstraintsSchema = z
  .object({
    maxWindowDuration: WindowDurationSchema,
    maxSignings: z.number().int().positive().optional()
  })
  .refine((data) => data.maxWindowDuration || data.maxSignings, {
    message: "At least one constraint (maxWindowDuration or maxSignings) is required"
  });

export const CodeSigningPolicyRequestDataSchema = z.object({
  signerId: z.string().uuid(),
  approvalPolicyId: z.string().uuid(),
  signerName: z.string(),
  justification: z.string().max(512).optional(),
  requestedWindowStart: z.string().datetime().optional(),
  requestedWindowEnd: z.string().datetime().optional(),
  requestedSignings: z.number().int().positive().optional(),
  scope: CodeSigningScopeSchema.optional()
});

export const CodeSigningPolicySchema = BaseApprovalPolicySchema.extend({
  conditions: z.object({
    version: z.literal(1),
    conditions: CodeSigningPolicyConditionsSchema
  }),
  constraints: z.object({
    version: z.literal(1),
    constraints: CodeSigningPolicyConstraintsSchema
  })
});

export const CreateCodeSigningPolicySchema = BaseCreateApprovalPolicySchema.extend({
  conditions: CodeSigningPolicyConditionsSchema.default([]),
  constraints: CodeSigningPolicyConstraintsSchema
});

export const UpdateCodeSigningPolicySchema = BaseUpdateApprovalPolicySchema.extend({
  conditions: CodeSigningPolicyConditionsSchema.optional(),
  constraints: CodeSigningPolicyConstraintsSchema.optional()
});

export const CodeSigningRequestSchema = BaseApprovalRequestSchema.extend({
  requestData: z.object({
    version: z.literal(1),
    requestData: CodeSigningPolicyRequestDataSchema
  })
});

export const CreateCodeSigningRequestSchema = BaseCreateApprovalRequestSchema.extend({
  requestData: CodeSigningPolicyRequestDataSchema.extend({
    scope: CodeSigningScopeInputSchema.optional()
  })
});

export const CodeSigningRequestGrantSchema = BaseApprovalRequestGrantSchema.extend({
  attributes: z.object({
    signerId: z.string().uuid(),
    signerName: z.string(),
    maxSignings: z.number().int().positive().optional(),
    windowStart: z.string().datetime().optional(),
    scope: CodeSigningScopeSchema.optional()
  })
});
