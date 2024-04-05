import { z } from "zod";

import { SecretsSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretBlindIndexRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId/secrets/blind-index-status",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.boolean()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const count = await server.services.secretBlindIndex.getSecretBlindIndexStatus({
        projectId: req.params.projectId,
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });
      return count === 0;
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/secrets",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          secrets: SecretsSchema.omit({ secretBlindIndex: true })
            .merge(
              z.object({
                environment: z.string(),
                workspace: z.string()
              })
            )
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const secrets = await server.services.secretBlindIndex.getProjectSecrets({
        projectId: req.params.projectId,
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });
      return { secrets };
    }
  });

  server.route({
    method: "POST",
    url: "/:projectId/secrets/names",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      body: z.object({
        secretsToUpdate: z
          .object({
            secretName: z.string().trim(),
            secretId: z.string().trim()
          })
          .array()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.secretBlindIndex.updateProjectSecretName({
        projectId: req.params.projectId,
        secretsToUpdate: req.body.secretsToUpdate,
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });
      return { message: "Successfully named workspace secrets" };
    }
  });
};
