import { z } from "zod";

import {
  CertDurationUnit,
  CertExtendedKeyUsageType,
  CertExtensionCriticality,
  CertExtensionRuleKind,
  CertKeyUsageType,
  CertPolicyState,
  CertSanInclude,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeInclude,
  CertSubjectAttributeType,
  POLICY_PRESET_IDS
} from "./certificate-constants";

export const uiAttributeSchema = z.object({
  type: z.nativeEnum(CertSubjectAttributeType),
  include: z.nativeEnum(CertSubjectAttributeInclude),
  value: z.array(z.string().min(1, "Value cannot be empty"))
});

export const uiSanSchema = z.object({
  type: z.nativeEnum(CertSubjectAlternativeNameType),
  include: z.nativeEnum(CertSanInclude),
  value: z.array(z.string().min(1, "Value cannot be empty"))
});

export const uiKeyUsagesSchema = z.object({
  requiredUsages: z.array(z.nativeEnum(CertKeyUsageType)),
  optionalUsages: z.array(z.nativeEnum(CertKeyUsageType))
});

export const uiExtendedKeyUsagesSchema = z.object({
  requiredUsages: z.array(z.nativeEnum(CertExtendedKeyUsageType)),
  optionalUsages: z.array(z.nativeEnum(CertExtendedKeyUsageType))
});

export const uiValiditySchema = z.object({
  maxDuration: z.object({
    value: z.number().min(1, "Duration must be at least 1"),
    unit: z.nativeEnum(CertDurationUnit)
  })
});

export const uiSignatureAlgorithmSchema = z.object({
  allowedAlgorithms: z.array(z.string().min(1, "Algorithm cannot be empty"))
});

export const uiKeyAlgorithmSchema = z.object({
  allowedKeyTypes: z.array(z.string().min(1, "Key type cannot be empty"))
});

export const uiBasicConstraintsSchema = z.object({
  isCA: z.nativeEnum(CertPolicyState).default(CertPolicyState.DENIED),
  maxPathLength: z
    .number()
    .min(-1, "Path length must be -1 (unlimited) or greater")
    .nullable()
    .optional()
});

export const uiPresetSchema = z
  .enum([
    POLICY_PRESET_IDS.CUSTOM,
    POLICY_PRESET_IDS.TLS_SERVER,
    POLICY_PRESET_IDS.TLS_CLIENT,
    POLICY_PRESET_IDS.CODE_SIGNING,
    POLICY_PRESET_IDS.DEVICE,
    POLICY_PRESET_IDS.USER,
    POLICY_PRESET_IDS.EMAIL_PROTECTION,
    POLICY_PRESET_IDS.DUAL_PURPOSE_SERVER,
    POLICY_PRESET_IDS.INTERMEDIATE_CA
  ])
  .default(POLICY_PRESET_IDS.CUSTOM);

export const uiCustomExtensionSchema = z.object({
  oid: z.string().trim(),
  label: z.string().trim().max(64).optional(),
  critical: z.union([z.literal(""), z.nativeEnum(CertExtensionCriticality)]).optional(),
  rule: z.nativeEnum(CertExtensionRuleKind),
  value: z.string().trim()
});

export const policySchema = z.object({
  preset: uiPresetSchema,
  name: z
    .string()
    .trim()
    .min(1, "Policy name is required")
    .max(255, "Policy name must be less than 255 characters")
    .regex(
      /^[a-zA-Z0-9-_]+$/,
      "Policy name must contain only letters, numbers, hyphens, and underscores"
    ),
  description: z
    .string()
    .trim()
    .max(255, "Description must be less than 255 characters")
    .optional(),
  basicConstraints: uiBasicConstraintsSchema.optional(),
  attributes: z.array(uiAttributeSchema).optional(),
  subjectAlternativeNames: z.array(uiSanSchema).optional(),
  keyUsages: uiKeyUsagesSchema.optional(),
  extendedKeyUsages: uiExtendedKeyUsagesSchema.optional(),
  validity: uiValiditySchema.optional(),
  signatureAlgorithm: uiSignatureAlgorithmSchema.optional(),
  keyAlgorithm: uiKeyAlgorithmSchema.optional(),
  customExtensions: z.array(uiCustomExtensionSchema).optional()
});

export type PolicyFormData = z.infer<typeof policySchema>;
