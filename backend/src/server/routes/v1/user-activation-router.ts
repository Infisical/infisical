import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerUserActivationRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/secrets",
    method: "POST",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "checkSecretsActivation",
      response: {
        200: z.object({
          shouldShowActivation: z.boolean(),
          stage: z.enum(["FIRST_SECRET", "THREE_DAYS", "SEVEN_DAYS"]).nullable(),
          activation: z
            .object({
              firstSecretCreatedAt: z.date().nullable(),
              returnedAfterThreeDaysAt: z.date().nullable(),
              returnedAfterSevenDaysAt: z.date().nullable()
            })
            .nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.userActivation.getSecretsActivationStatus({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
    }
  });
};
