import { z } from "zod";

import { SecretFoldersSchema } from "@app/db/schemas/secret-folders";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, FOLDERS } from "@app/lib/api-docs";
import { prefixWithSlash, removeTrailingSlash } from "@app/lib/fn";
import { isValidFolderName } from "@app/lib/validator";
import { readLimit, secretsLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { booleanSchema } from "../sanitizedSchemas";

export const registerDeprecatedSecretFolderRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Folders],
      description: "Create folders",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        workspaceId: z.string().trim().describe(FOLDERS.CREATE.projectId),
        environment: z.string().trim().describe(FOLDERS.CREATE.environment),
        name: z
          .string()
          .trim()
          .describe(FOLDERS.CREATE.name)
          .refine((name) => isValidFolderName(name), {
            message: "Invalid folder name. Only alphanumeric characters, dashes, and underscores are allowed."
          }),
        path: z
          .string()
          .trim()
          .default("/")
          .transform(prefixWithSlash) // Transformations get skipped if path is undefined
          .transform(removeTrailingSlash)
          .describe(FOLDERS.CREATE.path)
          .optional(),
        // backward compatibility with cli
        directory: z
          .string()
          .trim()
          .default("/")
          .transform(prefixWithSlash) // Transformations get skipped if directory is undefined
          .transform(removeTrailingSlash)
          .describe(FOLDERS.CREATE.directory)
          .optional(),
        description: z.string().optional().nullable().describe(FOLDERS.CREATE.description)
      }),
      response: {
        200: z.object({
          folder: SecretFoldersSchema.extend({
            path: z.string()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const path = req.body.path || req.body.directory || "/";
      const folder = await server.services.folder.createFolder({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        projectId: req.body.workspaceId,
        path,
        description: req.body.description
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
            folderPath: path,
            ...(req.body.description ? { description: req.body.description } : {})
          }
        }
      });
      return { folder };
    }
  });

  server.route({
    url: "/:folderId",
    method: "PATCH",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Folders],
      description: "Update folder",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        // old way this was name
        folderId: z.string().describe(FOLDERS.UPDATE.folderId)
      }),
      body: z.object({
        workspaceId: z.string().trim().describe(FOLDERS.UPDATE.projectId),
        environment: z.string().trim().describe(FOLDERS.UPDATE.environment),
        name: z
          .string()
          .trim()
          .describe(FOLDERS.UPDATE.name)
          .refine((name) => isValidFolderName(name), {
            message: "Invalid folder name. Only alphanumeric characters, dashes, and underscores are allowed."
          }),
        path: z
          .string()
          .trim()
          .default("/")
          .transform(prefixWithSlash) // Transformations get skipped if path is undefined
          .transform(removeTrailingSlash)
          .describe(FOLDERS.UPDATE.path)
          .optional(),
        // backward compatibility with cli
        directory: z
          .string()
          .trim()
          .default("/")
          .transform(prefixWithSlash) // Transformations get skipped if directory is undefined
          .transform(removeTrailingSlash)
          .describe(FOLDERS.UPDATE.directory)
          .optional(),
        description: z.string().optional().nullable().describe(FOLDERS.UPDATE.description)
      }),
      response: {
        200: z.object({
          folder: SecretFoldersSchema.extend({
            path: z.string()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const path = req.body.path || req.body.directory || "/";
      const { folder, old } = await server.services.folder.updateFolder({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
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

  server.route({
    url: "/batch",
    method: "PATCH",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Folders],
      description: "Update folders by batch",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        projectSlug: z.string().trim().describe(FOLDERS.UPDATE.projectSlug),
        folders: z
          .object({
            id: z.string().describe(FOLDERS.UPDATE.folderId),
            environment: z.string().trim().describe(FOLDERS.UPDATE.environment),
            name: z
              .string()
              .trim()
              .describe(FOLDERS.UPDATE.name)
              .refine((name) => isValidFolderName(name), {
                message: "Invalid folder name. Only alphanumeric characters, dashes, and underscores are allowed."
              }),
            path: z
              .string()
              .trim()
              .default("/")
              .transform(prefixWithSlash)
              .transform(removeTrailingSlash)
              .describe(FOLDERS.UPDATE.path),
            description: z.string().optional().nullable().describe(FOLDERS.UPDATE.description)
          })
          .array()
          .min(1)
      }),
      response: {
        200: z.object({
          folders: SecretFoldersSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { newFolders, oldFolders, projectId } = await server.services.folder.updateManyFolders({
        ...req.body,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await Promise.all(
        req.body.folders.map(async (folder, index) => {
          await server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            projectId,
            event: {
              type: EventType.UPDATE_FOLDER,
              metadata: {
                environment: oldFolders[index].envId,
                folderId: oldFolders[index].id,
                folderPath: folder.path,
                newFolderName: newFolders[index].name,
                oldFolderName: oldFolders[index].name
              }
            }
          });
        })
      );

      return { folders: newFolders };
    }
  });

  // TODO(daniel): Expose this route in api reference and write docs for it.
  server.route({
    method: "DELETE",
    url: "/:folderIdOrName",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Folders],
      description: "Delete a folder",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        folderIdOrName: z.string().describe(FOLDERS.DELETE.folderIdOrName)
      }),
      body: z.object({
        workspaceId: z.string().trim().describe(FOLDERS.DELETE.projectId),
        environment: z.string().trim().describe(FOLDERS.DELETE.environment),
        path: z
          .string()
          .trim()
          .default("/")
          .transform(prefixWithSlash) // Transformations get skipped if path is undefined
          .transform(removeTrailingSlash)
          .describe(FOLDERS.DELETE.path)
          .optional(),
        // keep this here as cli need directory
        directory: z
          .string()
          .trim()
          .default("/")
          .transform(prefixWithSlash) // Transformations get skipped if directory is undefined
          .transform(removeTrailingSlash)
          .describe(FOLDERS.DELETE.directory)
          .optional()
      }),
      response: {
        200: z.object({
          folder: SecretFoldersSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const path = req.body.path || req.body.directory || "/";
      const folder = await server.services.folder.deleteFolder({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        projectId: req.body.workspaceId,
        idOrName: req.params.folderIdOrName,
        path,
        forceDelete: true
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
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Folders],
      description: "Get folders",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        workspaceId: z.string().trim().describe(FOLDERS.LIST.projectId),
        environment: z.string().trim().describe(FOLDERS.LIST.environment),
        lastSecretModified: z.string().datetime().trim().optional().describe(FOLDERS.LIST.lastSecretModified),
        path: z
          .string()
          .trim()
          .transform(prefixWithSlash) // Transformations get skipped if path is undefined
          .transform(removeTrailingSlash)
          .describe(FOLDERS.LIST.path)
          .optional(),
        // backward compatibility with cli
        directory: z
          .string()
          .trim()
          .transform(prefixWithSlash) // Transformations get skipped if directory is undefined
          .transform(removeTrailingSlash)
          .describe(FOLDERS.LIST.directory)
          .optional(),
        recursive: booleanSchema.default(false).describe(FOLDERS.LIST.recursive)
      }),
      response: {
        200: z.object({
          folders: SecretFoldersSchema.extend({
            relativePath: z.string().optional()
          }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const path = req.query.path || req.query.directory || "/";
      const folders = await server.services.folder.getFolders({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query,
        projectId: req.query.workspaceId,
        path
      });
      return { folders };
    }
  });

  server.route({
    method: "GET",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Folders],
      description: "Get folder by id",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        id: z.string().trim().describe(FOLDERS.GET_BY_ID.folderId)
      }),
      response: {
        200: z.object({
          folder: SecretFoldersSchema.extend({
            environment: z.object({
              envId: z.string(),
              envName: z.string(),
              envSlug: z.string()
            }),
            path: z.string(),
            projectId: z.string()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const folder = await server.services.folder.getFolderById({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id
      });
      return { folder };
    }
  });
};
