import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { TKmsKeyService } from "../service/kms-key-service";

export const registerKmsKeyRouter = async (
  server: FastifyZodProvider,
  { kmsKeyService }: { kmsKeyService: TKmsKeyService }
) => {
  server.route({
    method: "GET",
    url: "/org-key",
    config: { rateLimit: readLimit },
    schema: {
      hide: true,
      response: {
        200: z.object({
          kmsKey: z.object({
            id: z.string().uuid(),
            orgId: z.string().uuid(),
            name: z.string(),
            isDisabled: z.boolean()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const kmsKey = await kmsKeyService.getOrgKey(req.permission.orgId);
      return {
        kmsKey: {
          id: kmsKey.id,
          orgId: kmsKey.orgId,
          name: kmsKey.name,
          isDisabled: kmsKey.isDisabled
        }
      };
    }
  });
};
