import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { authRateLimit, smtpRateLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

export const registerPasswordRouter = async (server: FastifyZodProvider) => {
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
        path: "/api",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });

      return { message: "Successfully setup password" };
    }
  });
};
