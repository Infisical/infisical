import { z } from "zod";

import { writeLimit } from "@app/server/config/rateLimiter";

export const registerProxyRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        ip: z.string()
      }),
      response: {
        200: z.any()
      }
    },
    handler: async (req) => {
      return server.services.proxy.registerProxy(req.body);
    }
  });
};
