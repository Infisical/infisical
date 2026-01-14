import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { AzureAdCsCertificateAuthoritySchema } from "@app/services/certificate-authority/azure-ad-cs/azure-ad-cs-certificate-authority-schemas";
import {
  CreateAzureAdCsCertificateAuthoritySchema,
  UpdateAzureAdCsCertificateAuthoritySchema
} from "@app/services/certificate-authority/azure-ad-cs/deprecated-azure-ad-cs-certificate-authority-schemas";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";

import { registerCertificateAuthorityEndpoints } from "./certificate-authority-endpoints";

export const registerAzureAdCsCertificateAuthorityRouter = async (server: FastifyZodProvider) => {
  registerCertificateAuthorityEndpoints({
    caType: CaType.AZURE_AD_CS,
    server,
    responseSchema: AzureAdCsCertificateAuthoritySchema,
    createSchema: CreateAzureAdCsCertificateAuthoritySchema,
    updateSchema: UpdateAzureAdCsCertificateAuthoritySchema
  });

  server.route({
    method: "GET",
    url: "/:caId/templates",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      description: "Get available certificate templates from Azure AD CS CA",
      params: z.object({
        caId: z.string().describe("Azure AD CS CA ID")
      }),
      querystring: z.object({
        projectId: z.string().describe("Project ID")
      }),
      response: {
        200: z.object({
          templates: z.array(
            z.object({
              id: z.string().describe("Template identifier"),
              name: z.string().describe("Template display name"),
              description: z.string().optional().describe("Template description")
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const templates = await server.services.certificateAuthority.getAzureAdcsTemplates({
        caId: req.params.caId,
        projectId: req.query.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.GET_AZURE_AD_TEMPLATES,
          metadata: {
            caId: req.params.caId,
            amount: templates.length
          }
        }
      });

      return { templates };
    }
  });
};
