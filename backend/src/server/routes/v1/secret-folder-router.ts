import { z } from "zod";

import { SecretFoldersSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { FOLDERS } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretFolderRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      description: "Create folders",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      body: z.object({
        workspaceId: z.string().trim().describe(FOLDERS.CREATE.workspaceId),
        environment: z.string().trim().describe(FOLDERS.CREATE.environment),
        name: z.string().trim().describe(FOLDERS.CREATE.name),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(FOLDERS.CREATE.path),
        // backward compatiability with cli
        directory: z.string().trim().default("/").transform(removeTrailingSlash).describe(FOLDERS.CREATE.directory)
      }),
      response: {
        200: z.object({
          folder: SecretFoldersSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const path = req.body.path || req.body.directory;
      const folder = await server.services.folder.createFolder({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
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
      description: "Update folder",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      params: z.object({
        // old way this was name
        folderId: z.string().describe(FOLDERS.UPDATE.folderId)
      }),
      body: z.object({
        workspaceId: z.string().trim().describe(FOLDERS.UPDATE.workspaceId),
        environment: z.string().trim().describe(FOLDERS.UPDATE.environment),
        name: z.string().trim().describe(FOLDERS.UPDATE.name),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(FOLDERS.UPDATE.path),
        // backward compatiability with cli
        directory: z.string().trim().default("/").transform(removeTrailingSlash).describe(FOLDERS.UPDATE.directory)
      }),
      response: {
        200: z.object({
          folder: SecretFoldersSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const path = req.body.path || req.body.directory;
      const { folder, old } = await server.services.folder.updateFolder({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
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

  // TODO(daniel): Expose this route in api reference and write docs for it.
  server.route({
    url: "/:folderIdOrName",
    method: "DELETE",
    schema: {
      description: "Delete a folder",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      params: z.object({
        folderIdOrName: z.string().describe(FOLDERS.DELETE.folderIdOrName)
      }),
      body: z.object({
        workspaceId: z.string().trim().describe(FOLDERS.DELETE.workspaceId),
        environment: z.string().trim().describe(FOLDERS.DELETE.environment),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(FOLDERS.DELETE.path),
        // keep this here as cli need directory
        directory: z.string().trim().default("/").transform(removeTrailingSlash).describe(FOLDERS.DELETE.directory)
      }),
      response: {
        200: z.object({
          folder: SecretFoldersSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const path = req.body.path || req.body.directory;
      const folder = await server.services.folder.deleteFolder({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        ...req.body,
        projectId: req.body.workspaceId,
        idOrName: req.params.folderIdOrName,
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
      description: "Get folders",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      querystring: z.object({
        workspaceId: z.string().trim().describe(FOLDERS.LIST.workspaceId),
        environment: z.string().trim().describe(FOLDERS.LIST.environment),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(FOLDERS.LIST.path),
        // backward compatiability with cli
        directory: z.string().trim().default("/").transform(removeTrailingSlash).describe(FOLDERS.LIST.directory)
      }),
      response: {
        200: z.object({
          folders: SecretFoldersSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const path = req.query.path || req.query.directory;
      const folders = await server.services.folder.getFolders({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        ...req.query,
        projectId: req.query.workspaceId,
        path
      });
      return { folders };
    }
  });
};
