import { z } from "zod";

import { ENDPOINT_MAX_APPS_PER_REPORT } from "@app/ee/services/endpoint/endpoint-constants";
import { EndpointDeviceAppSource } from "@app/ee/services/endpoint/endpoint-enums";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

// Kept off the heartbeat: an inventory is a few hundred entries that change on the order of days,
// and the heartbeat is the highest-frequency call the product makes.
export const registerEndpointAgentAppRouter = async (server: FastifyZodProvider) => {
  // PUT rather than POST: the body is the device's complete inventory, and sending the same one
  // twice has to leave the same rows behind.
  server.route({
    method: "PUT",
    url: "/apps",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      body: z.object({
        apps: z
          .object({
            name: z.string().trim().min(1).max(255),
            // Absent for anything that is not a bundle, and on every platform without bundle
            // identifiers, so the path is what identifies an entry.
            bundleId: z.string().trim().max(512).nullish(),
            version: z.string().trim().max(64).nullish(),
            path: z.string().trim().min(1).max(1024),
            source: z.nativeEnum(EndpointDeviceAppSource),
            isRunning: z.boolean()
          })
          .array()
          .max(ENDPOINT_MAX_APPS_PER_REPORT)
      }),
      response: {
        200: z.object({ acceptedCount: z.number() })
      }
    },
    handler: async (req) => {
      return server.services.endpoint.reportDeviceApps(req.body, req.permission);
    }
  });
};
