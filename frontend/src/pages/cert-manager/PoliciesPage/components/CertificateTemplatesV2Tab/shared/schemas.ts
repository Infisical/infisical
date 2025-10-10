import { z } from "zod";

import { INCLUDE_OPTIONS, SAN_TYPES, SUBJECT_ATTRIBUTE_TYPES } from "./utils";

export const attributeSchema = z.object({
  type: z.enum(SUBJECT_ATTRIBUTE_TYPES),
  include: z.enum(INCLUDE_OPTIONS),
  value: z.array(z.string()).optional()
});

export const sanSchema = z.object({
  type: z.enum(SAN_TYPES),
  include: z.enum(INCLUDE_OPTIONS),
  value: z.array(z.string()).optional()
});

export const templateSchema = z.object({
  name: z.string().trim().min(1, "Template name is required"),
  description: z.string().optional(),
  attributes: z.array(attributeSchema).optional(),
  keyUsages: z
    .object({
      requiredUsages: z.array(z.string()).optional(),
      optionalUsages: z.array(z.string()).optional()
    })
    .optional(),
  extendedKeyUsages: z
    .object({
      requiredUsages: z.array(z.string()).optional(),
      optionalUsages: z.array(z.string()).optional()
    })
    .optional(),
  subjectAlternativeNames: z.array(sanSchema).optional(),
  validity: z
    .object({
      maxDuration: z
        .object({
          value: z.number().min(1, "Duration must be at least 1"),
          unit: z.enum(["days", "months", "years"])
        })
        .optional(),
      minDuration: z
        .object({
          value: z.number().min(1, "Duration must be at least 1"),
          unit: z.enum(["days", "months", "years"])
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
