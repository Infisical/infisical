import { z } from "zod";

import { SecretVersionsSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretVersionRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/:secretId/secret-versions",
    method: "GET",
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
          secretVersions: SecretVersionsSchema.omit({ secretBlindIndex: true }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const secretVersions = await server.services.secret.getSecretVersions({
        actor: req.permission.type,
        actorId: req.permission.id,
        limit: req.query.limit,
        offset: req.query.offset,
        secretId: req.params.secretId
      });
      return { secretVersions };
    }
  });
};
