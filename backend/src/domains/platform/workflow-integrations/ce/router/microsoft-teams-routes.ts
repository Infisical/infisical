import { z } from "zod";

import { MicrosoftTeamsIntegrationsSchema, WorkflowIntegrationsSchema } from "@app/db/schemas";
import { AuthMode } from "@app/lib/auth/actor-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";

import { WorkflowIntegrationStatus } from "../models/enums";
import { WorkflowIntegrationAuditEvent } from "./audit";
import { toMicrosoftTeamsIntegrationResponse } from "./responses";
import { TWorkflowIntegrationsRouterDeps } from "./types";

// The Bot Framework adapter wants a plain object body.
const requestBodyToRecord = (body: unknown): Record<string, unknown> =>
  body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

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

export const registerMicrosoftTeamsRoutes = async (
  server: FastifyZodProvider,
  {
    microsoftTeamsIntegrationService,
    auditLog
  }: Pick<TWorkflowIntegrationsRouterDeps, "microsoftTeamsIntegrationService" | "auditLog">
) => {
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const clientId = await microsoftTeamsIntegrationService.getClientId({
        actor: req.actor
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
        redirectUri: z.string().trim().max(2048),
        tenantId: z.string().uuid(),
        slug: z.string().max(255),
        description: z.string().max(255).optional(),
        code: z.string().trim().max(4096)
      })
    },

    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await microsoftTeamsIntegrationService.complete({
        tenantId: req.body.tenantId,
        slug: req.body.slug,
        description: req.body.description,
        redirectUri: req.body.redirectUri,
        code: req.body.code,
        actor: req.actor
      });

      await auditLog.record(req, {
        type: WorkflowIntegrationAuditEvent.CreateMicrosoftTeamsIntegration,
        metadata: {
          tenantId: req.body.tenantId,
          slug: req.body.slug,
          description: req.body.description
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const microsoftTeamsIntegrations = (
        await microsoftTeamsIntegrationService.list({
          actor: req.actor
        })
      ).map(toMicrosoftTeamsIntegrationResponse);

      await auditLog.record(req, {
        type: WorkflowIntegrationAuditEvent.ListMicrosoftTeamsIntegrations,
        metadata: {}
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
        id: z.string().uuid()
      })
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const microsoftTeamsIntegration = toMicrosoftTeamsIntegrationResponse(
        await microsoftTeamsIntegrationService.checkInstallationStatus({
          actor: req.actor,
          id: req.params.id
        })
      );

      await auditLog.record(req, {
        type: WorkflowIntegrationAuditEvent.CheckMicrosoftTeamsInstallationStatus,
        metadata: {
          tenantId: microsoftTeamsIntegration.tenantId,
          slug: microsoftTeamsIntegration.slug
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
        id: z.string().uuid()
      }),
      response: {
        200: sanitizedMicrosoftTeamsIntegrationSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const deletedMicrosoftTeamsIntegration = toMicrosoftTeamsIntegrationResponse(
        await microsoftTeamsIntegrationService.delete({
          actor: req.actor,
          id: req.params.id
        })
      );

      await auditLog.record(req, {
        type: WorkflowIntegrationAuditEvent.DeleteMicrosoftTeamsIntegration,
        metadata: {
          tenantId: deletedMicrosoftTeamsIntegration.tenantId,
          slug: deletedMicrosoftTeamsIntegration.slug,
          id: deletedMicrosoftTeamsIntegration.id
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
        id: z.string().uuid()
      }),
      response: {
        200: sanitizedMicrosoftTeamsIntegrationSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const microsoftTeamsIntegration = toMicrosoftTeamsIntegrationResponse(
        await microsoftTeamsIntegrationService.getById({
          actor: req.actor,
          id: req.params.id
        })
      );

      await auditLog.record(req, {
        type: WorkflowIntegrationAuditEvent.GetMicrosoftTeamsIntegration,
        metadata: {
          slug: microsoftTeamsIntegration.slug,
          id: microsoftTeamsIntegration.id,
          tenantId: microsoftTeamsIntegration.tenantId
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
        id: z.string().uuid()
      }),
      body: z.object({
        slug: slugSchema({ max: 64 }).optional(),
        description: z.string().max(255).optional()
      }),
      response: {
        200: sanitizedMicrosoftTeamsIntegrationSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const microsoftTeamsIntegration = toMicrosoftTeamsIntegrationResponse(
        await microsoftTeamsIntegrationService.update({
          actor: req.actor,
          id: req.params.id,
          ...req.body
        })
      );

      await auditLog.record(req, {
        type: WorkflowIntegrationAuditEvent.UpdateMicrosoftTeamsIntegration,
        metadata: {
          slug: microsoftTeamsIntegration.slug,
          id: microsoftTeamsIntegration.id,
          tenantId: microsoftTeamsIntegration.tenantId,
          newSlug: req.body.slug,
          newDescription: req.body.description
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
        workflowIntegrationId: z.string().uuid()
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { integration, teams } = await microsoftTeamsIntegrationService.getTeams({
        actor: req.actor,
        id: req.params.workflowIntegrationId
      });
      const microsoftTeamsIntegration = { ...toMicrosoftTeamsIntegrationResponse(integration), teams };

      await auditLog.record(req, {
        type: WorkflowIntegrationAuditEvent.GetMicrosoftTeamsTeams,
        metadata: {
          tenantId: microsoftTeamsIntegration.tenantId,
          slug: microsoftTeamsIntegration.slug,
          id: microsoftTeamsIntegration.id
        }
      });

      return microsoftTeamsIntegration.teams;
    }
  });

  server.route({
    method: "POST",
    url: "/message-endpoint",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "handleMicrosoftTeamsMessageEndpoint",
      body: z.any(),
      response: {
        200: z.any()
      }
    },
    handler: async (req, res) => {
      await microsoftTeamsIntegrationService.handleBotMessage({
        body: requestBodyToRecord(req.body),
        headers: req.headers,
        method: req.method,
        response: res.raw
      });
    }
  });
};
