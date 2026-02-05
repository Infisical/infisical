import z from "zod";

import { ProjectPermissionSecretActions } from "@app/ee/services/permission/project-permission";
import { RAW_SECRETS } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const AccessListEntrySchema = z
  .object({
    allowedActions: z.nativeEnum(ProjectPermissionSecretActions).array(),
    id: z.string(),
    name: z.string(),
    membershipId: z.string()
  })
  .array();

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
          .describe(RAW_SECRETS.GET_ACCESS_LIST.secretPath)
      }),
      response: {
        200: z.object({
          groups: AccessListEntrySchema,
          identities: AccessListEntrySchema,
          users: AccessListEntrySchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { secretName } = req.params;
      const { secretPath, environment, projectId } = req.query;

      return server.services.secret.getSecretAccessList({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        secretPath,
        environment,
        projectId,
        secretName
      });
    }
  });
};
