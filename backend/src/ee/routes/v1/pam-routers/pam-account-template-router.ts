import z from "zod";

import { PamAccountTemplatesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamAccountType } from "@app/ee/services/pam/pam-enums";
import { PamTemplateSettingsInputSchema } from "@app/ee/services/pam-account-template/pam-account-template-schemas";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const SanitizedTemplateSchema = PamAccountTemplatesSchema.pick({
  id: true,
  name: true,
  description: true,
  type: true,
  policies: true,
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
      description: "List all PAM account templates",
      tags: [ApiDocsTags.PamAccountTemplates],
      querystring: z.object({
        search: z.string().optional().describe("Filter templates by name"),
        type: z.nativeEnum(PamAccountType).optional().describe("Filter by account type")
      }),
      response: {
        200: z.object({
          templates: z.array(SanitizedTemplateSchema.extend({ accountCount: z.number() }))
        })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const templates = await server.services.pamAccountTemplate.list({
        projectId: req.internalPamProjectId,
        search: req.query.search,
        type: req.query.type,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return { templates };
    }
  });

  server.route({
    method: "GET",
    url: "/:templateId",
    schema: {
      operationId: "getPamAccountTemplateById",
      description: "Get a PAM account template by ID",
      tags: [ApiDocsTags.PamAccountTemplates],
      params: z.object({
        templateId: z.string().uuid().describe("The ID of the template")
      }),
      response: {
        200: z.object({
          template: SanitizedTemplateSchema.extend({
            accountCount: z.number()
          })
        })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const template = await server.services.pamAccountTemplate.getById({
        templateId: req.params.templateId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return { template };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    schema: {
      operationId: "createPamAccountTemplate",
      description: "Create a new PAM account template",
      tags: [ApiDocsTags.PamAccountTemplates],
      body: z.object({
        name: slugSchema({ field: "Name" }).describe("Name for the template"),
        description: z.string().trim().max(256).optional().describe("Optional description"),
        type: z.nativeEnum(PamAccountType).describe("The account type this template applies to"),
        policies: z.record(z.unknown()).optional().describe("Policy values keyed by policy type"),
        settings: PamTemplateSettingsInputSchema.optional().describe("Template settings"),
        gatewayId: z.string().uuid().optional().describe("Default gateway ID for accounts using this template"),
        gatewayPoolId: z.string().uuid().optional().describe("Default gateway pool ID"),
        recordingConnectionId: z.string().uuid().optional().describe("Recording storage connection ID")
      }),
      response: {
        200: z.object({
          template: SanitizedTemplateSchema,
          corsProbeUrl: z.string().nullable().optional()
        })
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { corsProbeUrl, ...template } = await server.services.pamAccountTemplate.create({
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
        projectId: req.internalPamProjectId,
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

      return { template, corsProbeUrl };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:templateId",
    schema: {
      operationId: "updatePamAccountTemplate",
      description: "Update a PAM account template",
      tags: [ApiDocsTags.PamAccountTemplates],
      params: z.object({
        templateId: z.string().uuid().describe("The ID of the template")
      }),
      body: z.object({
        name: slugSchema({ field: "Name" }).optional().describe("New name"),
        description: z.string().trim().max(256).nullable().optional().describe("New description"),
        policies: z.record(z.unknown()).optional().describe("Policy values keyed by policy type"),
        settings: PamTemplateSettingsInputSchema.optional().describe("Updated settings"),
        gatewayId: z.string().uuid().nullable().optional().describe("New gateway ID"),
        gatewayPoolId: z.string().uuid().nullable().optional().describe("New gateway pool ID"),
        recordingConnectionId: z.string().uuid().nullable().optional().describe("New recording connection ID")
      }),
      response: {
        200: z.object({
          template: SanitizedTemplateSchema,
          corsProbeUrl: z.string().nullable().optional()
        })
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { corsProbeUrl, ...template } = await server.services.pamAccountTemplate.update({
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
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_ACCOUNT_TEMPLATE_UPDATE,
          metadata: {
            templateId: template.id,
            name: req.body.name
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamAccountTemplateUpdated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            accountType: template.type,
            orgId: req.permission.orgId
          }
        })
        .catch(() => {});

      return { template, corsProbeUrl };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:templateId",
    schema: {
      operationId: "deletePamAccountTemplate",
      description: "Delete a PAM account template",
      tags: [ApiDocsTags.PamAccountTemplates],
      params: z.object({
        templateId: z.string().uuid().describe("The ID of the template")
      }),
      response: {
        200: z.object({ template: SanitizedTemplateSchema })
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
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
        projectId: req.internalPamProjectId,
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

      return { template };
    }
  });
};
