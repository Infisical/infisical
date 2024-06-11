import { z } from "zod";

import { UserEncryptionKeysSchema, UsersSchema } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { authRateLimit, readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerUserRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          user: UsersSchema.merge(
            UserEncryptionKeysSchema.pick({
              clientPublicKey: true,
              serverPrivateKey: true,
              encryptionVersion: true,
              protectedKey: true,
              protectedKeyIV: true,
              protectedKeyTag: true,
              publicKey: true,
              encryptedPrivateKey: true,
              iv: true,
              tag: true,
              salt: true,
              verifier: true,
              userId: true
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      const user = await server.services.user.getMe(req.permission.id);
      return { user };
    }
  });

  server.route({
    method: "GET",
    url: "/private-key",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          privateKey: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      const privateKey = await server.services.user.getUserPrivateKey(req.permission.id);
      return { privateKey };
    }
  });

  server.route({
    method: "GET",
    url: "/:userId/unlock",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      querystring: z.object({
        token: z.string().trim()
      }),
      params: z.object({
        userId: z.string()
      })
    },
    handler: async (req, res) => {
      try {
        await server.services.user.unlockUser(req.params.userId, req.query.token);
      } catch (err) {
        logger.error(`User unlock failed for ${req.params.userId}`);
        logger.error(err);
      }
      return res.redirect(`${appCfg.SITE_URL}/login`);
    }
  });
};
