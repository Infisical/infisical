import { z } from "zod";

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
      body: z.object({
        oldPassword: z.string().trim(),
        newPassword: z.string().trim()
      })
    },
    config: {
      rateLimit: authRateLimit
    },
    onRequest: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      await server.services.password.resetPasswordV2({
        type: ResetPasswordV2Type.LoggedInReset,
        userId: req.permission.id,
        newPassword: req.body.newPassword,
        oldPassword: req.body.oldPassword
      });
    }
  });
};
