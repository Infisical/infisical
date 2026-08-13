import { z } from "zod";

import {
  ENDPOINT_TRANSFER_HISTORY_DEFAULT_LOOKBACK_HOURS,
  ENDPOINT_TRANSFER_HISTORY_MAX_LOOKBACK_HOURS,
  ENDPOINT_TRANSFER_HISTORY_PAGE_SIZE_DEFAULT,
  ENDPOINT_TRANSFER_HISTORY_PAGE_SIZE_MAX
} from "@app/ee/services/endpoint/endpoint-constants";
import { SanitizedEndpointTransferSchema } from "@app/ee/services/endpoint/endpoint-schemas";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerEndpointTransferRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.Endpoint],
      description: "List the destinations Infisical Endpoint devices have sent data to over a trailing range",
      querystring: z.object({
        deviceId: z.string().uuid().optional().describe("Only return what this device sent."),
        lookbackHours: z.coerce
          .number()
          .int()
          .min(1)
          .max(ENDPOINT_TRANSFER_HISTORY_MAX_LOOKBACK_HOURS)
          .default(ENDPOINT_TRANSFER_HISTORY_DEFAULT_LOOKBACK_HOURS)
          .describe("How far back to look, in hours."),
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(ENDPOINT_TRANSFER_HISTORY_PAGE_SIZE_MAX)
          .default(ENDPOINT_TRANSFER_HISTORY_PAGE_SIZE_DEFAULT)
          .describe("How many destinations to return, most recently active first.")
      }),
      response: {
        200: z.object({
          transfers: SanitizedEndpointTransferSchema.array(),
          lookbackHours: z.number()
        })
      }
    },
    handler: async (req) => {
      return server.services.endpoint.listTransferHistory(req.query, req.permission);
    }
  });
};
