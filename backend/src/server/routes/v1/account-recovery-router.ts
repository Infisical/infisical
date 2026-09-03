import { z } from "zod";

import { normalizeEmail } from "@app/lib/validator";
import { authRateLimit, smtpRateLimit } from "@app/server/config/rateLimiter";
import { UserEncryption } from "@app/services/user/user-types";

import { SanitizedUserSchema } from "../sanitizedSchemas";

export const registerAccountRecoveryRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/send-email",
    config: {
      rateLimit: smtpRateLimit({
        keyGenerator: (req) => {
          const email = (req.body as { email?: string })?.email;
          return email ? normalizeEmail(email).substring(0, 100) : req.realIp;
        }
      })
    },
    schema: {
      operationId: "sendAccountRecoveryEmail",
      body: z.object({
        email: z.string().trim().email().max(255),
        captchaToken: z.string().trim().max(5000).optional()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    handler: async (req) => {
      await server.services.accountRecovery.sendRecoveryEmail({
        email: req.body.email,
        ip: req.realIp,
        captchaToken: req.body.captchaToken
      });

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
        keyGenerator: (req) => {
          const email = (req.body as { email?: string })?.email;
          return email ? normalizeEmail(email).substring(0, 100) : req.realIp;
        }
      })
    },
    schema: {
      operationId: "verifyAccountRecoveryEmail",
      body: z.object({
        email: z.string().trim().email().max(255),
        code: z.string().trim().min(1).max(100)
      }),
      response: {
        200: z.object({
          user: SanitizedUserSchema,
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
