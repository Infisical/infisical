import z from "zod";

import { PamFoldersSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const SanitizedFolderSchema = PamFoldersSchema.pick({
  id: true,
  projectId: true,
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
      querystring: z.object({
        search: z.string().optional()
      }),
      response: {
        200: z.array(
          SanitizedFolderSchema.extend({
            accountCount: z.number()
          })
        )
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.pamFolder.list({
        projectId: req.internalPamProjectId,
        search: req.query.search,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
    }
  });

  server.route({
    method: "GET",
    url: "/:folderId",
    schema: {
      operationId: "getPamFolderById",
      params: z.object({
        folderId: z.string().uuid()
      }),
      response: {
        200: SanitizedFolderSchema.extend({
          accountCount: z.number()
        })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.pamFolder.getById({
        folderId: req.params.folderId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
    }
  });

  server.route({
    method: "POST",
    url: "/",
    schema: {
      operationId: "createPamFolder",
      body: z.object({
        name: z.string().trim().min(1).max(64),
        description: z.string().trim().max(256).optional()
      }),
      response: {
        200: SanitizedFolderSchema
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

      return folder;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:folderId",
    schema: {
      operationId: "updatePamFolder",
      params: z.object({
        folderId: z.string().uuid()
      }),
      body: z.object({
        name: z.string().trim().min(1).max(64).optional(),
        description: z.string().trim().max(256).nullable().optional()
      }),
      response: {
        200: SanitizedFolderSchema
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
        event: {
          type: EventType.PAM_FOLDER_UPDATE,
          metadata: {
            folderId: folder.id,
            name: req.body.name,
            description: req.body.description
          }
        }
      });

      return folder;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:folderId",
    schema: {
      operationId: "deletePamFolder",
      params: z.object({
        folderId: z.string().uuid()
      }),
      response: {
        200: SanitizedFolderSchema
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

      return folder;
    }
  });
};
