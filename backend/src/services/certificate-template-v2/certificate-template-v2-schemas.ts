import { z } from "zod";

import { slugSchema } from "@app/server/lib/schemas";
import {
  CertDurationUnit,
  CertExtendedKeyUsageType,
  CertIncludeType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/services/certificate-common/certificate-constants";

const attributeTypeSchema = z.nativeEnum(CertSubjectAttributeType);

const includeTypeSchema = z.nativeEnum(CertIncludeType);

const sanTypeSchema = z.nativeEnum(CertSubjectAlternativeNameType);

const durationUnitSchema = z.nativeEnum(CertDurationUnit);

export const templateV2AttributeSchema = z
  .object({
    type: attributeTypeSchema,
    include: includeTypeSchema,
    value: z.array(z.string()).optional()
  })
  .refine(
    (data) => {
      if (data.type === "common_name" && data.value && data.value.length > 1) {
        return false;
      }
      if (data.include === "mandatory" && (!data.value || data.value.length > 1)) {
        return false;
      }
      return true;
    },
    {
      message: "Common name can only have one value. Mandatory attributes can only have one value or no value (empty)"
    }
  );

export const templateV2KeyUsagesSchema = z.object({
  requiredUsages: z
    .object({
      all: z.array(z.nativeEnum(CertKeyUsageType))
    })
    .optional(),
  optionalUsages: z
    .object({
      all: z.array(z.nativeEnum(CertKeyUsageType))
    })
    .optional()
});

export const templateV2ExtendedKeyUsagesSchema = z.object({
  requiredUsages: z
    .object({
      all: z.array(z.nativeEnum(CertExtendedKeyUsageType))
    })
    .optional(),
  optionalUsages: z
    .object({
      all: z.array(z.nativeEnum(CertExtendedKeyUsageType))
    })
    .optional()
});

export const templateV2SanSchema = z
  .object({
    type: sanTypeSchema,
    include: includeTypeSchema,
    value: z.array(z.string()).optional()
  })
  .refine(
    (data) => {
      if (data.include === "mandatory" && (!data.value || data.value.length > 1)) {
        return false;
      }
      return true;
    },
    {
      message: "Mandatory SANs can only have one value or no value (empty)"
    }
  );

export const templateV2ValiditySchema = z.object({
  maxDuration: z.object({
    value: z.number().positive(),
    unit: durationUnitSchema
  }),
  minDuration: z
    .object({
      value: z.number().positive(),
      unit: durationUnitSchema
    })
    .optional()
});

export const templateV2SignatureAlgorithmSchema = z
  .object({
    allowedAlgorithms: z.array(z.string()).min(1),
    defaultAlgorithm: z.string()
  })
  .refine((data) => data.allowedAlgorithms.includes(data.defaultAlgorithm), {
    message: "Default signature algorithm must be included in the allowed algorithms list"
  });

export const templateV2KeyAlgorithmSchema = z
  .object({
    allowedKeyTypes: z.array(z.string()).min(1),
    defaultKeyType: z.string()
  })
  .refine((data) => data.allowedKeyTypes.includes(data.defaultKeyType), {
    message: "Default key algorithm must be included in the allowed key types list"
  });

export const createCertificateTemplateV2Schema = z.object({
  projectId: z.string().min(1),
  slug: slugSchema({ min: 1, max: 255 }),
  description: z.string().max(1000).optional(),
  attributes: z.array(templateV2AttributeSchema).min(1),
  keyUsages: templateV2KeyUsagesSchema,
  extendedKeyUsages: templateV2ExtendedKeyUsagesSchema.optional(),
  subjectAlternativeNames: z.array(templateV2SanSchema).optional(),
  validity: templateV2ValiditySchema.optional(),
  signatureAlgorithm: templateV2SignatureAlgorithmSchema.optional(),
  keyAlgorithm: templateV2KeyAlgorithmSchema.optional()
});

export const updateCertificateTemplateV2Schema = z.object({
  slug: slugSchema({ min: 1, max: 255 }).optional(),
  description: z.string().max(1000).optional(),
  attributes: z.array(templateV2AttributeSchema).optional(),
  keyUsages: templateV2KeyUsagesSchema.optional(),
  extendedKeyUsages: templateV2ExtendedKeyUsagesSchema.optional(),
  subjectAlternativeNames: z.array(templateV2SanSchema).optional(),
  validity: templateV2ValiditySchema.optional(),
  signatureAlgorithm: templateV2SignatureAlgorithmSchema.optional(),
  keyAlgorithm: templateV2KeyAlgorithmSchema.optional()
});

export const getCertificateTemplateV2ByIdSchema = z.object({
  id: z.string().uuid()
});

export const getCertificateTemplateV2BySlugSchema = z.object({
  projectId: z.string().min(1),
  slug: slugSchema()
});

export const listCertificateTemplatesV2Schema = z.object({
  projectId: z.string().min(1),
  offset: z.coerce.number().min(0).default(0),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional()
});

export const deleteCertificateTemplateV2Schema = z.object({
  id: z.string().uuid()
});

export const certificateRequestSchema = z.object({
  commonName: z.string().optional(),
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
