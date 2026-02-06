import { z } from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode, MfaMethod } from "@app/services/auth/auth-type";
import { MfaSessionStatus } from "@app/services/mfa-session/mfa-session-types";

export const registerMfaSessionRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:mfaSessionId/verify",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "verifyMfaSession",
      description: "Verify MFA session",
      params: z.object({
        mfaSessionId: z.string().trim()
      }),
      body: z.object({
        mfaToken: z.string().trim(),
        mfaMethod: z.nativeEnum(MfaMethod)
      }),
      response: {
        200: z.object({
          success: z.boolean(),
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.mfaSession.verifyMfaSession({
        mfaSessionId: req.params.mfaSessionId,
        userId: req.permission.id,
        mfaToken: req.body.mfaToken,
        mfaMethod: req.body.mfaMethod
      });

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/:mfaSessionId/status",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getMfaSessionStatus",
      description: "Get MFA session status",
      params: z.object({
        mfaSessionId: z.string().trim()
      }),
      response: {
        200: z.object({
          status: z.nativeEnum(MfaSessionStatus),
          mfaMethod: z.nativeEnum(MfaMethod)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.mfaSession.getMfaSessionStatus({
        mfaSessionId: req.params.mfaSessionId,
        userId: req.permission.id
      });

      return result;
    }
  });
};
