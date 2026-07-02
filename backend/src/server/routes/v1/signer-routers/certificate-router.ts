import { z } from "zod";

import { PkiSignersSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertKeySource } from "@app/services/signer/signer-enums";

import {
  HSM_SUPPORTED_KEY_ALGORITHMS,
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
          certificate: z
            .object({
              keySource: z.nativeEnum(CertKeySource),
              hsmConnectorId: z.string().uuid().optional()
            })
            .optional(),
          externalConfiguration: SignerExternalConfigurationSchema.optional()
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
          if (!data.keyAlgorithm || !HSM_SUPPORTED_KEY_ALGORITHMS.includes(data.keyAlgorithm)) {
            ctx.addIssue({
              code: "custom",
              message: `keyAlgorithm must be one of ${HSM_SUPPORTED_KEY_ALGORITHMS.join(", ")} when keySource = '${CertKeySource.Hsm}'`,
              path: ["keyAlgorithm"]
            });
          }
        }),
      response: { 200: PkiSignersSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
