import { z } from "zod";

import {
  CertDurationUnit,
  CertExtendedKeyUsageType,
  CertIncludeType,
  CertKeyUsageType,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "./certificate-constants";

export const attributeSchema = z.object({
  type: z.nativeEnum(CertSubjectAttributeType),
  include: z.nativeEnum(CertIncludeType),
  value: z.array(z.string().min(1, "Value cannot be empty")).optional()
});

export const sanSchema = z.object({
  type: z.nativeEnum(CertSubjectAlternativeNameType),
  include: z.nativeEnum(CertIncludeType),
  value: z.array(z.string().min(1, "Value cannot be empty")).optional()
});

export const templateSchema = z.object({
  slug: z.string().trim().min(1, "Template name is required"),
  description: z.string().optional(),
  attributes: z.array(attributeSchema).optional().refine((attributes) => {
    if (!attributes) return true;

    const attributesByType = attributes.reduce((acc, attr) => {
      if (!acc[attr.type]) acc[attr.type] = [];
      acc[attr.type].push(attr);
      return acc;
    }, {} as Record<string, typeof attributes>);

    for (const [, attrs] of Object.entries(attributesByType)) {
      const mandatoryAttrs = attrs.filter(attr => attr.include === 'mandatory');

      if (mandatoryAttrs.length > 1) {
        return false;
      }

      if (mandatoryAttrs.length === 1 && attrs.length > 1) {
        return false;
      }
    }

    return true;
  }, {
    message: "Attribute validation failed: when a mandatory value exists, no other values are allowed for that attribute type"
  }),
  keyUsages: z
    .object({
      requiredUsages: z.array(z.nativeEnum(CertKeyUsageType)).optional(),
      optionalUsages: z.array(z.nativeEnum(CertKeyUsageType)).optional()
    })
    .optional(),
  extendedKeyUsages: z
    .object({
      requiredUsages: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional(),
      optionalUsages: z.array(z.nativeEnum(CertExtendedKeyUsageType)).optional()
    })
    .optional(),
  subjectAlternativeNames: z.array(sanSchema).optional(),
  validity: z
    .object({
      maxDuration: z
        .object({
          value: z.number().min(1, "Duration must be at least 1"),
          unit: z.nativeEnum(CertDurationUnit)
        })
        .optional(),
      minDuration: z
        .object({
          value: z.number().min(1, "Duration must be at least 1"),
          unit: z.nativeEnum(CertDurationUnit)
        })
        .optional()
    })
    .optional(),
  signatureAlgorithm: z
    .object({
      allowedAlgorithms: z.array(z.string()).optional(),
      defaultAlgorithm: z.string().optional()
    })
    .optional(),
  keyAlgorithm: z
    .object({
      allowedKeyTypes: z.array(z.string()).optional(),
      defaultKeyType: z.string().optional()
    })
    .optional()
});

export type TemplateFormData = z.infer<typeof templateSchema>;
