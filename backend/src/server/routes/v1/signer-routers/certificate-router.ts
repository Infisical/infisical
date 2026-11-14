import { z } from "zod";

import { PkiSignersSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, CERTIFICATES } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CrlReason } from "@app/services/certificate/certificate-types";
import { CertKeySource } from "@app/services/signer/signer-enums";

import {
  ExternalOrderIdSchema,
  HSM_REISSUE_KEY_ALGORITHMS,
  SignerCertificateInputSchema,
  SignerExternalConfigurationSchema,
  SignerIdParamsSchema,
  SignerKeyAlgorithm,
  SignerRevocationResponseSchema
} from "./schemas";

const PERMANENT_REVOCATION_REASONS = Object.values(CrlReason).filter(
  (reason) => reason !== CrlReason.CERTIFICATE_HOLD
) as [CrlReason, ...CrlReason[]];

export const registerSignerCertificateRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:signerId/certificate/reissue",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "reissueSignerCertificate",
      tags: [ApiDocsTags.PkiSigners],
      description:
        "Re-issue the signer's certificate, optionally from a different CA or with a different key source. If a certificate request is open, it's canceled first, along with its DigiCert order. If the signer's certificate was revoked, the new certificate always uses a new key, and the signer can sign again once it's issued.",
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
    url: "/:signerId/certificate/renew",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "renewSignerCertificate",
      tags: [ApiDocsTags.PkiSigners],
      description:
        "Renew the signer's certificate from the same certificate authority, keeping its common name, validity, and key source. External CAs such as DigiCert issue it later: get the signer until `certificateRequest.status` is `completed`, `failed`, or `cancelled`.",
      params: SignerIdParamsSchema,
      response: { 200: PkiSignersSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { signer, caId, caName, previousSerialNumber } = await server.services.pkiSigner.renewCertificate({
        signerId: req.params.signerId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: signer.projectId,
        event: {
          type: EventType.RENEW_PKI_SIGNER_CERTIFICATE,
          metadata: {
            signerId: signer.id,
            name: signer.name,
            status: signer.status,
            caId,
            caName,
            previousSerialNumber
          }
        }
      });

      return signer;
    }
  });

  server.route({
    method: "POST",
    url: "/:signerId/certificate/revoke",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "revokeSignerCertificate",
      tags: [ApiDocsTags.PkiSigners],
      description:
        "Revoke the signer's certificate, which stops the signer from signing right away and cancels any certificate request in progress. While the CA processes the revoke, the signer's status is `revocation_pending`, and when DigiCert requires approval, it stays there until the request is approved (`revoked`) or rejected. If the CA refuses the revoke, the certificate stays valid, the signer goes back to `active` (or stays `disabled`), the signer's admins get an in-app notification, and a canceled renewal must be started again. To sign again after a revoke, reissue the certificate with a new key.",
      params: SignerIdParamsSchema,
      body: z.object({
        revocationReason: z.enum(PERMANENT_REVOCATION_REASONS).describe(CERTIFICATES.REVOKE.revocationReason)
      }),
      response: {
        200: PkiSignersSchema.extend({
          revocation: SignerRevocationResponseSchema,
          crlWarning: z
            .string()
            .optional()
            .describe("Set when the certificate was revoked but its CA's CRL couldn't be regenerated yet.")
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { signer, certificateId, serialNumber, commonName, crlWarning, pendingRevocationRequestId } =
        await server.services.pkiSigner.revokeCertificate({
          signerId: req.params.signerId,
          revocationReason: req.body.revocationReason,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: signer.projectId,
        event: {
          type: EventType.REVOKE_PKI_SIGNER_CERTIFICATE,
          metadata: {
            signerId: signer.id,
            name: signer.name,
            certificateId,
            certificateCommonName: commonName,
            serialNumber,
            revocationReason: req.body.revocationReason,
            status: signer.status,
            digicertRevocationRequestId: pendingRevocationRequestId
          }
        }
      });

      return { ...signer, crlWarning };
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
