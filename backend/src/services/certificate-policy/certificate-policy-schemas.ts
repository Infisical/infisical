import RE2 from "re2";
import { z } from "zod";

import { CERTIFICATE_POLICIES } from "@app/lib/api-docs";
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertPolicyState,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType,
  domainComponentSchema,
  MAX_DOMAIN_COMPONENTS,
  PKI_TEXT_COLUMN_MAX_LENGTH
} from "@app/services/certificate-common/certificate-constants";

import { TSingleValuedSubjectAttributeType } from "./certificate-policy-types";

const sanTypeSchema = z.nativeEnum(CertSubjectAlternativeNameType);

const SINGLE_VALUED_SUBJECT_ATTRIBUTE_TYPES = Object.values(CertSubjectAttributeType).filter(
  (type): type is TSingleValuedSubjectAttributeType => type !== CertSubjectAttributeType.DOMAIN_COMPONENT
);

const singleValuedAttributeTypeSchema = z.enum(
  SINGLE_VALUED_SUBJECT_ATTRIBUTE_TYPES as [TSingleValuedSubjectAttributeType, ...TSingleValuedSubjectAttributeType[]]
);

const MAX_DOMAIN_COMPONENT_SEQUENCES = 25;

const requestSubjectValueSchema = z
  .string()
  .trim()
  .min(1, "Value cannot be empty")
  .max(PKI_TEXT_COLUMN_MAX_LENGTH, `Value cannot exceed ${PKI_TEXT_COLUMN_MAX_LENGTH} characters`);

const buildDomainComponentSequenceListSchema = (
  componentSchema: z.ZodType<string>,
  isRequest: boolean,
  liftFlatList: (labels: string[]) => string[][]
) => {
  const sequenceSchema = isRequest
    ? z
        .array(componentSchema)
        .min(1, "A domain component sequence must contain at least one component")
        .max(MAX_DOMAIN_COMPONENTS, `A domain component sequence cannot exceed ${MAX_DOMAIN_COMPONENTS} components`)
    : z.array(componentSchema);

  const listSchema = z.union([sequenceSchema, z.array(sequenceSchema)]).transform((value): string[][] => {
    const isFlatLabelList = value.length > 0 && value.every((entry) => typeof entry === "string");
    return isFlatLabelList ? liftFlatList(value as string[]) : (value as string[][]);
  });

  if (!isRequest) return listSchema;

  return listSchema.refine(
    (sequences) => sequences.length <= MAX_DOMAIN_COMPONENT_SEQUENCES,
    `A domain component rule cannot hold more than ${MAX_DOMAIN_COMPONENT_SEQUENCES} sequences`
  );
};

const buildPolicySubjectSchema = (valueSchema: z.ZodType<string>, isRequest: boolean) => {
  const componentSchema = isRequest ? domainComponentSchema : z.string();
  const domainComponentListSchema = buildDomainComponentSequenceListSchema(componentSchema, isRequest, (labels) => [
    labels
  ]);
  const deniedDomainComponentListSchema = buildDomainComponentSequenceListSchema(componentSchema, isRequest, (labels) =>
    labels.map((label) => [label])
  );

  const singleValuedSchema = z.object({
    type: singleValuedAttributeTypeSchema,
    allowed: z.array(valueSchema).optional(),
    required: z.array(valueSchema).optional(),
    denied: z.array(valueSchema).optional()
  });

  const domainComponentSubjectSchema = z.object({
    type: z.literal(CertSubjectAttributeType.DOMAIN_COMPONENT),
    allowed: domainComponentListSchema.optional().describe(CERTIFICATE_POLICIES.SUBJECT_DOMAIN_COMPONENT_RULE.allowed),
    required: domainComponentListSchema
      .optional()
      .describe(CERTIFICATE_POLICIES.SUBJECT_DOMAIN_COMPONENT_RULE.required),
    denied: deniedDomainComponentListSchema
      .optional()
      .describe(CERTIFICATE_POLICIES.SUBJECT_DOMAIN_COMPONENT_RULE.denied)
  });

  const unionSchema = z.discriminatedUnion("type", [singleValuedSchema, domainComponentSubjectSchema]);
  if (!isRequest) return unionSchema;

  return unionSchema.refine((data) => Boolean(data.allowed || data.required || data.denied), {
    message: "Subject attribute must have at least one allowed, required, or denied value"
  });
};

export const policySubjectSchema = buildPolicySubjectSchema(requestSubjectValueSchema, true);
const storedPolicySubjectSchema = buildPolicySubjectSchema(z.string(), false);

const policyKeyUsagesSchema = z
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

const policyExtendedKeyUsagesSchema = z
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

const policySanSchema = z
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

const policyValiditySchema = z.object({
  max: z
    .string()
    .regex(new RE2("^\\d+[dhmy]$"), {
      message: "Max validity must be in format like '365d', '12m', '1y', or '24h'"
    })
    .optional()
});

const policyAlgorithmsSchema = z.object({
  signature: z
    .array(z.string().trim().min(1, "Algorithm cannot be empty"))
    .min(1, "At least one signature algorithm must be provided")
    .optional(),
  keyAlgorithm: z
    .array(z.string().trim().min(1, "Algorithm cannot be empty"))
    .min(1, "At least one key algorithm must be provided")
    .optional()
});

export const policyBasicConstraintsSchema = z
  .object({
    isCA: z.nativeEnum(CertPolicyState).optional(),
    maxPathLength: z
      .number()
      .int("Path length must be an integer")
      .min(-1, "Path length must be -1 (unlimited) or a non-negative integer")
      .optional()
  })
  .nullable();

export const certificatePolicyResponseSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid("Project ID must be valid"),
  name: z
    .string()
    .trim()
    .min(1, "Policy name is required")
    .max(255, "Policy name must be less than 255 characters")
    .regex(new RE2("^[a-zA-Z0-9-_]+$"), "Policy name must contain only letters, numbers, hyphens, and underscores"),
  description: z.string().trim().max(1000, "Description must be less than 1000 characters").nullable().optional(),
  subject: z.array(storedPolicySubjectSchema).optional(),
  sans: z.array(policySanSchema).optional(),
  keyUsages: policyKeyUsagesSchema.optional(),
  extendedKeyUsages: policyExtendedKeyUsagesSchema.optional(),
  algorithms: policyAlgorithmsSchema.optional(),
  validity: policyValiditySchema.optional(),
  basicConstraints: policyBasicConstraintsSchema.optional(),
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
