import { z } from "zod";

const attributeTypeSchema = z.enum(["common_name"]);

const includeTypeSchema = z.enum(["mandatory", "optional", "prohibit"]);

const sanTypeSchema = z.enum(["dns_name", "ip_address", "email", "uri"]);

const durationUnitSchema = z.enum(["days", "months", "years"]);

export const templateV2AttributeSchema = z
  .object({
    type: attributeTypeSchema,
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
      message: "Mandatory attributes can only have one value or no value (empty)"
    }
  );

export const templateV2KeyUsagesSchema = z.object({
  requiredUsages: z.object({
    all: z.array(z.string())
  }),
  optionalUsages: z.object({
    all: z.array(z.string())
  })
});

export const templateV2ExtendedKeyUsagesSchema = z.object({
  requiredUsages: z.object({
    all: z.array(z.string())
  }),
  optionalUsages: z.object({
    all: z.array(z.string())
  })
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

export const templateV2SignatureAlgorithmSchema = z.object({
  allowedAlgorithms: z.array(z.string()).min(1),
  defaultAlgorithm: z.string()
});

export const templateV2KeyAlgorithmSchema = z.object({
  allowedKeyTypes: z.array(z.string()).min(1),
  defaultKeyType: z.string()
});

export const createCertificateTemplateV2Schema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  attributes: z.array(templateV2AttributeSchema).optional(),
  keyUsages: templateV2KeyUsagesSchema.optional(),
  extendedKeyUsages: templateV2ExtendedKeyUsagesSchema.optional(),
  subjectAlternativeNames: z.array(templateV2SanSchema).optional(),
  validity: templateV2ValiditySchema.optional(),
  signatureAlgorithm: templateV2SignatureAlgorithmSchema.optional(),
  keyAlgorithm: templateV2KeyAlgorithmSchema.optional()
});

export const updateCertificateTemplateV2Schema = z.object({
  name: z.string().min(1).max(255).optional(),
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
  keyUsages: z.array(z.string()).optional(),
  extendedKeyUsages: z.array(z.string()).optional(),
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
