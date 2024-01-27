import { z } from "zod";

import { IntegrationsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { shake } from "@app/lib/fn";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerIntegrationRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      body: z.object({
        integrationAuthId: z.string().trim(),
        app: z.string().trim().optional(),
        isActive: z.boolean(),
        appId: z.string().trim().optional(),
        secretPath: z.string().trim().default("/"),
        sourceEnvironment: z.string().trim(),
        targetEnvironment: z.string().trim().optional(),
        targetEnvironmentId: z.string().trim().optional(),
        targetService: z.string().trim().optional(),
        targetServiceId: z.string().trim().optional(),
        owner: z.string().trim().optional(),
        path: z.string().trim().optional(),
        region: z.string().trim().optional(),
        scope: z.string().trim().optional(),
        metadata: z
          .object({
            secretPrefix: z.string().optional(),
            secretSuffix: z.string().optional(),
            secretGCPLabel: z
              .object({
                labelName: z.string(),
                labelValue: z.string()
              })
              .optional()
          })
          .optional()
      }),
      response: {
        200: z.object({
          integration: IntegrationsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { integration, integrationAuth } = await server.services.integration.createIntegration({
        actorId: req.permission.id,
        actor: req.permission.type,
        ...req.body
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: integrationAuth.projectId,
        event: {
          type: EventType.CREATE_INTEGRATION,
          metadata: shake({
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
          }) as any
        }
      });
      return { integration };
    }
  });

  server.route({
    url: "/:integrationId",
    method: "PATCH",
    schema: {
      params: z.object({
        integrationId: z.string().trim()
      }),
      body: z.object({
        app: z.string().trim(),
        appId: z.string().trim(),
        isActive: z.boolean(),
        secretPath: z.string().trim().default("/"),
        targetEnvironment: z.string().trim(),
        owner: z.string().trim(),
        environment: z.string().trim()
      }),
      response: {
        200: z.object({
          integration: IntegrationsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const integration = await server.services.integration.updateIntegration({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationId,
        ...req.body
      });
      return { integration };
    }
  });

  server.route({
    url: "/:integrationId",
    method: "DELETE",
    schema: {
      params: z.object({
        integrationId: z.string().trim()
      }),
      response: {
        200: z.object({
          integration: IntegrationsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const integration = await server.services.integration.deleteIntegration({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: integration.projectId,
        event: {
          type: EventType.DELETE_INTEGRATION,
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
          }) as any
        }
      });
      return { integration };
    }
  });

  // TODO(akhilmhdh-pg): manual sync
};
