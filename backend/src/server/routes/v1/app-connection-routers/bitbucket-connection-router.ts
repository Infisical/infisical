import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  CreateBitBucketConnectionSchema,
  SanitizedBitBucketConnectionSchema,
  UpdateBitBucketConnectionSchema
} from "@app/services/app-connection/bitbucket";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerAppConnectionEndpoints } from "./app-connection-endpoints";

export const registerBitBucketConnectionRouter = async (server: FastifyZodProvider) => {
  registerAppConnectionEndpoints({
    app: AppConnection.BitBucket,
    server,
    sanitizedResponseSchema: SanitizedBitBucketConnectionSchema,
    createSchema: CreateBitBucketConnectionSchema,
    updateSchema: UpdateBitBucketConnectionSchema
  });

  // The below endpoints are not exposed and for Infisical App use

  server.route({
    method: "GET",
    url: `/:connectionId/repositories`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        connectionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          repositories: z.object({ id: z.string(), name: z.string() }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId } = req.params;

      const repositories = await server.services.appConnection.bitbucket.listRepositories(connectionId, req.permission);

      return { repositories };
    }
  });
};
