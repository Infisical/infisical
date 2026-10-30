import RE2 from "re2";
import { z } from "zod";

import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { HsmKeyLabelSchema } from "@app/services/hsm-connector/hsm-connector-fns";
import { CertKeySource } from "@app/services/signer/signer-enums";

const RE_NO_NEWLINES = new RE2("^[^\\r\\n]+$");

export const SignerIdParamsSchema = z.object({ signerId: z.string().uuid() });

export const SignerRequestParamsSchema = SignerIdParamsSchema.extend({ requestId: z.string().uuid() });

export const ExternalOrderIdSchema = z.string().trim().min(1).max(32);

export const SignerExternalConfigurationSchema = z.object({
  caType: z
    .enum([CaType.DIGICERT, CaType.ADCS])
    .optional()
    .describe(
      "Optional. The CA type is resolved from caId. If provided, it must match the type of that certificate authority."
    ),
  reissueFromExternalOrderId: ExternalOrderIdSchema.optional().describe(
    "DigiCert only. Reissue into this existing DigiCert order instead of placing a new order (reuses the subscription slot). DigiCert revokes the order's previous certificate."
  ),
  importFromExternalOrderId: ExternalOrderIdSchema.optional().describe(
    "DigiCert only. Use the certificate already issued in this DigiCert order, without reissuing it. Requires certificate.hsmKeyLabel to point at the certificate's private key on the HSM. The common name, validity and key algorithm come from that certificate, so commonName, certificateTtlDays and keyAlgorithm can't be sent with it."
  ),
  template: z
    .string()
    .trim()
    .min(1)
    .max(256)
    .refine((v) => RE_NO_NEWLINES.test(v), "Template name must not contain newline characters")
    .optional()
    .describe(
      "Active Directory Certificate Service only. The certificate template this signer requests when issuing (e.g. a code-signing template)."
    )
});

export const SignerCertificateInputSchema = z.object({
  keySource: z.enum([CertKeySource.Infisical, CertKeySource.Hsm]).optional(),
  hsmConnectorId: z.string().uuid().optional(),
  hsmKeyLabel: HsmKeyLabelSchema.refine((v) => RE_NO_NEWLINES.test(v), "Key label must not contain newline characters")
    .optional()
    .describe(
      "The label of the certificate's private key on the HSM. Only used when using an existing DigiCert certificate. If more than one private key in the HSM Connector's slot has this label, also set hsmKeyId."
    ),
  hsmKeyId: z
    .string()
    .trim()
    .min(2)
    .max(256)
    .regex(/^(?:[0-9a-fA-F]{2})+$/, "Key ID must be the hex encoding of the key's CKA_ID")
    .transform((v) => v.toLowerCase())
    .optional()
    .describe(
      "The hex-encoded PKCS#11 key ID (CKA_ID) of the private key, used to tell apart keys that share a label. Only used with hsmKeyLabel."
    )
});

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

export const HSM_REISSUE_KEY_ALGORITHMS: readonly CertKeyAlgorithm[] = [
  ...HSM_SUPPORTED_KEY_ALGORITHMS,
  CertKeyAlgorithm.RSA_3072
];

export const refineSignerCertificateInput = (
  data: {
    commonName?: string;
    certificateTtlDays?: number;
    keyAlgorithm?: CertKeyAlgorithm;
    certificate?: z.infer<typeof SignerCertificateInputSchema>;
    externalConfiguration?: z.infer<typeof SignerExternalConfigurationSchema>;
  },
  ctx: z.RefinementCtx
) => {
  const isImport = Boolean(data.externalConfiguration?.importFromExternalOrderId);
  if (isImport && data.externalConfiguration?.reissueFromExternalOrderId) {
    ctx.addIssue({
      code: "custom",
      message: "Provide either importFromExternalOrderId or reissueFromExternalOrderId, not both",
      path: ["externalConfiguration", "importFromExternalOrderId"]
    });
  }
  if (isImport) {
    if (data.certificate?.keySource !== CertKeySource.Hsm || !data.certificate.hsmConnectorId) {
      ctx.addIssue({
        code: "custom",
        message: `Using an existing DigiCert certificate requires keySource = '${CertKeySource.Hsm}' and an hsmConnectorId`,
        path: ["certificate", "keySource"]
      });
    }
    if (!data.certificate?.hsmKeyLabel) {
      ctx.addIssue({
        code: "custom",
        message: "hsmKeyLabel is required when using an existing DigiCert certificate",
        path: ["certificate", "hsmKeyLabel"]
      });
    }
    (["commonName", "certificateTtlDays", "keyAlgorithm"] as const).forEach((field) => {
      if (data[field] === undefined) return;
      ctx.addIssue({
        code: "custom",
        message: `${field} comes from the certificate in the DigiCert order and can't be set together with externalConfiguration.importFromExternalOrderId`,
        path: [field]
      });
    });
    return;
  }
  (["hsmKeyLabel", "hsmKeyId"] as const).forEach((field) => {
    if (!data.certificate?.[field]) return;
    ctx.addIssue({
      code: "custom",
      message: `${field} can only be set together with externalConfiguration.importFromExternalOrderId`,
      path: ["certificate", field]
    });
  });
  if (data.certificate?.keySource !== CertKeySource.Hsm) return;
  if (!data.certificate.hsmConnectorId) {
    ctx.addIssue({
      code: "custom",
      message: `hsmConnectorId is required when keySource = '${CertKeySource.Hsm}'`,
      path: ["certificate", "hsmConnectorId"]
    });
  }
  if (!data.keyAlgorithm || !HSM_SUPPORTED_KEY_ALGORITHMS.includes(data.keyAlgorithm)) {
    ctx.addIssue({
      code: "custom",
      message: `keyAlgorithm must be one of ${HSM_SUPPORTED_KEY_ALGORITHMS.join(", ")} when keySource = '${CertKeySource.Hsm}'`,
      path: ["keyAlgorithm"]
    });
  }
};

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
