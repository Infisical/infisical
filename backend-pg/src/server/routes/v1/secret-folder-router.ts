import { z } from "zod";

import { SecretFoldersSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretFolderRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        name: z.string().trim(),
        path: z.string().trim().default("/"),
        // backward compatiability with cli
        directory: z.string().trim().default("/")
      }),
      response: {
        200: z.object({
          folder: SecretFoldersSchema
        })
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      const path = req.body.path || req.body.directory;
      const folder = await server.services.folder.createFolder({
        actorId: req.permission.id,
        actor: req.permission.type,
        ...req.body,
        projectId: req.body.workspaceId,
        path
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.workspaceId,
        event: {
          type: EventType.CREATE_FOLDER,
          metadata: {
            environment: req.body.environment,
            folderId: folder.id,
            folderName: folder.name,
            folderPath: path
          }
        }
      });
      return { folder };
    }
  });

  server.route({
    url: "/:folderId",
    method: "PATCH",
    schema: {
      params: z.object({
        // old way this was name
        folderId: z.string()
      }),
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        name: z.string().trim(),
        path: z.string().trim().default("/"),
        // backward compatiability with cli
        directory: z.string().trim().default("/")
      }),
      response: {
        200: z.object({
          folder: SecretFoldersSchema
        })
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      const path = req.body.path || req.body.directory;
      const { folder, old } = await server.services.folder.updateFolder({
        actorId: req.permission.id,
        actor: req.permission.type,
        ...req.body,
        projectId: req.body.workspaceId,
        id: req.params.folderId,
        path
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.workspaceId,
        event: {
          type: EventType.UPDATE_FOLDER,
          metadata: {
            environment: req.body.environment,
            folderId: folder.id,
            folderPath: path,
            newFolderName: folder.name,
            oldFolderName: old.name
          }
        }
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
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        path: z.string().trim().default("/"),
        // keep this here as cli need directory
        directory: z.string().trim().default("/")
      }),
      response: {
        200: z.object({
          folder: SecretFoldersSchema
        })
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      const path = req.body.path || req.body.directory;
      const folder = await server.services.folder.deleteFolder({
        actorId: req.permission.id,
        actor: req.permission.type,
        ...req.body,
        projectId: req.body.workspaceId,
        id: req.params.folderId,
        path
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.workspaceId,
        event: {
          type: EventType.DELETE_FOLDER,
          metadata: {
            environment: req.body.environment,
            folderId: folder.id,
            folderPath: path,
            folderName: folder.name
          }
        }
      });
      return { folder };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    schema: {
      querystring: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        path: z.string().trim().default("/"),
        // backward compatiability with cli
        directory: z.string().trim().default("/")
      }),
      response: {
        200: z.object({
          folders: SecretFoldersSchema.array()
        })
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      const path = req.query.path || req.query.directory;
      const folders = await server.services.folder.getFolders({
        actorId: req.permission.id,
        actor: req.permission.type,
        ...req.query,
        projectId: req.query.workspaceId,
        path
      });
      return { folders };
    }
  });
};
