import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, ORG_SSO_SETTINGS } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode, SsoMfaTrust } from "@app/services/auth/auth-type";

const SsoSettingsResponseSchema = z.object({
  ssoSettings: z.object({
    orgId: z.string().uuid().describe(ORG_SSO_SETTINGS.orgId),
    authEnforced: z.boolean().describe(ORG_SSO_SETTINGS.authEnforced),
    googleSsoAuthEnforced: z.boolean().describe(ORG_SSO_SETTINGS.googleSsoAuthEnforced),
    bypassOrgAuthEnabled: z.boolean().describe(ORG_SSO_SETTINGS.bypassOrgAuthEnabled),
    ssoMfaTrust: z.nativeEnum(SsoMfaTrust).describe(ORG_SSO_SETTINGS.ssoMfaTrust)
  })
});

export const registerOrgSsoSettingsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/sso-settings",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getOrganizationSsoSettings",
      tags: [ApiDocsTags.SsoSettings],
      description: "Get the organization's SSO enforcement settings",
      security: [
        {
          bearerAuth: []
        }
      ],
      response: {
        200: SsoSettingsResponseSchema
      }
    },
    handler: async (req) => {
      const ssoSettings = await server.services.org.getOrgSsoSettings(req.permission);
      return { ssoSettings };
    }
  });

  server.route({
    method: "PATCH",
    url: "/sso-settings",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "updateOrganizationSsoSettings",
      tags: [ApiDocsTags.SsoSettings],
      description: "Update the organization's SSO enforcement settings.",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z
        .object({
          authEnforced: z.boolean().describe(ORG_SSO_SETTINGS.authEnforced),
          googleSsoAuthEnforced: z.boolean().describe(ORG_SSO_SETTINGS.googleSsoAuthEnforced),
          bypassOrgAuthEnabled: z.boolean().describe(ORG_SSO_SETTINGS.bypassOrgAuthEnabled),
          ssoMfaTrust: z.nativeEnum(SsoMfaTrust).describe(ORG_SSO_SETTINGS.ssoMfaTrust)
        })
        .partial()
        .refine((body) => Object.values(body).some((value) => value !== undefined), {
          message: "Provide at least one SSO setting to update"
        }),
      response: {
        200: SsoSettingsResponseSchema
      }
    },
    handler: async (req) => {
      const ssoSettings = await server.services.org.updateOrgSsoSettings({
        actor: req.permission,
        data: req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.UPDATE_ORG_SSO_SETTINGS,
          metadata: req.body
        }
      });

      return { ssoSettings };
    }
  });
};
