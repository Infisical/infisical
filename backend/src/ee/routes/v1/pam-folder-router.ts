import { z } from "zod";

import { PamFoldersSchema } from "@app/db/schemas/pam-folders";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { isValidFolderName } from "@app/lib/validator";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPamFolderRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create PAM folder",
      body: z.object({
        projectId: z.string().uuid(),
        parentId: z.string().uuid().nullable().optional(),
        name: z
          .string()
          .trim()
          .refine((name) => isValidFolderName(name), {
            message: "Folder name can only contain alphanumeric characters, dashes, and underscores."
          }),
        description: z.string().trim().max(512).nullable().optional()
      }),
      response: {
        200: z.object({
          folder: PamFoldersSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const folder = await server.services.pamFolder.createFolder(req.body, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.body.projectId,
        event: {
          type: EventType.PAM_FOLDER_CREATE,
          metadata: {
            name: req.body.name,
            description: req.body.description,
            parentId: req.body.parentId
          }
        }
      });

      return { folder };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:folderId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Update PAM folder",
      params: z.object({
        folderId: z.string().uuid()
      }),
      body: z.object({
        name: z
          .string()
          .trim()
          .optional()
          .refine((name) => (name ? isValidFolderName(name) : true), {
            message: "Folder name can only contain alphanumeric characters, dashes, and underscores."
          }),
        description: z.string().trim().max(512).nullable().optional()
      }),
      response: {
        200: z.object({
          folder: PamFoldersSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const folder = await server.services.pamFolder.updateFolder(
        {
          ...req.body,
          id: req.params.folderId
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: folder.projectId,
        event: {
          type: EventType.PAM_FOLDER_UPDATE,
          metadata: {
            folderId: req.params.folderId,
            name: req.body.name,
            description: req.body.description
          }
        }
      });

      return { folder };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:folderId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Delete PAM folder",
      params: z.object({
        folderId: z.string().uuid()
      }),
      response: {
        200: z.object({
          folder: PamFoldersSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const folder = await server.services.pamFolder.deleteFolder(req.params.folderId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: folder.projectId,
        event: {
          type: EventType.PAM_FOLDER_DELETE,
          metadata: {
            folderName: folder.name,
            folderId: req.params.folderId
          }
        }
      });

      return { folder };
    }
  });
};
