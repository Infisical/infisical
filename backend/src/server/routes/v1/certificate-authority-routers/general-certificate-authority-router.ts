import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { AcmeCertificateAuthoritySchema } from "@app/services/certificate-authority/acme/acme-certificate-authority-schemas";
import { AwsPcaCertificateAuthoritySchema } from "@app/services/certificate-authority/aws-pca/aws-pca-certificate-authority-schemas";
import { AzureAdCsCertificateAuthoritySchema } from "@app/services/certificate-authority/azure-ad-cs/azure-ad-cs-certificate-authority-schemas";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { InternalCertificateAuthoritySchema } from "@app/services/certificate-authority/internal/internal-certificate-authority-schemas";

const CertificateAuthoritySchema = z.discriminatedUnion("type", [
  InternalCertificateAuthoritySchema,
  AcmeCertificateAuthoritySchema,
  AzureAdCsCertificateAuthoritySchema,
  AwsPcaCertificateAuthoritySchema
]);

export const registerGeneralCertificateAuthorityRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "listCertificateAuthoritiesV1General",
      tags: [ApiDocsTags.PkiCertificateAuthorities],
      description: "Get Certificate Authorities",
      querystring: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          certificateAuthorities: CertificateAuthoritySchema.array()
        })
      }
    },
    handler: async (req) => {
      const internalCas = await server.services.certificateAuthority.listCertificateAuthoritiesByProjectId(
        {
          projectId: req.query.projectId,
          type: CaType.INTERNAL
        },
        req.permission
      );

      const acmeCas = await server.services.certificateAuthority.listCertificateAuthoritiesByProjectId(
        {
          projectId: req.query.projectId,
          type: CaType.ACME
        },
        req.permission
      );

      const azureAdCsCas = await server.services.certificateAuthority.listCertificateAuthoritiesByProjectId(
        {
          projectId: req.query.projectId,
          type: CaType.AZURE_AD_CS
        },
        req.permission
      );

      const awsPcaCas = await server.services.certificateAuthority.listCertificateAuthoritiesByProjectId(
        {
          projectId: req.query.projectId,
          type: CaType.AWS_PCA
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.GET_CAS,
          metadata: {
            caIds: [
              ...(internalCas ?? []).map((ca) => ca.id),
              ...(acmeCas ?? []).map((ca) => ca.id),
              ...(azureAdCsCas ?? []).map((ca) => ca.id),
              ...(awsPcaCas ?? []).map((ca) => ca.id)
            ]
          }
        }
      });

      return {
        certificateAuthorities: [
          ...(internalCas ?? []),
          ...(acmeCas ?? []),
          ...(azureAdCsCas ?? []),
          ...(awsPcaCas ?? [])
        ]
      };
    }
  });
};
