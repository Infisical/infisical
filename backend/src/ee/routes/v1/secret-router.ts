import z from "zod";

import { ProjectPermissionSecretActions } from "@app/domains/platform/projects/ce/module";
import { RAW_SECRETS } from "@app/lib/api-docs";
import { AuthMode } from "@app/lib/auth/actor-types";
import { removeTrailingSlash } from "@app/lib/fn";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";

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
      operationId: "getSecretAccessList",
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
        actor: req.permission,
        secretPath,
        environment,
        projectId,
        secretName,
        includeAllEntities
      });
    }
  });
};
