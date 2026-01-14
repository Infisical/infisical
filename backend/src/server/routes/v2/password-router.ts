import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { authRateLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { validatePasswordResetAuthorization } from "@app/services/auth/auth-fns";
import { ResetPasswordV2Type } from "@app/services/auth/auth-password-type";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPasswordRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/password-reset",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      operationId: "resetPassword",
      body: z.object({
        newPassword: z.string().trim()
      })
    },
    handler: async (req) => {
      const token = validatePasswordResetAuthorization(req.headers.authorization);
      await server.services.password.resetPasswordV2({
        type: ResetPasswordV2Type.Recovery,
        newPassword: req.body.newPassword,
        userId: token.userId
      });
    }
  });

  server.route({
    method: "POST",
    url: "/user/password-reset",
    schema: {
      operationId: "resetUserPassword",
      body: z.object({
        oldPassword: z.string().trim(),
        newPassword: z.string().trim()
      })
    },
    config: {
      rateLimit: authRateLimit
    },
    onRequest: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req, res) => {
      const appCfg = getConfig();

      await server.services.password.resetPasswordV2({
        type: ResetPasswordV2Type.LoggedInReset,
        userId: req.permission.id,
        newPassword: req.body.newPassword,
        oldPassword: req.body.oldPassword
      });

      void res.cookie("jid", "", {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });

      void res.cookie("infisical-project-assume-privileges", "", {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED,
        maxAge: 0
      });

      void res.cookie("aod", "", {
        httpOnly: false,
        path: "/",
        sameSite: "lax",
        secure: appCfg.HTTPS_ENABLED,
        maxAge: 0
      });
    }
  });
};
