import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { openApiHidden } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PkiSync, PkiSyncStatus } from "@app/services/pki-sync/pki-sync-enums";
import { PKI_SYNC_NAME_MAP } from "@app/services/pki-sync/pki-sync-maps";
import { getPkiSyncTargetHost } from "@app/services/pki-sync/pki-sync-target-host-fns";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerSyncPkiEndpoints = ({
  server,
  destination,
  createSchema,
  updateSchema,
  responseSchema,
  syncOptions,
  healthCheckTestSchema,
  enableOperationId = true
}: {
  destination: PkiSync;
  server: FastifyZodProvider;
  createSchema: z.ZodType<{
    name: string;
    projectId?: string;
    applicationId?: string;
    connectionId: string;
    destinationConfig: Record<string, unknown>;
    syncOptions?: Record<string, unknown>;
    credentials?: { exportPassword?: string };
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
  healthCheckTestSchema?: z.ZodType<{
    connectionId: string;
    applicationId?: string;
    syncId?: string;
    certificateIds?: string[];
    destinationConfig: Record<string, unknown>;
    syncOptions: Record<string, unknown>;
  }>;
  responseSchema: z.ZodTypeAny;
  syncOptions: {
    canImportCertificates: boolean;
    canRemoveCertificates: boolean;
    canRunHealthCheckCommand: boolean;
  };
  enableOperationId?: boolean;
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
      ...(enableOperationId ? { operationId: `list${destinationNameForOpId}PkiSyncs` } : {}),
      tags: [ApiDocsTags.PkiSyncs],
      description: `List the ${destinationName} PKI Syncs for the specified project.`,
      querystring: z.object({
        projectId: z.string().trim().optional().describe(openApiHidden())
      }),
      response: {
        200: z.object({ pkiSyncs: responseSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;

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
      ...(enableOperationId ? { operationId: `get${destinationNameForOpId}PkiSync` } : {}),
      tags: [ApiDocsTags.PkiSyncs],
      description: `Get the specified ${destinationName} PKI Sync by ID.`,
      params: z.object({
        pkiSyncId: z.string()
      }),
      response: {
        200: responseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
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
            destination,
            ...(pkiSync.applicationId && { applicationId: pkiSync.applicationId })
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
      ...(enableOperationId ? { operationId: `create${destinationNameForOpId}PkiSync` } : {}),
      tags: [ApiDocsTags.PkiSyncs],
      description: `Create a ${destinationName} PKI Sync for the specified project.`,
      body: createSchema,
      response: {
        200: responseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const pkiSync = await server.services.pkiSync.createPkiSync(
        { ...req.body, projectId: req.body.projectId ?? req.internalCertManagerProjectId, destination },
        req.permission
      );

      const targetHost = getPkiSyncTargetHost(pkiSync.destinationConfig);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiSync.projectId,
        event: {
          type: EventType.CREATE_PKI_SYNC,
          metadata: {
            pkiSyncId: pkiSync.id,
            name: pkiSync.name,
            destination,
            connectionId: pkiSync.connectionId,
            connectionName: pkiSync.appConnectionName,
            ...(targetHost && { targetHost }),
            hasCredentials: Boolean(req.body.credentials?.exportPassword),
            hasPostSyncCommand: Boolean(req.body.syncOptions?.postSyncCommand),
            hasHealthCheckCommand: Boolean(req.body.syncOptions?.healthCheckCommand),
            ...(pkiSync.applicationId && { applicationId: pkiSync.applicationId })
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.PkiSyncCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId,
          projectId: pkiSync.projectId,
          destination,
          isAutoSyncEnabled: pkiSync.isAutoSyncEnabled
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
      ...(enableOperationId ? { operationId: `update${destinationNameForOpId}PkiSync` } : {}),
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const { pkiSyncId } = req.params;

      const pkiSync = await server.services.pkiSync.updatePkiSync({ ...req.body, id: pkiSyncId }, req.permission);

      const targetHost = getPkiSyncTargetHost(pkiSync.destinationConfig);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiSync.projectId,
        event: {
          type: EventType.UPDATE_PKI_SYNC,
          metadata: {
            pkiSyncId,
            name: pkiSync.name,
            ...(pkiSync.applicationId && { applicationId: pkiSync.applicationId }),
            destination: pkiSync.destination,
            connectionId: pkiSync.connectionId,
            connectionName: pkiSync.appConnectionName,
            ...(targetHost && { targetHost }),
            hasPostSyncCommand: Boolean(pkiSync.syncOptions?.postSyncCommand),
            hasHealthCheckCommand: Boolean(pkiSync.syncOptions?.healthCheckCommand)
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.PkiSyncUpdated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId,
          projectId: pkiSync.projectId,
          destination: pkiSync.destination,
          isAutoSyncEnabled: pkiSync.isAutoSyncEnabled
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
      ...(enableOperationId ? { operationId: `delete${destinationNameForOpId}PkiSync` } : {}),
      tags: [ApiDocsTags.PkiSyncs],
      description: `Delete the specified ${destinationName} PKI Sync.`,
      params: z.object({
        pkiSyncId: z.string()
      }),
      response: {
        200: responseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
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
            destination: pkiSync.destination,
            ...(pkiSync.applicationId && { applicationId: pkiSync.applicationId })
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.PkiSyncDeleted,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId,
          projectId: pkiSync.projectId,
          destination: pkiSync.destination
        }
      });

      return pkiSync;
    }
  });

  const HealthCheckResponseSchema = z.object({
    healthCheck: z.object({
      status: z.nativeEnum(PkiSyncStatus),
      exitCode: z.number().optional(),
      timedOut: z.boolean().optional(),
      durationMs: z.number(),
      output: z.string().optional(),
      failureDetail: z.string().optional(),
      message: z.string().optional()
    })
  });

  if (syncOptions.canRunHealthCheckCommand && healthCheckTestSchema) {
    server.route({
      method: "POST",
      url: "/test-health-check",
      config: {
        rateLimit: writeLimit
      },
      schema: {
        hide: false,
        ...(enableOperationId ? { operationId: `test${destinationNameForOpId}PkiSyncHealthCheck` } : {}),
        tags: [ApiDocsTags.PkiSyncs],
        description: `Run a health check command against a ${destinationName} host without saving it to a sync.`,
        body: healthCheckTestSchema,
        response: {
          200: HealthCheckResponseSchema
        }
      },
      onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
      handler: async (req) => {
        const healthCheck = await server.services.pkiSync.testPkiSyncHealthCheckCommand(
          {
            destination,
            connectionId: req.body.connectionId,
            applicationId: req.body.applicationId,
            syncId: req.body.syncId,
            certificateIds: req.body.certificateIds,
            destinationConfig: req.body.destinationConfig,
            syncOptions: req.body.syncOptions,
            projectId: req.internalCertManagerProjectId
          },
          req.permission,
          req.auditLogInfo
        );

        return { healthCheck };
      }
    });

    server.route({
      method: "POST",
      url: "/:pkiSyncId/run-health-check",
      config: {
        rateLimit: writeLimit
      },
      schema: {
        hide: false,
        ...(enableOperationId ? { operationId: `run${destinationNameForOpId}PkiSyncHealthCheck` } : {}),
        tags: [ApiDocsTags.PkiSyncs],
        description: `Run the configured health check for the specified ${destinationName} PKI Sync without delivering certificates.`,
        params: z.object({
          pkiSyncId: z.string().uuid()
        }),
        response: {
          200: HealthCheckResponseSchema
        }
      },
      onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
      handler: async (req) => {
        const healthCheck = await server.services.pkiSync.runPkiSyncHealthCheckById(
          { id: req.params.pkiSyncId },
          req.permission,
          req.auditLogInfo
        );

        return { healthCheck };
      }
    });
  }

  server.route({
    method: "POST",
    url: "/:pkiSyncId/sync",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: `sync${destinationNameForOpId}PkiSync` } : {}),
      tags: [ApiDocsTags.PkiSyncs],
      description: `Trigger a sync for the specified ${destinationName} PKI Sync.`,
      params: z.object({
        pkiSyncId: z.string()
      }),
      response: {
        200: z.object({ message: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
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
        ...(enableOperationId ? { operationId: `import${destinationNameForOpId}PkiSyncCertificates` } : {}),
        tags: [ApiDocsTags.PkiSyncs],
        description: `Import certificates from the specified ${destinationName} PKI Sync destination.`,
        params: z.object({
          pkiSyncId: z.string()
        }),
        response: {
          200: z.object({ message: z.string() })
        }
      },
      onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
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

  // Only register remove route if the destination supports it
  if (syncOptions.canRemoveCertificates) {
    server.route({
      method: "POST",
      url: "/:pkiSyncId/remove-certificates",
      config: {
        rateLimit: writeLimit
      },
      schema: {
        hide: false,
        ...(enableOperationId ? { operationId: `remove${destinationNameForOpId}PkiSyncCertificates` } : {}),
        tags: [ApiDocsTags.PkiSyncs],
        description: `Remove certificates from the specified ${destinationName} PKI Sync destination.`,
        params: z.object({
          pkiSyncId: z.string()
        }),
        response: {
          200: z.object({ message: z.string() })
        }
      },
      onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
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
  }
};
