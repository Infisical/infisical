import z from "zod";

import { PamFoldersSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ResourcePermissionPamResourceActions } from "@app/ee/services/permission/resource-permission";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const SanitizedFolderSchema = PamFoldersSchema.pick({
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true
});

export const registerPamFolderRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    schema: {
      operationId: "listPamFolders",
      description: "List all PAM folders in the project",
      tags: [ApiDocsTags.PamFolders],
      querystring: z.object({
        search: z.string().optional().describe("Filter folders by name"),
        onlyAccessible: z
          .enum(["true", "false"])
          .optional()
          .transform((v) => v === "true")
          .describe("Count only accounts that can launch a session toward each folder's accountCount"),
        filterByAction: z
          .nativeEnum(ResourcePermissionPamResourceActions)
          .optional()
          .describe("Filter folders to only those where the caller has this specific permission action")
      }),
      response: {
        200: z.object({
          folders: z.array(
            SanitizedFolderSchema.extend({
              accountCount: z.number()
            })
          )
        })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const folders = await server.services.pamFolder.list({
        projectId: req.internalPamProjectId,
        search: req.query.search,
        onlyAccessible: req.query.onlyAccessible,
        filterByAction: req.query.filterByAction,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return { folders };
    }
  });

  server.route({
    method: "GET",
    url: "/:folderId/permissions",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getPamFolderPermissions",
      description: "Get the caller's effective resource permissions on this folder.",
      tags: [ApiDocsTags.PamFolders],
      params: z.object({
        folderId: z.string().uuid().describe("The ID of the folder")
      }),
      response: {
        200: z.object({
          data: z.object({
            permissions: z.any().array(),
            memberships: z
              .object({
                id: z.string(),
                actorUserId: z.string().nullish(),
                actorIdentityId: z.string().nullish(),
                actorGroupId: z.string().nullish(),
                roles: z.object({ role: z.string(), customRoleSlug: z.string().nullish() }).array()
              })
              .array()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const data = await server.services.pamFolder.getFolderPermissions({
        folderId: req.params.folderId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return { data };
    }
  });

  server.route({
    method: "GET",
    url: "/:folderId",
    schema: {
      operationId: "getPamFolderById",
      description: "Get a PAM folder by ID",
      tags: [ApiDocsTags.PamFolders],
      params: z.object({
        folderId: z.string().uuid().describe("The ID of the folder")
      }),
      response: {
        200: z.object({
          folder: SanitizedFolderSchema.extend({
            accountCount: z.number()
          })
        })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const folder = await server.services.pamFolder.getById({
        folderId: req.params.folderId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return { folder };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    schema: {
      operationId: "createPamFolder",
      description: "Create a new PAM folder",
      tags: [ApiDocsTags.PamFolders],
      body: z.object({
        name: slugSchema({ field: "Name" }).describe("Name for the folder"),
        description: z.string().trim().max(256).optional().describe("Optional description")
      }),
      response: {
        200: z.object({ folder: SanitizedFolderSchema })
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const folder = await server.services.pamFolder.create({
        ...req.body,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_FOLDER_CREATE,
          metadata: {
            folderId: folder.id,
            name: folder.name,
            description: folder.description
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamFolderCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            orgId: req.permission.orgId
          }
        })
        .catch(() => {});

      return { folder };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:folderId",
    schema: {
      operationId: "updatePamFolder",
      description: "Update a PAM folder",
      tags: [ApiDocsTags.PamFolders],
      params: z.object({
        folderId: z.string().uuid().describe("The ID of the folder")
      }),
      body: z.object({
        name: slugSchema({ field: "Name" }).optional().describe("New name"),
        description: z.string().trim().max(256).nullable().optional().describe("New description")
      }),
      response: {
        200: z.object({ folder: SanitizedFolderSchema })
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const folder = await server.services.pamFolder.update({
        folderId: req.params.folderId,
        ...req.body,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_FOLDER_UPDATE,
          metadata: {
            folderId: folder.id,
            name: req.body.name,
            description: req.body.description
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamFolderUpdated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            orgId: req.permission.orgId
          }
        })
        .catch(() => {});

      return { folder };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:folderId",
    schema: {
      operationId: "deletePamFolder",
      description: "Delete a PAM folder",
      tags: [ApiDocsTags.PamFolders],
      params: z.object({
        folderId: z.string().uuid().describe("The ID of the folder")
      }),
      response: {
        200: z.object({ folder: SanitizedFolderSchema })
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const folder = await server.services.pamFolder.deleteFolder({
        folderId: req.params.folderId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_FOLDER_DELETE,
          metadata: {
            folderId: folder.id,
            folderName: folder.name
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamFolderDeleted,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            orgId: req.permission.orgId
          }
        })
        .catch(() => {});

      return { folder };
    }
  });
};
