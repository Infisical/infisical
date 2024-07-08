import { z } from "zod";

import { UserEncryptionKeysSchema, UsersSchema } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { authRateLimit, readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifySuperAdmin } from "@app/server/plugins/auth/superAdmin";
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

  server.route({
    method: "GET",
    url: "/list",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          users: UsersSchema.pick({
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            id: true
          }).array()
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async () => {
      const users = await server.services.user.listUsers();

      return {
        users
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:userId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        userId: z.string()
      }),
      response: {
        200: z.object({
          users: UsersSchema.pick({
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            id: true
          })
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const users = await server.services.user.deleteUser(req.params.userId);

      return {
        users
      };
    }
  });

  server.route({
    method: "GET",
    url: "/me/project-favorites",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        orgId: z.string().trim()
      }),
      response: {
        200: z.object({
          projectFavorites: z.string().array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.user.getUserProjectFavorites(req.permission.id, req.query.orgId);
    }
  });

  server.route({
    method: "PUT",
    url: "/me/project-favorites",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        orgId: z.string().trim(),
        projectFavorites: z.string().array()
      })
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.user.updateUserProjectFavorites(
        req.permission.id,
        req.body.orgId,
        req.body.projectFavorites
      );
    }
  });
};
