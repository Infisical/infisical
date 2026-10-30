import { z } from "zod";

import { PkiSignersSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertKeySource } from "@app/services/signer/signer-enums";

import {
  ExternalOrderIdSchema,
  HSM_REISSUE_KEY_ALGORITHMS,
  SignerCertificateInputSchema,
  SignerExternalConfigurationSchema,
  SignerIdParamsSchema,
  SignerKeyAlgorithm
} from "./schemas";

export const registerSignerCertificateRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:signerId/certificate/reissue",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "reissueSignerCertificate",
      tags: [ApiDocsTags.PkiSigners],
      description: "Re-issue the signer's certificate (optionally from a different CA or with a different key source)",
      params: SignerIdParamsSchema,
      body: z
        .object({
          caId: z.string().uuid(),
          commonName: z.string().trim().min(1).max(256).optional(),
          certificateTtlDays: z.number().int().min(1).max(3650).optional(),
          keyAlgorithm: SignerKeyAlgorithm.schema.optional(),
          certificate: SignerCertificateInputSchema.pick({ hsmConnectorId: true })
            .extend({ keySource: z.enum([CertKeySource.Infisical, CertKeySource.Hsm]) })
            .optional(),
          externalConfiguration: SignerExternalConfigurationSchema.omit({ importFromExternalOrderId: true })
            .strict()
            .optional()
        })
        .superRefine((data, ctx) => {
          if (data.certificate?.keySource !== CertKeySource.Hsm) return;
          if (!data.certificate.hsmConnectorId) {
            ctx.addIssue({
              code: "custom",
              message: `hsmConnectorId is required when keySource = '${CertKeySource.Hsm}'`,
              path: ["certificate", "hsmConnectorId"]
            });
          }
          if (!data.keyAlgorithm || !HSM_REISSUE_KEY_ALGORITHMS.includes(data.keyAlgorithm)) {
            ctx.addIssue({
              code: "custom",
              message: `keyAlgorithm must be one of ${HSM_REISSUE_KEY_ALGORITHMS.join(", ")} when keySource = '${CertKeySource.Hsm}'`,
              path: ["keyAlgorithm"]
            });
          }
        }),
      response: { 200: PkiSignersSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const signer = await server.services.pkiSigner.reissueCertificate({
        signerId: req.params.signerId,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: signer.projectId,
        event: {
          type: EventType.REISSUE_PKI_SIGNER_CERTIFICATE,
          metadata: {
            signerId: signer.id,
            name: signer.name,
            caId: req.body.caId,
            commonName: req.body.commonName,
            keyAlgorithm: req.body.keyAlgorithm,
            keySource: req.body.certificate?.keySource,
            hsmConnectorId: req.body.certificate?.hsmConnectorId,
            externalConfiguration: req.body.externalConfiguration
          }
        }
      });

      return signer;
    }
  });

  server.route({
    method: "POST",
    url: "/check-certificate-import",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      operationId: "checkSignerCertificateImport",
      tags: [ApiDocsTags.PkiSigners],
      description:
        "Check that the HSM private key matches the certificate in an existing DigiCert order, without creating or changing a signer.",
      body: z.object({
        caId: z.string().uuid().describe("The DigiCert certificate authority the order belongs to."),
        externalOrderId: ExternalOrderIdSchema.describe("The DigiCert order whose certificate to check."),
        certificate: SignerCertificateInputSchema.pick({
          hsmConnectorId: true,
          hsmKeyLabel: true,
          hsmKeyId: true
        }).required({ hsmConnectorId: true, hsmKeyLabel: true })
      }),
      response: {
        200: z.object({
          check: z.object({
            hsmKeyId: z
              .string()
              .nullable()
              .describe("The hex-encoded CKA_ID of the matching key, when the HSM reports one."),
            commonName: z.string(),
            certificateTtlDays: z.number(),
            keyAlgorithm: z.string()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const check = await server.services.pkiSigner.checkCertificateImport({
        projectId: req.internalCertManagerProjectId,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { check };
    }
  });

  server.route({
    method: "POST",
    url: "/:signerId/certificate/import",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "importSignerCertificate",
      tags: [ApiDocsTags.PkiSigners],
      description:
        "Switch the signer to the certificate already issued in an existing DigiCert order, signing with that certificate's private key on the HSM. DigiCert does not reissue or revoke anything.",
      params: SignerIdParamsSchema,
      body: z.object({
        caId: z.string().uuid().describe("The DigiCert certificate authority the order belongs to."),
        externalOrderId: ExternalOrderIdSchema.describe("The DigiCert order whose certificate the signer will use."),
        certificate: SignerCertificateInputSchema.pick({
          hsmConnectorId: true,
          hsmKeyLabel: true,
          hsmKeyId: true
        }).required({ hsmConnectorId: true, hsmKeyLabel: true }),
        certificateRenewBeforeDays: z
          .number()
          .int()
          .min(1)
          .max(30)
          .nullable()
          .optional()
          .describe(
            "Days before expiry to renew the certificate with the same HSM key. Must be less than the certificate's validity. Omit to keep the signer's current setting, or set to null to turn renewal off."
          )
      }),
      response: { 200: PkiSignersSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { signer, caName, hsmConnectorName } = await server.services.pkiSigner.importCertificate({
        signerId: req.params.signerId,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: signer.projectId,
        event: {
          type: EventType.IMPORT_PKI_SIGNER_CERTIFICATE,
          metadata: {
            signerId: signer.id,
            name: signer.name,
            caId: req.body.caId,
            caName,
            externalOrderId: req.body.externalOrderId,
            certificateId: signer.certificateId,
            commonName: signer.commonName ?? undefined,
            keyAlgorithm: signer.keyAlgorithm ?? undefined,
            hsmConnectorId: req.body.certificate.hsmConnectorId,
            hsmConnectorName,
            hsmKeyLabel: req.body.certificate.hsmKeyLabel,
            hsmKeyId: req.body.certificate.hsmKeyId,
            certificateRenewBeforeDays: signer.certificateRenewBeforeDays
          }
        }
      });

      return signer;
    }
  });

  server.route({
    method: "GET",
    url: "/:signerId/certificate",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "exportSignerCertificate",
      tags: [ApiDocsTags.PkiSigners],
      description: "Export the signer's leaf certificate as PEM",
      params: SignerIdParamsSchema,
      response: {
        200: z.object({
          certificatePem: z.string(),
          serialNumber: z.string(),
          signerName: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { certificatePem, serialNumber, signerName, projectId } = await server.services.pkiSigner.exportCertificate(
        {
          signerId: req.params.signerId,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        }
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.EXPORT_PKI_SIGNER_CERTIFICATE,
          metadata: { signerId: req.params.signerId, name: signerName, serialNumber }
        }
      });

      return { certificatePem, serialNumber, signerName };
    }
  });
};
