import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";

export const registerPITRouter = async (server: FastifyZodProvider) => {
  // Get all commits for a folder
  server.route({
    method: "GET",
    url: "/commits/:folderId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        folderId: z.string().trim()
      }),
      response: {
        200: z.any()
      }
    },
    handler: async (req) => {
      const commits = await server.services.folderCommit.getCommitsByFolderId(req.params.folderId);
      return commits;
    }
  });

  // Get commit changes for a specific commit
  server.route({
    method: "GET",
    url: "/commits/:commitId/changes",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        commitId: z.string().trim()
      }),
      response: {
        200: z.any()
      }
    },
    handler: async (req) => {
      const changes = await server.services.folderCommit.getCommitChanges(req.params.commitId);
      return changes;
    }
  });

  // Compare folder states between commits
  server.route({
    method: "GET",
    url: "/compare",
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
      const diff = await server.services.folderCommit.compareFolderStates({
        currentCommitId: req.query.fromCommit,
        targetCommitId: req.query.toCommit
      });

      return diff;
    }
  });

  // Rollback to a previous commit
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
        projectId: z.string().trim(),
        reconstructNewFolders: z.boolean().default(false)
      }),
      response: {
        200: z.any()
      }
    },
    handler: async (req) => {
      const diff = await server.services.folderCommit.compareFolderStates({
        currentCommitId: req.body.fromCommit,
        targetCommitId: req.body.toCommit
      });

      const response = await server.services.folderCommit.applyFolderStateDifferences({
        differences: diff,
        actorInfo: {
          actorType: req.permission?.type || "PLATFORM",
          actorId: req.permission?.id,
          message: "Rollback to previous commit"
        },
        folderId: req.body.folderId,
        projectId: req.body.projectId,
        reconstructNewFolders: req.body.reconstructNewFolders
      });

      return response;
    }
  });

  // Deep rollback to a specific commit
  server.route({
    method: "POST",
    url: "/deep-rollback",
    config: {
      rateLimit: readLimit
    },
    schema: {
      body: z.object({
        commitId: z.string().trim(),
        envId: z.string().trim(),
        projectId: z.string().trim()
      }),
      response: {
        200: z.any()
      }
    },
    handler: async (req) => {
      await server.services.folderCommit.deepRollbackFolder(
        req.body.commitId,
        req.body.envId,
        req.permission?.id || "PLATFORM",
        req.permission?.type || "PLATFORM",
        req.body.projectId
      );

      return { success: true };
    }
  });
};
