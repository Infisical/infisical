import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";

export const registerPITRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/diff",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        fromCommit: z.string().trim(),
        toCommit: z.string().trim()
      }),
      response: {
        200: z.any()
      }
    },
    handler: async (req) => {
      const backup = await server.services.folderCommit.compareFolderStates(req.query.fromCommit, req.query.toCommit);

      return backup;
    }
  });
};
