import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { SecretSyncs } from "@app/lib/api-docs";
import { startsWithVowel } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { SecretSync, SecretSyncImportBehavior } from "@app/services/secret-sync/secret-sync-enums";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import { TSecretSync, TSecretSyncInput } from "@app/services/secret-sync/secret-sync-types";

export const registerSyncSecretsEndpoints = <T extends TSecretSync, I extends TSecretSyncInput>({
  server,
  destination,
  createSchema,
  updateSchema,
  responseSchema
}: {
  destination: SecretSync;
  server: FastifyZodProvider;
  createSchema: z.ZodType<{
    name: string;
    environment: string;
    secretPath: string;
    projectId: string;
    connectionId: string;
    destinationConfig: I["destinationConfig"];
    syncOptions: I["syncOptions"];
    description?: string | null;
    isAutoSyncEnabled?: boolean;
  }>;
  updateSchema: z.ZodType<{
    connectionId?: string;
    name?: string;
    environment?: string;
    secretPath?: string;
    destinationConfig?: I["destinationConfig"];
    syncOptions?: I["syncOptions"];
    description?: string | null;
    isAutoSyncEnabled?: boolean;
  }>;
  responseSchema: z.ZodTypeAny;
}) => {
  const destinationName = SECRET_SYNC_NAME_MAP[destination];

  server.route({
    method: "GET",
    url: `/`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: `List the ${destinationName} Syncs for the specified project.`,
      querystring: z.object({
        projectId: z.string().trim().min(1, "Project ID required").describe(SecretSyncs.LIST(destination).projectId)
      }),
      response: {
        200: z.object({ secretSyncs: responseSchema.array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const {
        query: { projectId }
      } = req;

      const secretSyncs = (await server.services.secretSync.listSecretSyncsByProjectId(
        { projectId, destination },
        req.permission
      )) as T[];

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_SECRET_SYNCS,
          metadata: {
            destination,
            count: secretSyncs.length,
            syncIds: secretSyncs.map((connection) => connection.id)
          }
        }
      });

      return { secretSyncs };
    }
  });

  server.route({
    method: "GET",
    url: "/:syncId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: `Get the specified ${destinationName} Sync by ID.`,
      params: z.object({
        syncId: z.string().uuid().describe(SecretSyncs.GET_BY_ID(destination).syncId)
      }),
      response: {
        200: z.object({ secretSync: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { syncId } = req.params;

      const secretSync = (await server.services.secretSync.findSecretSyncById(
        { syncId, destination },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: secretSync.projectId,
        event: {
          type: EventType.GET_SECRET_SYNC,
          metadata: {
            syncId,
            destination
          }
        }
      });

      return { secretSync };
    }
  });

  server.route({
    method: "GET",
    url: `/sync-name/:syncName`,
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: `Get the specified ${destinationName} Sync by name and project ID.`,
      params: z.object({
        syncName: z.string().trim().min(1, "Sync name required").describe(SecretSyncs.GET_BY_NAME(destination).syncName)
      }),
      querystring: z.object({
        projectId: z
          .string()
          .trim()
          .min(1, "Project ID required")
          .describe(SecretSyncs.GET_BY_NAME(destination).projectId)
      }),
      response: {
        200: z.object({ secretSync: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { syncName } = req.params;
      const { projectId } = req.query;

      const secretSync = (await server.services.secretSync.findSecretSyncByName(
        { syncName, projectId, destination },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_SECRET_SYNC,
          metadata: {
            syncId: secretSync.id,
            destination
          }
        }
      });

      return { secretSync };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: `Create ${
        startsWithVowel(destinationName) ? "an" : "a"
      } ${destinationName} Sync for the specified project environment.`,
      body: createSchema,
      response: {
        200: z.object({ secretSync: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secretSync = (await server.services.secretSync.createSecretSync(
        { ...req.body, destination },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: secretSync.projectId,
        event: {
          type: EventType.CREATE_SECRET_SYNC,
          metadata: {
            syncId: secretSync.id,
            destination,
            ...req.body
          }
        }
      });

      return { secretSync };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:syncId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: `Update the specified ${destinationName} Sync.`,
      params: z.object({
        syncId: z.string().uuid().describe(SecretSyncs.UPDATE(destination).syncId)
      }),
      body: updateSchema,
      response: {
        200: z.object({ secretSync: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { syncId } = req.params;

      const secretSync = (await server.services.secretSync.updateSecretSync(
        { ...req.body, syncId, destination },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: secretSync.projectId,
        event: {
          type: EventType.UPDATE_SECRET_SYNC,
          metadata: {
            syncId,
            destination,
            ...req.body
          }
        }
      });

      return { secretSync };
    }
  });

  server.route({
    method: "DELETE",
    url: `/:syncId`,
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: `Delete the specified ${destinationName} Sync.`,
      params: z.object({
        syncId: z.string().uuid().describe(SecretSyncs.DELETE(destination).syncId)
      }),
      querystring: z.object({
        removeSecrets: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true")
          .describe(SecretSyncs.DELETE(destination).removeSecrets)
      }),
      response: {
        200: z.object({ secretSync: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { syncId } = req.params;
      const { removeSecrets } = req.query;

      const secretSync = (await server.services.secretSync.deleteSecretSync(
        { destination, syncId, removeSecrets },
        req.permission
      )) as T;

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.DELETE_SECRET_SYNC,
          metadata: {
            destination,
            syncId,
            removeSecrets
          }
        }
      });

      return { secretSync };
    }
  });

  server.route({
    method: "POST",
    url: "/:syncId/sync-secrets",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: `Trigger a sync for the specified ${destinationName} Sync.`,
      params: z.object({
        syncId: z.string().uuid().describe(SecretSyncs.SYNC_SECRETS(destination).syncId)
      }),
      response: {
        200: z.object({ secretSync: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { syncId } = req.params;

      const secretSync = (await server.services.secretSync.triggerSecretSyncSyncSecretsById(
        {
          syncId,
          destination,
          auditLogInfo: req.auditLogInfo
        },
        req.permission
      )) as T;

      return { secretSync };
    }
  });

  server.route({
    method: "POST",
    url: "/:syncId/import-secrets",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: `Import secrets from the specified ${destinationName} Sync destination.`,
      params: z.object({
        syncId: z.string().uuid().describe(SecretSyncs.IMPORT_SECRETS(destination).syncId)
      }),
      querystring: z.object({
        importBehavior: z
          .nativeEnum(SecretSyncImportBehavior)
          .describe(SecretSyncs.IMPORT_SECRETS(destination).importBehavior)
      }),
      response: {
        200: z.object({ secretSync: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { syncId } = req.params;
      const { importBehavior } = req.query;

      const secretSync = (await server.services.secretSync.triggerSecretSyncImportSecretsById(
        {
          syncId,
          destination,
          importBehavior
        },
        req.permission
      )) as T;

      return { secretSync };
    }
  });

  server.route({
    method: "POST",
    url: "/:syncId/remove-secrets",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: `Remove previously synced secrets from the specified ${destinationName} Sync destination.`,
      params: z.object({
        syncId: z.string().uuid().describe(SecretSyncs.REMOVE_SECRETS(destination).syncId)
      }),
      response: {
        200: z.object({ secretSync: responseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { syncId } = req.params;

      const secretSync = (await server.services.secretSync.triggerSecretSyncRemoveSecretsById(
        {
          syncId,
          destination
        },
        req.permission
      )) as T;

      return { secretSync };
    }
  });
};
