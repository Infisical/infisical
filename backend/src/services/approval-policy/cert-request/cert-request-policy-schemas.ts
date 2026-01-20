import { z } from "zod";

import {
  BaseApprovalPolicySchema,
  BaseApprovalRequestGrantSchema,
  BaseApprovalRequestSchema,
  BaseCreateApprovalPolicySchema,
  BaseCreateApprovalRequestSchema,
  BaseUpdateApprovalPolicySchema
} from "../approval-policy-schemas";

export const CertRequestPolicyInputsSchema = z.object({
  profileName: z.string()
});

export const CertRequestPolicyConditionsSchema = z
  .object({
    profileNames: z.string().array()
  })
  .array();

export const CertRequestPolicyConstraintsSchema = z.object({});

export const CertRequestPolicyRequestDataSchema = z.object({
  profileId: z.string().uuid(),
  profileName: z.string(),
  certificateRequest: z.object({
    commonName: z.string().optional(),
    organization: z.string().optional(),
    organizationalUnit: z.string().optional(),
    country: z.string().optional(),
    state: z.string().optional(),
    locality: z.string().optional(),
    keyUsages: z.array(z.string()).optional(),
    extendedKeyUsages: z.array(z.string()).optional(),
    altNames: z
      .array(
        z.object({
          type: z.string(),
          value: z.string()
        })
      )
      .optional(),
    validity: z.object({
      ttl: z.string()
    }),
    notBefore: z.string().optional(),
    notAfter: z.string().optional(),
    signatureAlgorithm: z.string().optional(),
    keyAlgorithm: z.string().optional(),
    basicConstraints: z
      .object({
        isCA: z.boolean(),
        pathLength: z.number().optional()
      })
      .optional()
  }),
  certificateRequestId: z.string().uuid()
});

export const CertRequestPolicySchema = BaseApprovalPolicySchema.extend({
  conditions: z.object({
    version: z.literal(1),
    conditions: CertRequestPolicyConditionsSchema
  }),
  constraints: z.object({
    version: z.literal(1),
    constraints: CertRequestPolicyConstraintsSchema
  })
});

export const CreateCertRequestPolicySchema = BaseCreateApprovalPolicySchema.extend({
  conditions: CertRequestPolicyConditionsSchema,
  constraints: CertRequestPolicyConstraintsSchema.optional()
    .default({})
    .transform((val) => val ?? {}),
  bypassForMachineIdentities: z.boolean().optional().default(false)
});

export const UpdateCertRequestPolicySchema = BaseUpdateApprovalPolicySchema.extend({
  conditions: CertRequestPolicyConditionsSchema.optional(),
  constraints: CertRequestPolicyConstraintsSchema.optional(),
  bypassForMachineIdentities: z.boolean().optional()
});

export const CertRequestRequestSchema = BaseApprovalRequestSchema.extend({
  requestData: z.object({
    version: z.literal(1),
    requestData: CertRequestPolicyRequestDataSchema
  })
});

export const CreateCertRequestRequestSchema = BaseCreateApprovalRequestSchema.extend({
  requestData: CertRequestPolicyRequestDataSchema
});

export const CertRequestRequestGrantSchema = BaseApprovalRequestGrantSchema.extend({
  attributes: CertRequestPolicyRequestDataSchema
});
