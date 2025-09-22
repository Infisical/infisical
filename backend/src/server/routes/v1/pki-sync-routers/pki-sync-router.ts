import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { AuthMode } from "@app/services/auth/auth-type";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

const PkiSyncSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  destination: z.nativeEnum(PkiSync),
  isAutoSyncEnabled: z.boolean(),
  destinationConfig: z.record(z.unknown()),
  syncOptions: z.record(z.unknown()),
  projectId: z.string().uuid(),
  subscriberId: z.string().uuid().nullable().optional(),
  connectionId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Sync status fields
  syncStatus: z.string().nullable().optional(),
  lastSyncJobId: z.string().nullable().optional(),
  lastSyncMessage: z.string().nullable().optional(),
  lastSyncedAt: z.date().nullable().optional(),
  // Import status fields
  importStatus: z.string().nullable().optional(),
  lastImportJobId: z.string().nullable().optional(),
  lastImportMessage: z.string().nullable().optional(),
  lastImportedAt: z.date().nullable().optional(),
  // Remove status fields
  removeStatus: z.string().nullable().optional(),
  lastRemoveJobId: z.string().nullable().optional(),
  lastRemoveMessage: z.string().nullable().optional(),
  lastRemovedAt: z.date().nullable().optional(),
  // App connection info
  appConnectionName: z.string(),
  appConnectionApp: z.string(),
  connection: z.object({
    id: z.string(),
    name: z.string(),
    app: z.string(),
    encryptedCredentials: z.unknown().nullable(),
    orgId: z.string().uuid(),
    projectId: z.string().uuid().nullable().optional(),
    method: z.string(),
    description: z.string().nullable().optional(),
    version: z.number(),
    gatewayId: z.string().uuid().nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
    isPlatformManagedCredentials: z.boolean().nullable().optional()
  }),
  subscriber: z
    .object({
      id: z.string(),
      name: z.string()
    })
    .nullable()
    .optional()
});

const PkiSyncOptionsSchema = z.object({
  name: z.string(),
  connection: z.nativeEnum(AppConnection),
  destination: z.nativeEnum(PkiSync),
  canImportCertificates: z.boolean(),
  canRemoveCertificates: z.boolean(),
  defaultCertificateNameSchema: z.string().optional(),
  forbiddenCharacters: z.string().optional(),
  allowedCharacterPattern: z.string().optional(),
  maxCertificateNameLength: z.number().optional(),
  minCertificateNameLength: z.number().optional()
});

export const registerPkiSyncRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/options",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiSyncs],
      description: "List the available PKI Sync Options.",
      response: {
        200: z.object({
          pkiSyncOptions: PkiSyncOptionsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: () => {
      const pkiSyncOptions = server.services.pkiSync.getPkiSyncOptions();
      return { pkiSyncOptions };
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
      tags: [ApiDocsTags.PkiSyncs],
      description: "List all the PKI Syncs for the specified project.",
      querystring: z.object({
        projectId: z.string().trim().min(1)
      }),
      response: {
        200: z.object({ pkiSyncs: PkiSyncSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        query: { projectId },
        permission
      } = req;

      const pkiSyncs = await server.services.pkiSync.listPkiSyncsByProjectId({ projectId }, permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_PKI_SYNCS,
          metadata: {
            projectId
          }
        }
      });

      return { pkiSyncs };
    }
  });

  server.route({
    method: "GET",
    url: "/:pkiSyncId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.PkiSyncs],
      description: "Get a PKI Sync by ID.",
      params: z.object({
        pkiSyncId: z.string()
      }),
      response: {
        200: PkiSyncSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { pkiSyncId } = req.params;

      const pkiSync = await server.services.pkiSync.findPkiSyncById({ id: pkiSyncId }, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiSync.projectId,
        event: {
          type: EventType.GET_PKI_SYNC,
          metadata: {
            syncId: pkiSyncId,
            destination: pkiSync.destination
          }
        }
      });

      return pkiSync;
    }
  });
};
