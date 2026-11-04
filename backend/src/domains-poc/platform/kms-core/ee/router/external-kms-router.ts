import { z } from "zod";

import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { TExternalKmsService } from "../service/external-kms-service";

export const registerExternalKmsRouter = async (
  server: FastifyZodProvider,
  { externalKmsService }: { externalKmsService: TExternalKmsService }
) => {
  server.route({
    method: "PUT",
    url: "/org-key/external-kms",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      response: {
        200: z.object({
          externalKms: z.object({
            id: z.string().uuid(),
            kmsKeyId: z.string().uuid(),
            provider: z.string()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const externalKms = await externalKmsService.assignToOrgKey(req.permission.orgId);
      return {
        externalKms: { id: externalKms.id, kmsKeyId: externalKms.kmsKeyId, provider: externalKms.provider }
      };
    }
  });
};
