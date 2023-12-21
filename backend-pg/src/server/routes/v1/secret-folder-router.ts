import { z } from "zod";

import { SecretFoldersSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretFolderRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      body: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim(),
        name: z.string().trim(),
        path: z.string().trim().default("/")
      }),
      response: {
        200: z.object({
          folder: SecretFoldersSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const folder = await server.services.folder.createFolder({
        actorId: req.permission.id,
        actor: req.permission.type,
        ...req.body
      });
      return { folder };
    }
  });

  server.route({
    url: "/:folderId",
    method: "PATCH",
    schema: {
      params: z.object({
        folderId: z.string()
      }),
      body: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim(),
        name: z.string().trim(),
        path: z.string().trim().default("/")
      }),
      response: {
        200: z.object({
          folder: SecretFoldersSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const folder = await server.services.folder.updateFolder({
        actorId: req.permission.id,
        actor: req.permission.type,
        ...req.body,
        id: req.params.folderId
      });
      return { folder };
    }
  });

  server.route({
    url: "/:folderId",
    method: "DELETE",
    schema: {
      params: z.object({
        folderId: z.string()
      }),
      body: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim(),
        path: z.string().trim().default("/")
      }),
      response: {
        200: z.object({
          folder: SecretFoldersSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const folder = await server.services.folder.deleteFolder({
        actorId: req.permission.id,
        actor: req.permission.type,
        ...req.body,
        id: req.params.folderId
      });
      return { folder };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    schema: {
      querystring: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim(),
        path: z.string().trim().default("/")
      }),
      response: {
        200: z.object({
          folders: SecretFoldersSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const folders = await server.services.folder.getFolders({
        actorId: req.permission.id,
        actor: req.permission.type,
        ...req.query
      });
      return { folders };
    }
  });
};
