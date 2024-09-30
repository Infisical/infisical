import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerExternalMigrationRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/env-key",
    config: {
      rateLimit: readLimit
    },
    schema: {
      body: z.object({
        decryptionKey: z.string().trim().min(1),
        encryptedJson: z.object({
          nonce: z.string().trim().min(1),
          data: z.string().trim().min(1)
        })
      })
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      await server.services.migration.importEnvKeyData({
        decryptionKey: req.body.decryptionKey,
        encryptedJson: req.body.encryptedJson,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
    }
  });
};
