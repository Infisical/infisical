import { z } from "zod";

import {
  CertDurationUnit,
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType,
  SAN_INCLUDE_OPTIONS,
  SUBJECT_ATTRIBUTE_INCLUDE_OPTIONS
} from "./certificate-constants";

export const uiAttributeSchema = z.object({
  type: z.nativeEnum(CertSubjectAttributeType),
  include: z.enum(SUBJECT_ATTRIBUTE_INCLUDE_OPTIONS),
  value: z.array(z.string().min(1, "Value cannot be empty"))
});

export const uiSanSchema = z.object({
  type: z.nativeEnum(CertSubjectAlternativeNameType),
  include: z.enum(SAN_INCLUDE_OPTIONS),
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
  allowedAlgorithms: z.array(z.string()).optional(),
  defaultAlgorithm: z.string().optional()
});

export const uiKeyAlgorithmSchema = z.object({
  allowedKeyTypes: z.array(z.string()).optional(),
  defaultKeyType: z.string().optional()
});

export const templateSchema = z.object({
  name: z.string().trim().min(1, "Template name is required"),
  description: z.string().optional(),
  attributes: z.array(uiAttributeSchema).optional(),
  subjectAlternativeNames: z.array(uiSanSchema).optional(),
  keyUsages: uiKeyUsagesSchema.optional(),
  extendedKeyUsages: uiExtendedKeyUsagesSchema.optional(),
  validity: uiValiditySchema.optional(),
  signatureAlgorithm: uiSignatureAlgorithmSchema.optional(),
  keyAlgorithm: uiKeyAlgorithmSchema.optional()
});

export type TemplateFormData = z.infer<typeof templateSchema>;

export const apiSubjectSchema = z
  .object({
    type: z.nativeEnum(CertSubjectAttributeType),
    allowed: z.array(z.string().min(1, "Value cannot be empty")).optional(),
    required: z.array(z.string().min(1, "Value cannot be empty")).optional(),
    denied: z.array(z.string().min(1, "Value cannot be empty")).optional()
  })
  .refine((data) => data.allowed || data.required || data.denied, {
    message: "At least one allowed, required, or denied value must be provided"
  });

export const apiSanSchema = z
  .object({
    type: z.nativeEnum(CertSubjectAlternativeNameType),
    allowed: z.array(z.string().min(1, "Value cannot be empty")).optional(),
    required: z.array(z.string().min(1, "Value cannot be empty")).optional(),
    denied: z.array(z.string().min(1, "Value cannot be empty")).optional()
  })
  .refine((data) => data.allowed || data.required || data.denied, {
    message: "At least one allowed, required, or denied value must be provided"
  });

export const apiTemplateSchema = z.object({
  name: z.string().trim().min(1, "Template name is required"),
  description: z.string().optional(),
  subject: z.array(apiSubjectSchema).optional(),
  sans: z.array(apiSanSchema).optional(),
  keyUsages: z
    .object({
      allowed: z.array(z.nativeEnum(CertKeyUsageType)).optional(),
      required: z.array(z.nativeEnum(CertKeyUsageType)).optional(),
      denied: z.array(z.nativeEnum(CertKeyUsageType)).optional()
    })
    .optional(),
  extendedKeyUsages: z
    .object({
      allowed: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional(),
      required: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional(),
      denied: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional()
    })
    .optional(),
  algorithms: z
    .object({
      signature: z.array(z.string()).optional(),
      keyAlgorithm: z.array(z.string()).optional()
    })
    .optional(),
  validity: z
    .object({
      max: z
        .string()
        .regex(/^[1-9]\d*[dhmy]$/, "Must be in format like '365d', '12m', '1y', or '24h'")
        .optional()
    })
    .optional()
});

export type ApiTemplateFormData = z.infer<typeof apiTemplateSchema>;
