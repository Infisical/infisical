import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import { PKI_SYNC_NAME_MAP } from "@app/services/pki-sync/pki-sync-maps";

export const registerSyncPkiEndpoints = ({
  server,
  destination,
  createSchema,
  updateSchema,
  responseSchema,
  syncOptions
}: {
  destination: PkiSync;
  server: FastifyZodProvider;
  createSchema: z.ZodType<{
    name: string;
    projectId: string;
    connectionId: string;
    destinationConfig: Record<string, unknown>;
    syncOptions?: Record<string, unknown>;
    description?: string;
    isAutoSyncEnabled?: boolean;
    subscriberId?: string | null;
  }>;
  updateSchema: z.ZodType<{
    connectionId?: string;
    name?: string;
    destinationConfig?: Record<string, unknown>;
    syncOptions?: Record<string, unknown>;
    description?: string;
    isAutoSyncEnabled?: boolean;
    subscriberId?: string | null;
  }>;
  responseSchema: z.ZodTypeAny;
  syncOptions: {
    canImportCertificates: boolean;
    canRemoveCertificates: boolean;
  };
}) => {
  const destinationName = PKI_SYNC_NAME_MAP[destination];
  const destinationNameForOpId = destination
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  server.route({
    method: "GET",
    url: `/`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: `list${destinationNameForOpId}PkiSyncs`,
      tags: [ApiDocsTags.PkiSyncs],
      description: `List the ${destinationName} PKI Syncs for the specified project.`,
      querystring: z.object({
        projectId: z.string().trim().min(1, "Project ID required")
      }),
      response: {
        200: z.object({ pkiSyncs: responseSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        query: { projectId }
      } = req;

      const pkiSyncs = await server.services.pkiSync.listPkiSyncsByProjectId({ projectId }, req.permission);

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
      operationId: `get${destinationNameForOpId}PkiSync`,
      tags: [ApiDocsTags.PkiSyncs],
      description: `Get the specified ${destinationName} PKI Sync by ID.`,
      params: z.object({
        pkiSyncId: z.string()
      }),
      response: {
        200: responseSchema
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
            destination
          }
        }
      });

      return pkiSync;
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `create${destinationNameForOpId}PkiSync`,
      tags: [ApiDocsTags.PkiSyncs],
      description: `Create a ${destinationName} PKI Sync for the specified project.`,
      body: createSchema,
      response: {
        200: responseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const pkiSync = await server.services.pkiSync.createPkiSync({ ...req.body, destination }, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiSync.projectId,
        event: {
          type: EventType.CREATE_PKI_SYNC,
          metadata: {
            pkiSyncId: pkiSync.id,
            name: pkiSync.name,
            destination
          }
        }
      });

      return pkiSync;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:pkiSyncId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `update${destinationNameForOpId}PkiSync`,
      tags: [ApiDocsTags.PkiSyncs],
      description: `Update the specified ${destinationName} PKI Sync.`,
      params: z.object({
        pkiSyncId: z.string()
      }),
      body: updateSchema,
      response: {
        200: responseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { pkiSyncId } = req.params;

      const pkiSync = await server.services.pkiSync.updatePkiSync({ ...req.body, id: pkiSyncId }, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiSync.projectId,
        event: {
          type: EventType.UPDATE_PKI_SYNC,
          metadata: {
            pkiSyncId,
            name: pkiSync.name
          }
        }
      });

      return pkiSync;
    }
  });

  server.route({
    method: "DELETE",
    url: `/:pkiSyncId`,
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `delete${destinationNameForOpId}PkiSync`,
      tags: [ApiDocsTags.PkiSyncs],
      description: `Delete the specified ${destinationName} PKI Sync.`,
      params: z.object({
        pkiSyncId: z.string()
      }),
      response: {
        200: responseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { pkiSyncId } = req.params;

      const pkiSync = await server.services.pkiSync.deletePkiSync({ id: pkiSyncId }, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiSync.projectId,
        event: {
          type: EventType.DELETE_PKI_SYNC,
          metadata: {
            pkiSyncId,
            name: pkiSync.name,
            destination: pkiSync.destination
          }
        }
      });

      return pkiSync;
    }
  });

  server.route({
    method: "POST",
    url: "/:pkiSyncId/sync",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `sync${destinationNameForOpId}PkiSync`,
      tags: [ApiDocsTags.PkiSyncs],
      description: `Trigger a sync for the specified ${destinationName} PKI Sync.`,
      params: z.object({
        pkiSyncId: z.string()
      }),
      response: {
        200: z.object({ message: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { pkiSyncId } = req.params;

      const result = await server.services.pkiSync.triggerPkiSyncSyncCertificatesById(
        {
          id: pkiSyncId
        },
        req.permission
      );

      return result;
    }
  });

  // Only register import route if the destination supports it
  if (syncOptions.canImportCertificates) {
    server.route({
      method: "POST",
      url: "/:pkiSyncId/import",
      config: {
        rateLimit: writeLimit
      },
      schema: {
        hide: false,
        operationId: `import${destinationNameForOpId}PkiSyncCertificates`,
        tags: [ApiDocsTags.PkiSyncs],
        description: `Import certificates from the specified ${destinationName} PKI Sync destination.`,
        params: z.object({
          pkiSyncId: z.string()
        }),
        response: {
          200: z.object({ message: z.string() })
        }
      },
      onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
      handler: async (req) => {
        const { pkiSyncId } = req.params;

        const result = await server.services.pkiSync.triggerPkiSyncImportCertificatesById(
          {
            id: pkiSyncId
          },
          req.permission
        );

        return result;
      }
    });
  }

  server.route({
    method: "POST",
    url: "/:pkiSyncId/remove-certificates",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: `remove${destinationNameForOpId}PkiSyncCertificates`,
      tags: [ApiDocsTags.PkiSyncs],
      description: `Remove certificates from the specified ${destinationName} PKI Sync destination.`,
      params: z.object({
        pkiSyncId: z.string()
      }),
      response: {
        200: z.object({ message: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { pkiSyncId } = req.params;

      const result = await server.services.pkiSync.triggerPkiSyncRemoveCertificatesById(
        {
          id: pkiSyncId
        },
        req.permission
      );

      return result;
    }
  });
};
