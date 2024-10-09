import { z } from "zod";

import { IntegrationsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { INTEGRATION } from "@app/lib/api-docs";
import { removeTrailingSlash, shake } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { IntegrationMetadataSchema } from "@app/services/integration/integration-schema";
import { PostHogEventTypes, TIntegrationCreatedEvent } from "@app/services/telemetry/telemetry-types";

import {} from "../sanitizedSchemas";

export const registerIntegrationRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create an integration to sync secrets.",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        integrationAuthId: z.string().trim().describe(INTEGRATION.CREATE.integrationAuthId),
        app: z.string().trim().optional().describe(INTEGRATION.CREATE.app),
        isActive: z.boolean().describe(INTEGRATION.CREATE.isActive).default(true),
        appId: z.string().trim().optional().describe(INTEGRATION.CREATE.appId),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(INTEGRATION.CREATE.secretPath),
        sourceEnvironment: z.string().trim().describe(INTEGRATION.CREATE.sourceEnvironment),
        targetEnvironment: z.string().trim().optional().describe(INTEGRATION.CREATE.targetEnvironment),
        targetEnvironmentId: z.string().trim().optional().describe(INTEGRATION.CREATE.targetEnvironmentId),
        targetService: z.string().trim().optional().describe(INTEGRATION.CREATE.targetService),
        targetServiceId: z.string().trim().optional().describe(INTEGRATION.CREATE.targetServiceId),
        owner: z.string().trim().optional().describe(INTEGRATION.CREATE.owner),
        url: z.string().trim().optional().describe(INTEGRATION.CREATE.url),
        path: z.string().trim().optional().describe(INTEGRATION.CREATE.path),
        region: z.string().trim().optional().describe(INTEGRATION.CREATE.region),
        scope: z.string().trim().optional().describe(INTEGRATION.CREATE.scope),
        metadata: IntegrationMetadataSchema.default({})
      }),
      response: {
        200: z.object({
          integration: IntegrationsSchema.extend({
            environment: z.object({
              slug: z.string().trim(),
              name: z.string().trim(),
              id: z.string().trim()
            })
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { integration, integrationAuth } = await server.services.integration.createIntegration({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      const createIntegrationEventProperty = shake({
        integrationId: integration.id.toString(),
        integration: integration.integration,
        environment: req.body.sourceEnvironment,
        secretPath: req.body.secretPath,
        url: integration.url,
        app: integration.app,
        appId: integration.appId,
        targetEnvironment: integration.targetEnvironment,
        targetEnvironmentId: integration.targetEnvironmentId,
        targetService: integration.targetService,
        targetServiceId: integration.targetServiceId,
        path: integration.path,
        region: integration.region
      }) as TIntegrationCreatedEvent["properties"];

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: integrationAuth.projectId,
        event: {
          type: EventType.CREATE_INTEGRATION,
          // eslint-disable-next-line
          metadata: createIntegrationEventProperty
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.IntegrationCreated,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          ...createIntegrationEventProperty,
          projectId: integrationAuth.projectId,
          ...req.auditLogInfo
        }
      });
      return { integration };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:integrationId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Update an integration by integration id",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        integrationId: z.string().trim().describe(INTEGRATION.UPDATE.integrationId)
      }),
      body: z.object({
        app: z.string().trim().optional().describe(INTEGRATION.UPDATE.app),
        appId: z.string().trim().optional().describe(INTEGRATION.UPDATE.appId),
        isActive: z.boolean().describe(INTEGRATION.UPDATE.isActive),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(INTEGRATION.UPDATE.secretPath),
        targetEnvironment: z.string().trim().optional().describe(INTEGRATION.UPDATE.targetEnvironment),
        owner: z.string().trim().optional().describe(INTEGRATION.UPDATE.owner),
        environment: z.string().trim().optional().describe(INTEGRATION.UPDATE.environment),
        metadata: IntegrationMetadataSchema.optional()
      }),
      response: {
        200: z.object({
          integration: IntegrationsSchema.extend({
            environment: z.object({
              slug: z.string().trim(),
              name: z.string().trim(),
              id: z.string().trim()
            })
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const integration = await server.services.integration.updateIntegration({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationId,
        ...req.body
      });
      return { integration };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get an integration by integration id",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        integrationId: z.string().trim().describe(INTEGRATION.UPDATE.integrationId)
      }),
      response: {
        200: z.object({
          integration: IntegrationsSchema.extend({
            environment: z.object({
              slug: z.string().trim(),
              name: z.string().trim(),
              id: z.string().trim()
            })
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const integration = await server.services.integration.getIntegration({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationId
      });

      return { integration };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:integrationId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Remove an integration using the integration object ID",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        integrationId: z.string().trim().describe(INTEGRATION.DELETE.integrationId)
      }),
      querystring: z.object({
        shouldDeleteIntegrationSecrets: z
          .enum(["true", "false"])
          .optional()
          .transform((val) => val === "true")
      }),
      response: {
        200: z.object({
          integration: IntegrationsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const integration = await server.services.integration.deleteIntegration({
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationId,
        shouldDeleteIntegrationSecrets: req.query.shouldDeleteIntegrationSecrets
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: integration.projectId,
        event: {
          type: EventType.DELETE_INTEGRATION,
          // eslint-disable-next-line
          metadata: shake({
            integrationId: integration.id,
            integration: integration.integration,
            environment: integration.environment.slug,
            secretPath: integration.secretPath,
            url: integration.url,
            app: integration.app,
            appId: integration.appId,
            targetEnvironment: integration.targetEnvironment,
            targetEnvironmentId: integration.targetEnvironmentId,
            targetService: integration.targetService,
            targetServiceId: integration.targetServiceId,
            path: integration.path,
            region: integration.region,
            shouldDeleteIntegrationSecrets: req.query.shouldDeleteIntegrationSecrets
            // eslint-disable-next-line
          }) as any
        }
      });
      return { integration };
    }
  });

  server.route({
    method: "POST",
    url: "/:integrationId/sync",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Manually trigger sync of an integration by integration id",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        integrationId: z.string().trim().describe(INTEGRATION.SYNC.integrationId)
      }),
      response: {
        200: z.object({
          integration: IntegrationsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const integration = await server.services.integration.syncIntegration({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: integration.projectId,
        event: {
          type: EventType.MANUAL_SYNC_INTEGRATION,
          // eslint-disable-next-line
          metadata: shake({
            integrationId: integration.id,
            integration: integration.integration,
            environment: integration.environment.slug,
            secretPath: integration.secretPath,
            url: integration.url,
            app: integration.app,
            appId: integration.appId,
            targetEnvironment: integration.targetEnvironment,
            targetEnvironmentId: integration.targetEnvironmentId,
            targetService: integration.targetService,
            targetServiceId: integration.targetServiceId,
            path: integration.path,
            region: integration.region
            // eslint-disable-next-line
          }) as any
        }
      });

      return { integration };
    }
  });
};
