import z from "zod";

import { ProjectPermissionSecretActions } from "@app/ee/services/permission/project-permission";
import { RAW_SECRETS } from "@app/lib/api-docs";
import { prefixWithSlash, removeTrailingSlash } from "@app/lib/fn";
import { readLimit } from "@app/server/config/rateLimiter";
import { BaseSecretNameSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

const AccessListEntrySchema = z.object({
  allowedActions: z.nativeEnum(ProjectPermissionSecretActions).array(),
  id: z.string(),
  name: z.string(),
  membershipId: z.string()
});

export const registerSecretRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:secretName/access-list",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get list of users, machine identities, and groups with access to a secret",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: z.string().trim().describe(RAW_SECRETS.GET_ACCESS_LIST.secretName)
      }),
      querystring: z.object({
        projectId: z.string().trim().describe(RAW_SECRETS.GET_ACCESS_LIST.projectId),
        environment: z.string().trim().describe(RAW_SECRETS.GET_ACCESS_LIST.environment),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(RAW_SECRETS.GET_ACCESS_LIST.secretPath),
        includeAllEntities: z
          .enum(["true", "false"])
          .default("false")
          .transform((val) => val === "true")
          .describe(RAW_SECRETS.GET_ACCESS_LIST.includeAllEntities)
      }),
      response: {
        200: z.object({
          groups: AccessListEntrySchema.extend({
            userIds: z.string().array(),
            identityIds: z.string().array()
          }).array(),
          identities: AccessListEntrySchema.array(),
          users: AccessListEntrySchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { secretName } = req.params;
      const { secretPath, environment, projectId, includeAllEntities } = req.query;

      return server.services.secret.getSecretAccessList({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        secretPath,
        environment,
        projectId,
        secretName,
        includeAllEntities
      });
    }
  });

  server.route({
    method: "GET",
    url: "/:secretName/read-activity",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getSecretReadActivity",
      description: "Get which users and machine identities have recently read a secret",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: BaseSecretNameSchema.max(500).describe(RAW_SECRETS.GET_READ_ACTIVITY.secretName)
      }),
      querystring: z.object({
        projectId: z.string().trim().max(36).describe(RAW_SECRETS.GET_READ_ACTIVITY.projectId),
        environment: z.string().trim().min(1).max(255).describe(RAW_SECRETS.GET_READ_ACTIVITY.environment),
        secretPath: z
          .string()
          .trim()
          .max(1024)
          .default("/")
          .transform(prefixWithSlash)
          .transform(removeTrailingSlash)
          .describe(RAW_SECRETS.GET_READ_ACTIVITY.secretPath)
      }),
      response: {
        200: z.object({
          readActivity: z.object({
            trackedSince: z.date().describe(RAW_SECRETS.GET_READ_ACTIVITY.trackedSince),
            reads: z
              .object({
                actorType: z
                  .enum([ActorType.USER, ActorType.IDENTITY])
                  .describe(RAW_SECRETS.GET_READ_ACTIVITY.actorType),
                actorId: z.string().describe(RAW_SECRETS.GET_READ_ACTIVITY.actorId),
                lastReadAt: z.date().describe(RAW_SECRETS.GET_READ_ACTIVITY.lastReadAt)
              })
              .array()
              .describe(RAW_SECRETS.GET_READ_ACTIVITY.reads)
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const readActivity = await server.services.secretReadActivity.getSecretReadActivity(
        { ...req.query, secretName: req.params.secretName },
        req.permission
      );
      return { readActivity };
    }
  });
};
