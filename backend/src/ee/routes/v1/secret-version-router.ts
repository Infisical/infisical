import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { secretRawSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretVersionRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:secretId/secret-versions",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        secretId: z.string()
      }),
      querystring: z.object({
        offset: z.coerce.number(),
        limit: z.coerce.number()
      }),
      response: {
        200: z.object({
          secretVersions: secretRawSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const secretVersions = await server.services.secret.getSecretVersions({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        limit: req.query.limit,
        offset: req.query.offset,
        secretId: req.params.secretId
      });
      return { secretVersions };
    }
  });
};
