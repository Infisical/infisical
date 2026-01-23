import { z } from "zod";

import { BackupPrivateKeySchema } from "@app/db/schemas/backup-private-key";
import { UsersSchema } from "@app/db/schemas/users";
import { getConfig } from "@app/lib/config/env";
import { authRateLimit, smtpRateLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { validateSignUpAuthorization } from "@app/services/auth/auth-fns";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { UserEncryption } from "@app/services/user/user-types";

export const registerPasswordRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/email/password-reset",
    config: {
      rateLimit: smtpRateLimit({
        keyGenerator: (req) => (req.body as { email?: string })?.email?.trim().substring(0, 100) || req.realIp
      })
    },
    schema: {
      operationId: "sendPasswordResetEmail",
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
      rateLimit: smtpRateLimit({
        keyGenerator: (req) => (req.body as { email?: string })?.email?.trim().substring(0, 100) || req.realIp
      })
    },
    schema: {
      operationId: "verifyPasswordResetEmail",
      body: z.object({
        email: z.string().email().trim(),
        code: z.string().trim()
      }),
      response: {
        200: z.object({
          user: UsersSchema,
          token: z.string(),
          userEncryptionVersion: z.nativeEnum(UserEncryption)
        })
      }
    },
    handler: async (req) => {
      const passwordReset = await server.services.password.verifyPasswordResetEmail(req.body.email, req.body.code);

      return passwordReset;
    }
  });

  server.route({
    method: "GET",
    url: "/backup-private-key",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      operationId: "getBackupPrivateKey",
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
      operationId: "resetPasswordByBackupKey",
      body: z.object({
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
    handler: async (req) => {
      const token = validateSignUpAuthorization(req.headers.authorization as string, "", false)!;
      await server.services.password.resetPasswordByBackupKey({
        ...req.body,
        userId: token.userId
      });

      return { message: "Successfully reset password" };
    }
  });

  server.route({
    method: "POST",
    url: "/email/password-setup",
    config: {
      rateLimit: smtpRateLimit({
        keyGenerator: (req) => (req.auth.actor === ActorType.USER ? req.auth.userId : req.realIp)
      })
    },
    schema: {
      operationId: "sendPasswordSetupEmail",
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.password.sendPasswordSetupEmail(req.permission);

      return {
        message: "A password setup link has been sent"
      };
    }
  });

  server.route({
    method: "POST",
    url: "/password-setup",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      operationId: "setupPassword",
      body: z.object({
        password: z.string().trim(),
        token: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, res) => {
      await server.services.password.setupPassword(req.body, req.permission);

      const appCfg = getConfig();
      void res.cookie("jid", "", {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });

      return { message: "Successfully setup password" };
    }
  });
};
