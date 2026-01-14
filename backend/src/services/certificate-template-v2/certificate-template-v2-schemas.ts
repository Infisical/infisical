import RE2 from "re2";
import { z } from "zod";

import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/services/certificate-common/certificate-constants";

const attributeTypeSchema = z.nativeEnum(CertSubjectAttributeType);
const sanTypeSchema = z.nativeEnum(CertSubjectAlternativeNameType);

const templateV2SubjectSchema = z
  .object({
    type: attributeTypeSchema,
    allowed: z.array(z.string().trim().min(1, "Value cannot be empty")).optional(),
    required: z.array(z.string().trim().min(1, "Value cannot be empty")).optional(),
    denied: z.array(z.string().trim().min(1, "Value cannot be empty")).optional()
  })
  .refine(
    (data) => {
      if (!data.allowed && !data.required && !data.denied) {
        return false;
      }
      return true;
    },
    {
      message: "Subject attribute must have at least one allowed, required, or denied value"
    }
  );

const templateV2KeyUsagesSchema = z
  .object({
    allowed: z.array(z.nativeEnum(CertKeyUsageType)).optional(),
    required: z.array(z.nativeEnum(CertKeyUsageType)).optional(),
    denied: z.array(z.nativeEnum(CertKeyUsageType)).optional()
  })
  .refine(
    (data) => {
      if (!data.allowed && !data.required && !data.denied) {
        return false;
      }
      return true;
    },
    {
      message: "Key usages must have at least one allowed, required, or denied value"
    }
  );

const templateV2ExtendedKeyUsagesSchema = z
  .object({
    allowed: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional(),
    required: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional(),
    denied: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional()
  })
  .refine(
    (data) => {
      if (!data.allowed && !data.required && !data.denied) {
        return false;
      }
      return true;
    },
    {
      message: "Extended key usages must have at least one allowed, required, or denied value"
    }
  );

const templateV2SanSchema = z
  .object({
    type: sanTypeSchema,
    allowed: z.array(z.string().trim().min(1, "Value cannot be empty")).optional(),
    required: z.array(z.string().trim().min(1, "Value cannot be empty")).optional(),
    denied: z.array(z.string().trim().min(1, "Value cannot be empty")).optional()
  })
  .refine(
    (data) => {
      if (!data.allowed && !data.required && !data.denied) {
        return false;
      }
      return true;
    },
    {
      message: "SAN must have at least one allowed, required, or denied value"
    }
  );

const templateV2ValiditySchema = z.object({
  max: z
    .string()
    .regex(new RE2("^\\d+[dhmy]$"), {
      message: "Max validity must be in format like '365d', '12m', '1y', or '24h'"
    })
    .optional()
});

const templateV2AlgorithmsSchema = z.object({
  signature: z
    .array(z.string().trim().min(1, "Algorithm cannot be empty"))
    .min(1, "At least one signature algorithm must be provided")
    .optional(),
  keyAlgorithm: z
    .array(z.string().trim().min(1, "Algorithm cannot be empty"))
    .min(1, "At least one key algorithm must be provided")
    .optional()
});

export const templateV2CaSettingsSchema = z
  .object({
    maxPathLength: z
      .number()
      .int("Path length must be an integer")
      .min(-1, "Path length must be -1 (unlimited) or a non-negative integer")
      .optional()
  })
  .nullable();

export const certificateTemplateV2ResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid("Project ID must be valid"),
  name: z
    .string()
    .trim()
    .min(1, "Template name is required")
    .max(255, "Template name must be less than 255 characters")
    .regex(new RE2("^[a-zA-Z0-9-_]+$"), "Template name must contain only letters, numbers, hyphens, and underscores"),
  description: z.string().trim().max(1000, "Description must be less than 1000 characters").nullable().optional(),
  subject: z.array(templateV2SubjectSchema).optional(),
  sans: z.array(templateV2SanSchema).optional(),
  keyUsages: templateV2KeyUsagesSchema.optional(),
  extendedKeyUsages: templateV2ExtendedKeyUsagesSchema.optional(),
  algorithms: templateV2AlgorithmsSchema.optional(),
  validity: templateV2ValiditySchema.optional(),
  caSettings: templateV2CaSettingsSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const certificateRequestSchema = z.object({
  commonName: z
    .string()
    .trim()
    .min(1, "Common name cannot be empty")
    .max(64, "Common name must be less than 64 characters")
    .optional(),
  organization: z
    .string()
    .trim()
    .min(1, "Organization cannot be empty")
    .max(64, "Organization must be less than 64 characters")
    .optional(),
  country: z
    .string()
    .trim()
    .min(2, "Country code must be 2 characters")
    .max(2, "Country code must be 2 characters")
    .optional(),
  keyUsages: z.array(z.nativeEnum(CertKeyUsageType)).min(1, "At least one key usage must be provided").optional(),
  extendedKeyUsages: z
    .array(z.nativeEnum(CertExtendedKeyUsageType))
    .min(1, "At least one extended key usage must be provided")
    .optional(),
  subjectAlternativeNames: z
    .array(
      z.object({
        type: sanTypeSchema,
        value: z
          .string()
          .trim()
          .min(1, "SAN value cannot be empty")
          .max(255, "SAN value must be less than 255 characters")
      })
    )
    .min(1, "At least one SAN must be provided")
    .optional(),
  validity: z
    .object({
      ttl: z
        .string()
        .trim()
        .min(1, "TTL cannot be empty")
        .regex(new RE2("^\\d+[dhmy]$"), "TTL must be in format like '365d', '12m', '1y', or '24h'")
    })
    .optional(),
  signatureAlgorithm: z.string().trim().min(1, "Signature algorithm cannot be empty").optional(),
  keyAlgorithm: z.string().trim().min(1, "Key algorithm cannot be empty").optional()
});

export const validateCertificateRequestSchema = z.object({
  templateId: z.string().uuid(),
  request: certificateRequestSchema
});
