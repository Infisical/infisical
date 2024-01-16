import { z } from "zod";

import { BackupPrivateKeySchema } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPasswordRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/srp1",
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
        verifier: z.string().trim()
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

      res.cookie("jid", appCfg.COOKIE_SECRET_SIGN_KEY, {
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
    url: "/backup-private-key",
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
      const backupPrivateKey = await server.services.password.createBackupPrivateKey({
        ...req.body,
        userId: req.permission.id
      });
      if (!backupPrivateKey) throw new Error("Failed to create backup key");

      return { message: "Successfully updated backup private key", backupPrivateKey };
    }
  });

  server.route({
    method: "GET",
    url: "/backup-private-key",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      response: {
        200: z.object({
          message: z.string(),
          backupPrivateKey: BackupPrivateKeySchema.omit({ verifier: true })
        })
      }
    },
    handler: async (req) => {
      const backupPrivateKey = await server.services.password.getBackupPrivateKeyOfUser(
        req.permission.id
      );
      if (!backupPrivateKey) throw new Error("Failed to find backup key");

      return { message: "Successfully updated backup private key", backupPrivateKey };
    }
  });

  server.route({
    method: "POST",
    url: "/email/password-reset",
    onRequest: verifyAuth([AuthMode.JWT]),
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
      await server.services.password.resetPasswordByBackupKey({
        ...req.body,
        userId: req.permission.id
      });

      return { message: "Successfully updated backup private key" };
    }
  });
};
