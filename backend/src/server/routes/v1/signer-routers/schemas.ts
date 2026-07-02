import { z } from "zod";

import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";

export const SignerIdParamsSchema = z.object({ signerId: z.string().uuid() });

export const SignerExternalConfigurationSchema = z.discriminatedUnion("caType", [
  z.object({
    caType: z.literal(CaType.DIGICERT),
    reissueFromExternalOrderId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "Reissue into this existing DigiCert order instead of placing a new order (reuses the subscription slot)."
      )
  })
]);

export const SignerKeyAlgorithm = {
  values: [
    CertKeyAlgorithm.RSA_2048,
    CertKeyAlgorithm.RSA_3072,
    CertKeyAlgorithm.RSA_4096,
    CertKeyAlgorithm.ECDSA_P256,
    CertKeyAlgorithm.ECDSA_P384,
    CertKeyAlgorithm.ECDSA_P521
  ] as const,
  get schema() {
    return z.enum(this.values);
  }
} as const;

export const HSM_SUPPORTED_KEY_ALGORITHMS: readonly CertKeyAlgorithm[] = [
  CertKeyAlgorithm.RSA_2048,
  CertKeyAlgorithm.RSA_4096,
  CertKeyAlgorithm.ECDSA_P256,
  CertKeyAlgorithm.ECDSA_P384
];

export const ApprovalPolicyBodySchema = z
  .object({
    steps: z.array(
      z.object({
        stepNumber: z.number().int().min(1),
        name: z.string().trim().max(64).nullable().optional(),
        requiredApprovals: z.number().int().min(1),
        approverUserIds: z.array(z.string().uuid()).default([]),
        approverGroupIds: z.array(z.string().uuid()).default([])
      })
    ),
    constraints: z
      .object({
        maxSignings: z.number().int().min(1).nullable().optional(),
        maxWindowDuration: z.string().nullable().optional()
      })
      .optional()
  })
  .refine(
    (policy) =>
      policy.steps.length === 0 ||
      Boolean(policy.constraints?.maxSignings) ||
      Boolean(policy.constraints?.maxWindowDuration),
    {
      message:
        "Approval policy must define at least one of maxSignings or maxWindowDuration when steps are configured.",
      path: ["constraints"]
    }
  );
