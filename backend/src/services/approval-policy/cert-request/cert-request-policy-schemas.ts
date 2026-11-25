import { z } from "zod";

import {
  certificateAttributesSchema,
  domainComponentSchema,
  resolvedCustomExtensionSchema
} from "@app/services/certificate-common/certificate-constants";
import { CertificateRenewalKeySource } from "@app/services/certificate-v3/certificate-v3-types";

import { CertRequestPolicyOperation } from "../approval-policy-enums";
import {
  BaseApprovalPolicySchema,
  BaseApprovalRequestGrantSchema,
  BaseApprovalRequestSchema,
  BaseCreateApprovalPolicySchema,
  BaseCreateApprovalRequestSchema,
  BaseUpdateApprovalPolicySchema
} from "../approval-policy-schemas";

export const CertRequestPolicyInputsSchema = z.object({
  profileName: z.string(),
  operation: z.nativeEnum(CertRequestPolicyOperation).optional(),
  applicationId: z.string().uuid().optional()
});

export const CertRequestPolicyConditionsSchema = z
  .object({
    profileNames: z.string().array()
  })
  .array();

export const CertRequestPolicyConstraintsSchema = z.object({
  operation: z.nativeEnum(CertRequestPolicyOperation).optional()
});

// Policy rows reach callers unparsed, and policies created before Renewal policies existed store no operation.
export const parseCertRequestPolicyOperation = (policy: { constraints?: unknown }) =>
  (policy.constraints as { constraints?: { operation?: CertRequestPolicyOperation } } | null | undefined)?.constraints
    ?.operation ?? CertRequestPolicyOperation.Issuance;

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
    domainComponents: z.array(domainComponentSchema).optional(),
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
      .optional(),
    customExtensions: z.array(resolvedCustomExtensionSchema).optional()
  }),
  certificateRequestId: z.string().uuid(),
  renewal: z
    .object({
      certificateId: z.string().uuid(),
      renewalKeySource: z.nativeEnum(CertificateRenewalKeySource),
      csr: z.string().optional(),
      attributes: certificateAttributesSchema.optional(),
      caId: z.string().uuid().optional(),
      externalConfiguration: z.object({ reissue: z.boolean().optional() }).optional(),
      // Whether the daily auto-renewal job raised the request. Requester columns can't tell: deleting a user clears
      // them on their requests. Absent on requests raised before it existed.
      raisedByAutoRenewal: z.boolean().optional(),
      // The certificate being renewed, which certificateRequest can't name when the renewal changes the common name.
      // Absent on requests raised before it existed.
      certificateName: z.string().optional()
    })
    .optional(),
  // The certificate an EST or SCEP re-enrollment replaces. These issue from the client's CSR like a new certificate,
  // then link to it, so they don't go through `renewal`.
  renewalOfCertificateId: z.string().uuid().optional(),
  // How the re-enrollment names the certificate it replaces. Absent on requests raised before it existed.
  renewalOfCertificateName: z.string().optional()
});

// The certificate a request renews: a renewal's, or the one an EST or SCEP re-enrollment replaces.
export const getRenewedCertificateId = (
  requestData: Pick<z.infer<typeof CertRequestPolicyRequestDataSchema>, "renewal" | "renewalOfCertificateId">
) => requestData.renewal?.certificateId ?? requestData.renewalOfCertificateId;

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
    .transform((val) => val ?? {})
});

export const UpdateCertRequestPolicySchema = BaseUpdateApprovalPolicySchema.extend({
  conditions: CertRequestPolicyConditionsSchema.optional(),
  // Clients that predate the setting send `{}`: keep the stored value instead of clearing it.
  constraints: z
    .object({ operation: z.nativeEnum(CertRequestPolicyOperation).optional() })
    .optional()
    .transform((constraints) => (constraints?.operation ? { operation: constraints.operation } : undefined))
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
