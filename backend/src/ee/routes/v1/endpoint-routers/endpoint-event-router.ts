import { z } from "zod";

import {
  ENDPOINT_EVENT_PAGE_SIZE_DEFAULT,
  ENDPOINT_EVENT_PAGE_SIZE_MAX
} from "@app/ee/services/endpoint/endpoint-constants";
import { SanitizedEndpointEventSchema } from "@app/ee/services/endpoint/endpoint-schemas";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerEndpointEventRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "List what Infisical Endpoint devices in this organization have reported, newest first",
      querystring: z.object({
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(ENDPOINT_EVENT_PAGE_SIZE_MAX)
          .default(ENDPOINT_EVENT_PAGE_SIZE_DEFAULT)
          .describe("How many events to return."),
        cursor: z
          .string()
          .max(256)
          .optional()
          .describe("The 'nextCursor' from a previous response. Omit to start from the newest event.")
      }),
      response: {
        200: z.object({
          events: SanitizedEndpointEventSchema.array(),
          nextCursor: z.string().nullable().describe("Pass as 'cursor' to fetch the next page. Null on the last page.")
        })
      }
    },
    handler: async (req) => {
      return server.services.endpoint.listEvents(req.query, req.permission);
    }
  });
};
