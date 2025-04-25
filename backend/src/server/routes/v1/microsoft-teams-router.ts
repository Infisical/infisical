import { z } from "zod";

import { MicrosoftTeamsIntegrationsSchema, WorkflowIntegrationsSchema } from "@app/db/schemas";
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
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        tenantId: z.string(),
        slug: z.string()
      }),
      response: {
        200: sanitizedMicrosoftTeamsIntegrationSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const microsoftTeamsIntegration = await server.services.microsoftTeams.createMicrosoftTeamsIntegration({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      return microsoftTeamsIntegration;
    }
  });
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
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
      params: z.object({
        id: z.string()
      })
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      await server.services.microsoftTeams.checkInstallationStatus({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        workflowIntegrationId: req.params.id
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
      const teams = await server.services.microsoftTeams.getTeams({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        workflowIntegrationId: req.params.workflowIntegrationId
      });

      return teams;
    }
  });

  server.route({
    method: "POST",
    url: "/message-endpoint",
    schema: {
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
