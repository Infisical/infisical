import { z } from "zod";

import { UsersSchema } from "@app/db/schemas";
import { authRateLimit, smtpRateLimit } from "@app/server/config/rateLimiter";
import { UserEncryption } from "@app/services/user/user-types";

export const registerAccountRecoveryRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/send-email",
    config: {
      rateLimit: smtpRateLimit({
        keyGenerator: (req) => (req.body as { email?: string })?.email?.trim().substring(0, 100) || req.realIp
      })
    },
    schema: {
      operationId: "sendAccountRecoveryEmail",
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
      await server.services.accountRecovery.sendRecoveryEmail(req.body.email);

      return {
        message: "If an account exists with this email, a recovery link has been sent"
      };
    }
  });

  server.route({
    method: "POST",
    url: "/verify-email",
    config: {
      rateLimit: smtpRateLimit({
        keyGenerator: (req) => (req.body as { email?: string })?.email?.trim().substring(0, 100) || req.realIp
      })
    },
    schema: {
      operationId: "verifyAccountRecoveryEmail",
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
      const recoveryResult = await server.services.accountRecovery.verifyRecoveryEmail(req.body.email, req.body.code);

      return recoveryResult;
    }
  });

  server.route({
    method: "POST",
    url: "/enable-email-auth",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      headers: z.object({
        authorization: z.string()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      },
      operationId: "enableEmailAuthForUser"
    },
    handler: async (req) => {
      await server.services.accountRecovery.enableEmailAuthForUser(req.headers.authorization);
      return { message: "Email authentication enabled successfully" };
    }
  });
};
