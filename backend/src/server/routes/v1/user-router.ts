import { z } from "zod";

import { UserEncryptionKeysSchema, UsersSchema } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { authRateLimit, readLimit, writeLimit } from "@app/server/config/rateLimiter";
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
    handler: async (req) => server.services.user.getUserProjectFavorites(req.permission.id, req.query.orgId)
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
    handler: async (req) =>
      server.services.user.updateUserProjectFavorites(req.permission.id, req.body.orgId, req.body.projectFavorites)
  });

  server.route({
    method: "GET",
    url: "/me/:username/groups",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        username: z.string().trim()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string(),
            slug: z.string(),
            orgId: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const groupMemberships = await server.services.user.listUserGroups({
        username: req.params.username,
        actorOrgId: req.permission.orgId,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });

      return groupMemberships;
    }
  });

  server.route({
    method: "GET",
    url: "/me/totp",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          isVerified: z.boolean(),
          recoveryCodes: z.string().array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) =>
      server.services.totp.getUserTotpConfig({
        userId: req.permission.id
      })
  });

  server.route({
    method: "DELETE",
    url: "/me/totp",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) =>
      server.services.totp.deleteUserTotpConfig({
        userId: req.permission.id
      })
  });

  server.route({
    method: "POST",
    url: "/me/totp/register",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      response: {
        200: z.object({
          otpUrl: z.string(),
          recoveryCodes: z.string().array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT], {
      requireOrg: false
    }),
    handler: async (req) =>
      server.services.totp.registerUserTotp({
        userId: req.permission.id
      })
  });

  server.route({
    method: "POST",
    url: "/me/totp/verify",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        totp: z.string()
      }),
      response: {
        200: z.object({})
      }
    },
    onRequest: verifyAuth([AuthMode.JWT], {
      requireOrg: false
    }),
    handler: async (req) =>
      server.services.totp.verifyUserTotpConfig({
        userId: req.permission.id,
        totp: req.body.totp
      })
  });

  server.route({
    method: "POST",
    url: "/me/totp/recovery-codes",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) =>
      server.services.totp.createUserTotpRecoveryCodes({
        userId: req.permission.id
      })
  });
};
