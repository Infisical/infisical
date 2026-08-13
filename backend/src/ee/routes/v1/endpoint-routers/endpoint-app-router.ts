import { z } from "zod";

import { SanitizedEndpointDeviceAppSchema } from "@app/ee/services/endpoint/endpoint-schemas";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerEndpointAppRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "List the applications installed on an Infisical Endpoint device",
      querystring: z.object({
        deviceId: z.string().uuid().describe("The device whose installed applications to return.")
      }),
      response: {
        200: z.object({
          apps: SanitizedEndpointDeviceAppSchema.array(),
          // Null until the device's agent has sent its first inventory. An empty list with no report
          // time means "never asked", not "nothing installed".
          reportedAt: z.date().nullable()
        })
      }
    },
    handler: async (req) => {
      return server.services.endpoint.listDeviceApps(req.query, req.permission);
    }
  });
};
