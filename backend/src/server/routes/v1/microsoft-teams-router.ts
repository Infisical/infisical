import { z } from "zod";

import { MicrosoftTeamsIntegrationsSchema } from "@app/db/schemas/microsoft-teams-integrations";
import { WorkflowIntegrationsSchema } from "@app/db/schemas/workflow-integrations";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { WorkflowIntegrationStatus } from "@app/services/workflow-integration/workflow-integration-types";

const sanitizedMicrosoftTeamsIntegrationSchema = WorkflowIntegrationsSchema.pick({
  id: true,
  description: true,
  slug: true,
  integration: true
}).merge(
  MicrosoftTeamsIntegrationsSchema.pick({
    tenantId: true
  }).extend({
    status: z.nativeEnum(WorkflowIntegrationStatus)
  })
);

export const registerMicrosoftTeamsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/client-id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getMicrosoftTeamsClientId",
      response: {
        200: z.object({
          clientId: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const clientId = await server.services.microsoftTeams.getClientId({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return {
        clientId
      };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "completeMicrosoftTeamsIntegration",
      body: z.object({
        redirectUri: z.string(),
        tenantId: z.string().uuid(),
        slug: z.string(),
        description: z.string().optional(),
        code: z.string().trim()
      })
    },

    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.microsoftTeams.completeMicrosoftTeamsIntegration({
        tenantId: req.body.tenantId,
        slug: req.body.slug,
        description: req.body.description,
        redirectUri: req.body.redirectUri,
        code: req.body.code,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_CREATE,
          metadata: {
            tenantId: req.body.tenantId,
            slug: req.body.slug,
            description: req.body.description
          }
        }
      });
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listMicrosoftTeamsIntegrations",
      security: [
        {
          bearerAuth: []
        }
      ],
      response: {
        200: sanitizedMicrosoftTeamsIntegrationSchema.array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const microsoftTeamsIntegrations = await server.services.microsoftTeams.getMicrosoftTeamsIntegrationsByOrg({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_LIST,
          metadata: {}
        }
      });

      return microsoftTeamsIntegrations;
    }
  });

  server.route({
    method: "POST",
    url: "/:id/installation-status",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "checkMicrosoftTeamsInstallationStatus",
      params: z.object({
        id: z.string()
      })
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const microsoftTeamsIntegration = await server.services.microsoftTeams.checkInstallationStatus({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        workflowIntegrationId: req.params.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_CHECK_INSTALLATION_STATUS,
          metadata: {
            tenantId: microsoftTeamsIntegration.tenantId,
            slug: microsoftTeamsIntegration.slug
          }
        }
      });
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deleteMicrosoftTeamsIntegration",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        id: z.string()
      }),
      response: {
        200: sanitizedMicrosoftTeamsIntegrationSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const deletedMicrosoftTeamsIntegration = await server.services.microsoftTeams.deleteMicrosoftTeamsIntegration({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_DELETE,
          metadata: {
            tenantId: deletedMicrosoftTeamsIntegration.tenantId,
            slug: deletedMicrosoftTeamsIntegration.slug,
            id: deletedMicrosoftTeamsIntegration.id
          }
        }
      });

      return deletedMicrosoftTeamsIntegration;
    }
  });

  server.route({
    method: "GET",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getMicrosoftTeamsIntegration",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        id: z.string()
      }),
      response: {
        200: sanitizedMicrosoftTeamsIntegrationSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const microsoftTeamsIntegration = await server.services.microsoftTeams.getMicrosoftTeamsIntegrationById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_GET,
          metadata: {
            slug: microsoftTeamsIntegration.slug,
            id: microsoftTeamsIntegration.id,
            tenantId: microsoftTeamsIntegration.tenantId
          }
        }
      });

      return microsoftTeamsIntegration;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateMicrosoftTeamsIntegration",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        id: z.string()
      }),
      body: z.object({
        slug: slugSchema({ max: 64 }).optional(),
        description: z.string().optional()
      }),
      response: {
        200: sanitizedMicrosoftTeamsIntegrationSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const microsoftTeamsIntegration = await server.services.microsoftTeams.updateMicrosoftTeamsIntegration({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_UPDATE,
          metadata: {
            slug: microsoftTeamsIntegration.slug,
            id: microsoftTeamsIntegration.id,
            tenantId: microsoftTeamsIntegration.tenantId,
            newSlug: req.body.slug,
            newDescription: req.body.description
          }
        }
      });

      return microsoftTeamsIntegration;
    }
  });

  server.route({
    method: "GET",
    url: "/:workflowIntegrationId/teams",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listMicrosoftTeamsIntegrationTeams",
      params: z.object({
        workflowIntegrationId: z.string()
      }),
      response: {
        200: z
          .object({
            teamId: z.string(),
            teamName: z.string(),
            channels: z
              .object({
                channelName: z.string(),
                channelId: z.string()
              })
              .array()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const microsoftTeamsIntegration = await server.services.microsoftTeams.getTeams({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        workflowIntegrationId: req.params.workflowIntegrationId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.MICROSOFT_TEAMS_WORKFLOW_INTEGRATION_GET_TEAMS,
          metadata: {
            tenantId: microsoftTeamsIntegration.tenantId,
            slug: microsoftTeamsIntegration.slug,
            id: microsoftTeamsIntegration.id
          }
        }
      });

      return microsoftTeamsIntegration.teams;
    }
  });

  server.route({
    method: "POST",
    url: "/message-endpoint",
    schema: {
      operationId: "handleMicrosoftTeamsMessageEndpoint",
      body: z.any(),
      response: {
        200: z.any()
      }
    },
    handler: async (req, res) => {
      await server.services.microsoftTeams.handleMessageEndpoint(req, res);
    }
  });
};
