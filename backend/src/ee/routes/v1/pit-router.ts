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

  server.route({
    method: "POST",
    url: "/rollback",
    config: {
      rateLimit: readLimit
    },
    schema: {
      body: z.object({
        fromCommit: z.string().trim(),
        toCommit: z.string().trim(),
        folderId: z.string().trim(),
        projectId: z.string().trim()
      }),
      response: {
        200: z.any()
      }
    },
    handler: async (req) => {
      const diff = await server.services.folderCommit.compareFolderStates(req.body.fromCommit, req.body.toCommit);
      const response = await server.services.folderCommit.applyFolderStateDifferences(
        diff,
        {
          actorType: req.permission?.type || "PLATFORM",
          actorId: req.permission?.id,
          message: "Rollback to previous commit"
        },
        req.body.folderId,
        req.body.projectId
      );

      return response;
    }
  });
};
