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
    allowed: z.array(z.string()).optional(),
    required: z.array(z.string()).optional(),
    denied: z.array(z.string()).optional()
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
    allowed: z.array(z.string()).optional(),
    required: z.array(z.string()).optional(),
    denied: z.array(z.string()).optional()
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
    .regex(/^\d+[dhmy]$/, {
      message: "Max validity must be in format like '365d', '12m', '1y', or '24h'"
    })
    .optional()
});

const templateV2AlgorithmsSchema = z.object({
  signature: z.array(z.string()).min(1, "At least one signature algorithm must be provided").optional(),
  keyAlgorithm: z.array(z.string()).min(1, "At least one key algorithm must be provided").optional()
});

export const certificateTemplateV2ResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  subject: z.array(templateV2SubjectSchema).optional(),
  sans: z.array(templateV2SanSchema).optional(),
  keyUsages: templateV2KeyUsagesSchema.optional(),
  extendedKeyUsages: templateV2ExtendedKeyUsagesSchema.optional(),
  algorithms: templateV2AlgorithmsSchema.optional(),
  validity: templateV2ValiditySchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const certificateRequestSchema = z.object({
  commonName: z.string().optional(),
  organization: z.string().optional(),
  organizationName: z.string().optional(),
  country: z.string().optional(),
  keyUsages: z.array(z.nativeEnum(CertKeyUsageType)).optional(),
  extendedKeyUsages: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional(),
  subjectAlternativeNames: z
    .array(
      z.object({
        type: sanTypeSchema,
        value: z.string()
      })
    )
    .optional(),
  validity: z
    .object({
      ttl: z.string()
    })
    .optional(),
  signatureAlgorithm: z.string().optional(),
  keyAlgorithm: z.string().optional()
});

export const validateCertificateRequestSchema = z.object({
  templateId: z.string().uuid(),
  request: certificateRequestSchema
});
