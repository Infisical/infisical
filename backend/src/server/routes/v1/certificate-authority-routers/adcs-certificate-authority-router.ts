import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  ADCSCertificateAuthoritySchema,
  CreateADCSCertificateAuthoritySchema,
  UpdateADCSCertificateAuthoritySchema
} from "@app/services/certificate-authority/adcs/adcs-certificate-authority-schemas";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";

import { registerCertificateAuthorityEndpoints } from "./certificate-authority-endpoints";

export const registerADCSCertificateAuthorityRouter = async (server: FastifyZodProvider) => {
  registerCertificateAuthorityEndpoints({
    caType: CaType.ADCS,
    server,
    responseSchema: ADCSCertificateAuthoritySchema,
    createSchema: CreateADCSCertificateAuthoritySchema,
    updateSchema: UpdateADCSCertificateAuthoritySchema
  });

  server.route({
    method: "GET",
    url: "/:caId/templates",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getAdcsTemplates",
      description: "Get available certificate templates from ADCS CA",
      params: z.object({
        caId: z.string().describe("ADCS CA ID")
      }),
      response: {
        200: z.object({
          templates: z.array(
            z.object({
              id: z.string().describe("Template identifier"),
              name: z.string().describe("Template display name")
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const templates = await server.services.certificateAuthority.getADCSTemplates({
        caId: req.params.caId,
        projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_ADCS_TEMPLATES,
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
