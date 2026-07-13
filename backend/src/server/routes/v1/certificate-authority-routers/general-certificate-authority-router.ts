import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { openApiHidden } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { SanitizedAcmeCertificateAuthoritySchema } from "@app/services/certificate-authority/acme/acme-certificate-authority-schemas";
import { ADCSCertificateAuthoritySchema } from "@app/services/certificate-authority/adcs/adcs-certificate-authority-schemas";
import { AwsAcmPublicCaCertificateAuthoritySchema } from "@app/services/certificate-authority/aws-acm-public-ca/aws-acm-public-ca-certificate-authority-schemas";
import { AwsPcaCertificateAuthoritySchema } from "@app/services/certificate-authority/aws-pca/aws-pca-certificate-authority-schemas";
import { AzureAdCsCertificateAuthoritySchema } from "@app/services/certificate-authority/azure-ad-cs/azure-ad-cs-certificate-authority-schemas";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { DigiCertCertificateAuthoritySchema } from "@app/services/certificate-authority/digicert/digicert-certificate-authority-schemas";
import { GoDaddyCertificateAuthoritySchema } from "@app/services/certificate-authority/godaddy/godaddy-certificate-authority-schemas";
import { InternalCertificateAuthoritySchema } from "@app/services/certificate-authority/internal/internal-certificate-authority-schemas";
import { VenafiTppCertificateAuthoritySchema } from "@app/services/certificate-authority/venafi-tpp/venafi-tpp-certificate-authority-schemas";

const CertificateAuthoritySchema = z.discriminatedUnion("type", [
  InternalCertificateAuthoritySchema,
  SanitizedAcmeCertificateAuthoritySchema,
  AzureAdCsCertificateAuthoritySchema,
  ADCSCertificateAuthoritySchema,
  AwsPcaCertificateAuthoritySchema,
  DigiCertCertificateAuthoritySchema,
  GoDaddyCertificateAuthoritySchema,
  AwsAcmPublicCaCertificateAuthoritySchema,
  VenafiTppCertificateAuthoritySchema
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
        projectId: z.string().optional().describe(openApiHidden())
      }),
      response: {
        200: z.object({
          certificateAuthorities: CertificateAuthoritySchema.array()
        })
      }
    },
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const internalCas = await server.services.certificateAuthority.listCertificateAuthoritiesByProjectId(
        {
          projectId,
          type: CaType.INTERNAL
        },
        req.permission
      );

      const acmeCas = await server.services.certificateAuthority.listCertificateAuthoritiesByProjectId(
        {
          projectId,
          type: CaType.ACME
        },
        req.permission
      );

      const azureAdCsCas = await server.services.certificateAuthority.listCertificateAuthoritiesByProjectId(
        {
          projectId,
          type: CaType.AZURE_AD_CS
        },
        req.permission
      );

      const adcsCas = await server.services.certificateAuthority.listCertificateAuthoritiesByProjectId(
        {
          projectId,
          type: CaType.ADCS
        },
        req.permission
      );

      const awsPcaCas = await server.services.certificateAuthority.listCertificateAuthoritiesByProjectId(
        {
          projectId,
          type: CaType.AWS_PCA
        },
        req.permission
      );

      const digicertCas = await server.services.certificateAuthority.listCertificateAuthoritiesByProjectId(
        {
          projectId,
          type: CaType.DIGICERT
        },
        req.permission
      );

      const awsAcmPublicCas = await server.services.certificateAuthority.listCertificateAuthoritiesByProjectId(
        {
          projectId,
          type: CaType.AWS_ACM_PUBLIC_CA
        },
        req.permission
      );

      const venafiTppCas = await server.services.certificateAuthority.listCertificateAuthoritiesByProjectId(
        {
          projectId,
          type: CaType.VENAFI_TPP
        },
        req.permission
      );

      const godaddyCas = await server.services.certificateAuthority.listCertificateAuthoritiesByProjectId(
        {
          projectId,
          type: CaType.GODADDY
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_CAS,
          metadata: {
            caIds: [
              ...(internalCas ?? []).map((ca) => ca.id),
              ...(acmeCas ?? []).map((ca) => ca.id),
              ...(azureAdCsCas ?? []).map((ca) => ca.id),
              ...(adcsCas ?? []).map((ca) => ca.id),
              ...(awsPcaCas ?? []).map((ca) => ca.id),
              ...(digicertCas ?? []).map((ca) => ca.id),
              ...(awsAcmPublicCas ?? []).map((ca) => ca.id),
              ...(venafiTppCas ?? []).map((ca) => ca.id),
              ...(godaddyCas ?? []).map((ca) => ca.id)
            ]
          }
        }
      });

      return {
        certificateAuthorities: [
          ...(internalCas ?? []),
          ...(acmeCas ?? []),
          ...(azureAdCsCas ?? []),
          ...(adcsCas ?? []),
          ...(awsPcaCas ?? []),
          ...(digicertCas ?? []),
          ...(awsAcmPublicCas ?? []),
          ...(venafiTppCas ?? []),
          ...(godaddyCas ?? [])
        ]
      };
    }
  });
};
