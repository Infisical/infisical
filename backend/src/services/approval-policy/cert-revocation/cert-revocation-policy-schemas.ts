import { z } from "zod";

import { CrlReason } from "@app/services/certificate/certificate-types";

import {
  BaseApprovalPolicySchema,
  BaseApprovalRequestGrantSchema,
  BaseApprovalRequestSchema,
  BaseCreateApprovalPolicySchema,
  BaseUpdateApprovalPolicySchema
} from "../approval-policy-schemas";

const ProfileSlugSchema = z.string().trim().min(1).max(255);

// Revocation is rare and destructive, so no actor skips its approval.
const NoMachineIdentityBypassSchema = z
  .boolean()
  .refine((value) => !value, { message: "Revocation approval policies can't be bypassed by machine identities" });

export const CertRevocationPolicyInputsSchema = z.object({
  profileName: ProfileSlugSchema,
  applicationId: z.string().uuid()
});

export const CertRevocationPolicyConditionsSchema = z
  .object({
    profileNames: ProfileSlugSchema.array().min(1).max(100)
  })
  .array()
  .min(1)
  .max(50);

export const CertRevocationPolicyConstraintsSchema = z.object({});

export const CertRevocationPolicyRequestDataSchema = z.object({
  certificateId: z.string().uuid(),
  serialNumber: z.string(),
  commonName: z.string(),
  profileId: z.string().uuid(),
  profileName: z.string(),
  applicationId: z.string().uuid(),
  revocationReason: z.nativeEnum(CrlReason)
});

export const CertRevocationPolicySchema = BaseApprovalPolicySchema.extend({
  conditions: z.object({
    version: z.literal(1),
    conditions: CertRevocationPolicyConditionsSchema
  }),
  constraints: z.object({
    version: z.literal(1),
    constraints: CertRevocationPolicyConstraintsSchema
  })
});

export const CreateCertRevocationPolicySchema = BaseCreateApprovalPolicySchema.extend({
  conditions: CertRevocationPolicyConditionsSchema,
  constraints: CertRevocationPolicyConstraintsSchema.optional()
    .default({})
    .transform((val) => val ?? {}),
  bypassForMachineIdentities: NoMachineIdentityBypassSchema.optional().default(false)
});

export const UpdateCertRevocationPolicySchema = BaseUpdateApprovalPolicySchema.extend({
  conditions: CertRevocationPolicyConditionsSchema.optional(),
  constraints: CertRevocationPolicyConstraintsSchema.optional(),
  bypassForMachineIdentities: NoMachineIdentityBypassSchema.optional()
});

export const CertRevocationRequestSchema = BaseApprovalRequestSchema.extend({
  requestData: z.object({
    version: z.literal(1),
    requestData: CertRevocationPolicyRequestDataSchema
  })
});

export const CertRevocationRequestGrantSchema = BaseApprovalRequestGrantSchema.extend({
  attributes: CertRevocationPolicyRequestDataSchema
});
