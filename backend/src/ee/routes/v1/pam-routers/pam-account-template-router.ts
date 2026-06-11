import z from "zod";

import { PamAccountTemplatesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamAccountType } from "@app/ee/services/pam/pam-enums";
import {
  PamTemplateAccessPolicySchema,
  PamTemplateSettingsSchema
} from "@app/ee/services/pam-account-template/pam-account-template-schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const SanitizedTemplateSchema = PamAccountTemplatesSchema.pick({
  id: true,
  projectId: true,
  name: true,
  description: true,
  type: true,
  accessPolicy: true,
  settings: true,
  gatewayId: true,
  gatewayPoolId: true,
  recordingConnectionId: true,
  createdAt: true,
  updatedAt: true
});

export const registerPamAccountTemplateRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    schema: {
      operationId: "listPamAccountTemplates",
      querystring: z.object({
        search: z.string().optional(),
        type: z.nativeEnum(PamAccountType).optional()
      }),
      response: {
        200: z.array(SanitizedTemplateSchema)
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.pamAccountTemplate.list({
        projectId: req.internalPamProjectId,
        search: req.query.search,
        type: req.query.type,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
    }
  });

  server.route({
    method: "GET",
    url: "/:templateId",
    schema: {
      operationId: "getPamAccountTemplateById",
      params: z.object({
        templateId: z.string().uuid()
      }),
      response: {
        200: SanitizedTemplateSchema.extend({
          accountCount: z.number()
        })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.pamAccountTemplate.getById({
        templateId: req.params.templateId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
    }
  });

  server.route({
    method: "POST",
    url: "/",
    schema: {
      operationId: "createPamAccountTemplate",
      body: z.object({
        name: z.string().trim().min(1).max(64),
        description: z.string().trim().max(256).optional(),
        type: z.nativeEnum(PamAccountType),
        accessPolicy: PamTemplateAccessPolicySchema.optional(),
        settings: PamTemplateSettingsSchema.optional(),
        gatewayId: z.string().uuid().optional(),
        gatewayPoolId: z.string().uuid().optional(),
        recordingConnectionId: z.string().uuid().optional()
      }),
      response: {
        200: SanitizedTemplateSchema
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const template = await server.services.pamAccountTemplate.create({
        ...req.body,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.PAM_ACCOUNT_TEMPLATE_CREATE,
          metadata: {
            templateId: template.id,
            name: template.name,
            accountType: req.body.type
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamAccountTemplateCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            accountType: req.body.type,
            orgId: req.permission.orgId
          }
        })
        .catch(() => {});

      return template;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:templateId",
    schema: {
      operationId: "updatePamAccountTemplate",
      params: z.object({
        templateId: z.string().uuid()
      }),
      body: z.object({
        name: z.string().trim().min(1).max(64).optional(),
        description: z.string().trim().max(256).nullable().optional(),
        accessPolicy: PamTemplateAccessPolicySchema.optional(),
        settings: PamTemplateSettingsSchema.optional(),
        gatewayId: z.string().uuid().nullable().optional(),
        gatewayPoolId: z.string().uuid().nullable().optional(),
        recordingConnectionId: z.string().uuid().nullable().optional()
      }),
      response: {
        200: SanitizedTemplateSchema
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const template = await server.services.pamAccountTemplate.update({
        templateId: req.params.templateId,
        ...req.body,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.PAM_ACCOUNT_TEMPLATE_UPDATE,
          metadata: {
            templateId: template.id,
            name: req.body.name
          }
        }
      });

      return template;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:templateId",
    schema: {
      operationId: "deletePamAccountTemplate",
      params: z.object({
        templateId: z.string().uuid()
      }),
      response: {
        200: SanitizedTemplateSchema
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const template = await server.services.pamAccountTemplate.deleteTemplate({
        templateId: req.params.templateId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.PAM_ACCOUNT_TEMPLATE_DELETE,
          metadata: {
            templateId: template.id,
            name: template.name
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamAccountTemplateDeleted,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            accountType: template.type,
            orgId: req.permission.orgId
          }
        })
        .catch(() => {});

      return template;
    }
  });
};
