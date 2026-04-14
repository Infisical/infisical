import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { AuthMode } from "@app/services/auth/auth-type";
import { CertificateSyncStatus } from "@app/services/certificate-sync/certificate-sync-enums";
import { SyncMetadataSchema } from "@app/services/certificate-sync/certificate-sync-schemas";
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
    .optional(),
  hasCertificate: z.boolean().optional()
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

const PkiSyncCertificateSchema = z.object({
  id: z.string().uuid(),
  pkiSyncId: z.string().uuid(),
  certificateId: z.string().uuid(),
  syncStatus: z.nativeEnum(CertificateSyncStatus),
  lastSyncMessage: z.string().nullable().optional(),
  lastSyncedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  certificateSerialNumber: z.string().optional(),
  certificateCommonName: z.string().optional(),
  certificateAltNames: z.string().optional(),
  certificateStatus: z.string().optional(),
  certificateNotBefore: z.date().optional(),
  certificateNotAfter: z.date().optional(),
  certificateRenewBeforeDays: z.number().nullish(),
  certificateRenewalError: z.string().nullish(),
  pkiSyncName: z.string().optional(),
  pkiSyncDestination: z.string().optional(),
  syncMetadata: SyncMetadataSchema
});

export const registerPkiSyncRouter = async (server: FastifyZodProvider, enableOperationId: boolean = true) => {
  server.route({
    method: "GET",
    url: "/options",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: "listPkiSyncOptions" } : {}),
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
      ...(enableOperationId ? { operationId: "listPkiSyncs" } : {}),
      tags: [ApiDocsTags.PkiSyncs],
      description: "List all the PKI Syncs for the specified project.",
      querystring: z.object({
        projectId: z.string().trim().min(1),
        certificateId: z.string().uuid().optional()
      }),
      response: {
        200: z.object({ pkiSyncs: PkiSyncSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        query: { projectId, certificateId },
        permission
      } = req;

      const pkiSyncs = await server.services.pkiSync.listPkiSyncsByProjectId({ projectId, certificateId }, permission);

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
      ...(enableOperationId ? { operationId: "getPkiSync" } : {}),
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

  server.route({
    method: "GET",
    url: "/:pkiSyncId/certificates",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: "listPkiSyncCertificates" } : {}),
      tags: [ApiDocsTags.PkiSyncs],
      description: "List all certificates associated with a PKI Sync.",
      params: z.object({
        pkiSyncId: z.string().uuid()
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(20)
      }),
      response: {
        200: z.object({
          certificates: PkiSyncCertificateSchema.array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { pkiSyncId } = req.params;
      const { offset, limit } = req.query;

      const { certificates, totalCount, pkiSyncInfo } = await server.services.pkiSync.listPkiSyncCertificates(
        { pkiSyncId, offset, limit },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiSyncInfo.projectId,
        event: {
          type: EventType.GET_PKI_SYNC_CERTIFICATES,
          metadata: {
            syncId: pkiSyncId,
            destination: pkiSyncInfo.destination,
            count: certificates.length,
            certificateIds: certificates.map((c) => c.certificateId)
          }
        }
      });

      return { certificates, totalCount };
    }
  });

  server.route({
    method: "POST",
    url: "/:pkiSyncId/certificates",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: "addCertificatesToPkiSync" } : {}),
      tags: [ApiDocsTags.PkiSyncs],
      description: "Add certificates to a PKI Sync.",
      params: z.object({
        pkiSyncId: z.string().uuid()
      }),
      body: z.object({
        certificateIds: z.array(z.string().uuid()).min(1, "At least one certificate ID is required")
      }),
      response: {
        200: z.object({
          addedCertificates: z.array(
            z.object({
              id: z.string().uuid(),
              pkiSyncId: z.string().uuid(),
              certificateId: z.string().uuid(),
              syncStatus: z.string().default("pending").optional().nullable(),
              lastSyncMessage: z.string().optional().nullable(),
              lastSyncedAt: z.date().optional().nullable(),
              createdAt: z.date(),
              updatedAt: z.date()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { pkiSyncId } = req.params;
      const { certificateIds } = req.body;

      const { addedCertificates, pkiSyncInfo } = await server.services.pkiSync.addCertificatesToPkiSync(
        { pkiSyncId, certificateIds },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiSyncInfo.projectId,
        event: {
          type: EventType.UPDATE_PKI_SYNC,
          metadata: {
            pkiSyncId,
            name: pkiSyncInfo.name
          }
        }
      });

      return { addedCertificates };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:pkiSyncId/certificates",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: "removeCertificatesFromPkiSync" } : {}),
      tags: [ApiDocsTags.PkiSyncs],
      description: "Remove certificates from a PKI Sync.",
      params: z.object({
        pkiSyncId: z.string().uuid()
      }),
      body: z.object({
        certificateIds: z.array(z.string().uuid()).min(1, "At least one certificate ID is required")
      }),
      response: {
        200: z.object({
          removedCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { pkiSyncId } = req.params;
      const { certificateIds } = req.body;

      const { removedCount, pkiSyncInfo } = await server.services.pkiSync.removeCertificatesFromPkiSync(
        { pkiSyncId, certificateIds },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiSyncInfo.projectId,
        event: {
          type: EventType.UPDATE_PKI_SYNC,
          metadata: {
            pkiSyncId,
            name: pkiSyncInfo.name
          }
        }
      });

      return { removedCount };
    }
  });
};
