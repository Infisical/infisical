import { z } from "zod";

import { BackupPrivateKeySchema, UsersSchema } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { authRateLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { validateSignUpAuthorization } from "@app/services/auth/auth-fns";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPasswordRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/srp1",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        clientPublicKey: z.string().trim()
      }),
      response: {
        200: z.object({
          serverPublicKey: z.string(),
          salt: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { salt, serverPublicKey } = await server.services.password.generateServerPubKey(
        req.permission.id,
        req.body.clientPublicKey
      );
      return { salt, serverPublicKey };
    }
  });

  server.route({
    method: "POST",
    url: "/change-password",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        clientProof: z.string().trim(),
        protectedKey: z.string().trim(),
        protectedKeyIV: z.string().trim(),
        protectedKeyTag: z.string().trim(),
        encryptedPrivateKey: z.string().trim(),
        encryptedPrivateKeyIV: z.string().trim(),
        encryptedPrivateKeyTag: z.string().trim(),
        salt: z.string().trim(),
        verifier: z.string().trim(),
        password: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, res) => {
      const appCfg = getConfig();
      await server.services.password.changePassword({ ...req.body, userId: req.permission.id });

      void res.cookie("jid", appCfg.COOKIE_SECRET_SIGN_KEY, {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });
      return { message: "Successfully changed password" };
    }
  });

  server.route({
    method: "POST",
    url: "/email/password-reset",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        email: z.string().email().trim()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    handler: async (req) => {
      await server.services.password.sendPasswordResetEmail(req.body.email);

      return {
        message: "If an account exists with this email, a password reset link has been sent"
      };
    }
  });

  server.route({
    method: "POST",
    url: "/email/password-reset-verify",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        email: z.string().email().trim(),
        code: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string(),
          user: UsersSchema,
          token: z.string()
        })
      }
    },
    handler: async (req) => {
      const { token, user } = await server.services.password.verifyPasswordResetEmail(req.body.email, req.body.code);

      return {
        message: "Successfully verified email",
        user,
        token
      };
    }
  });

  server.route({
    method: "POST",
    url: "/backup-private-key",
    config: {
      rateLimit: authRateLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        clientProof: z.string().trim(),
        encryptedPrivateKey: z.string().trim(),
        iv: z.string().trim(),
        tag: z.string().trim(),
        salt: z.string().trim(),
        verifier: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string(),
          backupPrivateKey: BackupPrivateKeySchema.omit({ verifier: true })
        })
      }
    },
    handler: async (req) => {
      const token = validateSignUpAuthorization(req.headers.authorization as string, "", false)!;
      const backupPrivateKey = await server.services.password.createBackupPrivateKey({
        ...req.body,
        userId: token.userId
      });
      if (!backupPrivateKey) throw new Error("Failed to create backup key");

      return { message: "Successfully updated backup private key", backupPrivateKey };
    }
  });

  server.route({
    method: "GET",
    url: "/backup-private-key",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      response: {
        200: z.object({
          message: z.string(),
          backupPrivateKey: BackupPrivateKeySchema.omit({ verifier: true })
        })
      }
    },
    handler: async (req) => {
      const token = validateSignUpAuthorization(req.headers.authorization as string, "", false)!;
      const backupPrivateKey = await server.services.password.getBackupPrivateKeyOfUser(token.userId);
      if (!backupPrivateKey) throw new Error("Failed to find backup key");

      return { message: "Successfully fetched backup private key", backupPrivateKey };
    }
  });

  server.route({
    method: "POST",
    url: "/password-reset",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        protectedKey: z.string().trim(),
        protectedKeyIV: z.string().trim(),
        protectedKeyTag: z.string().trim(),
        encryptedPrivateKey: z.string().trim(),
        encryptedPrivateKeyIV: z.string().trim(),
        encryptedPrivateKeyTag: z.string().trim(),
        salt: z.string().trim(),
        verifier: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    handler: async (req) => {
      const token = validateSignUpAuthorization(req.headers.authorization as string, "", false)!;
      await server.services.password.resetPasswordByBackupKey({
        ...req.body,
        userId: token.userId
      });

      return { message: "Successfully updated backup private key" };
    }
  });
};
