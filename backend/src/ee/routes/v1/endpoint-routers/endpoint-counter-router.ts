import { z } from "zod";

import { SanitizedEndpointCounterSchema } from "@app/ee/services/endpoint/endpoint-schemas";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerEndpointCounterRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "List how many bytes each Infisical Endpoint device has sent to a volume rule's destination",
      querystring: z.object({
        deviceId: z.string().uuid().optional().describe("Only return counters reported by this device.")
      }),
      response: {
        200: z.object({ counters: SanitizedEndpointCounterSchema.array() })
      }
    },
    handler: async (req) => {
      const counters = await server.services.endpoint.listCounters(req.query, req.permission);
      return { counters };
    }
  });
};
