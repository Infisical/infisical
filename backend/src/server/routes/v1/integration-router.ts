import { z } from "zod";

import { IntegrationsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, INTEGRATION } from "@app/lib/api-docs";
import { ForbiddenRequestError } from "@app/lib/errors";
import { removeTrailingSlash, shake } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { IntegrationMetadataSchema } from "@app/services/integration/integration-schema";
import { Integrations } from "@app/services/integration-auth/integration-list";

import {} from "../sanitizedSchemas";

const NATIVE_INTEGRATION_DEPRECATION_MESSAGE =
  "We're moving Native Integrations to Secret Syncs. Check the documentation at https://infisical.com/docs/integrations/secret-syncs/overview. If the integration you need isn't available in the Secret Syncs, please get in touch with us at team@infisical.com.";

export const registerIntegrationRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Integrations],
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
    handler: async (_) => {
      throw new ForbiddenRequestError({
        message: NATIVE_INTEGRATION_DEPRECATION_MESSAGE
      });

      // We are keeping the old response commented out for an easy revert on the API if we need to before the full phase out.

      // const { integration, integrationAuth } = await server.services.integration.createIntegration({
      //   actorId: req.permission.id,
      //   actor: req.permission.type,
      //   actorAuthMethod: req.permission.authMethod,
      //   actorOrgId: req.permission.orgId,
      //   ...req.body
      // });

      // const createIntegrationEventProperty = shake({
      //   integrationId: integration.id.toString(),
      //   integration: integration.integration,
      //   environment: req.body.sourceEnvironment,
      //   secretPath: req.body.secretPath,
      //   url: integration.url,
      //   app: integration.app,
      //   appId: integration.appId,
      //   targetEnvironment: integration.targetEnvironment,
      //   targetEnvironmentId: integration.targetEnvironmentId,
      //   targetService: integration.targetService,
      //   targetServiceId: integration.targetServiceId,
      //   path: integration.path,
      //   region: integration.region
      // }) as TIntegrationCreatedEvent["properties"];

      // await server.services.auditLog.createAuditLog({
      //   ...req.auditLogInfo,
      //   projectId: integrationAuth.projectId,
      //   event: {
      //     type: EventType.CREATE_INTEGRATION,
      //     // eslint-disable-next-line
      //     metadata: createIntegrationEventProperty
      //   }
      // });

      // await server.services.telemetry.sendPostHogEvents({
      //   event: PostHogEventTypes.IntegrationCreated,
      //   organizationId: req.permission.orgId,
      //   distinctId: getTelemetryDistinctId(req),
      //   properties: {
      //     ...createIntegrationEventProperty,
      //     projectId: integrationAuth.projectId,
      //     ...req.auditLogInfo
      //   }
      // });
      // return { integration };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:integrationId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Integrations],
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
        isActive: z.boolean().optional().describe(INTEGRATION.UPDATE.isActive),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(INTEGRATION.UPDATE.secretPath),
        targetEnvironment: z.string().trim().optional().describe(INTEGRATION.UPDATE.targetEnvironment),
        owner: z.string().trim().optional().describe(INTEGRATION.UPDATE.owner),
        environment: z.string().trim().optional().describe(INTEGRATION.UPDATE.environment),
        path: z.string().trim().optional().describe(INTEGRATION.UPDATE.path),
        metadata: IntegrationMetadataSchema.optional(),
        region: z.string().trim().optional().describe(INTEGRATION.UPDATE.region)
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
      hide: false,
      tags: [ApiDocsTags.Integrations],
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

      if (integration.region) {
        integration.metadata = {
          ...(integration.metadata || {}),
          region: integration.region
        };
      }

      if (
        integration.integration === Integrations.AWS_SECRET_MANAGER ||
        integration.integration === Integrations.AWS_PARAMETER_STORE
      ) {
        const awsRoleDetails = await server.services.integration.getIntegrationAWSIamRole({
          actorId: req.permission.id,
          actor: req.permission.type,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          id: req.params.integrationId
        });

        if (awsRoleDetails) {
          integration.metadata = {
            ...(integration.metadata || {}),
            awsIamRole: awsRoleDetails.role
          };
        }
      }

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
      hide: false,
      tags: [ApiDocsTags.Integrations],
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
      hide: false,
      tags: [ApiDocsTags.Integrations],
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
