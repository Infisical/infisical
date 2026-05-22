import RE2 from "re2";
import { z } from "zod";

import { PamProjectRecordingConfigsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamRecordingStorageBackend } from "@app/ee/services/pam-session-recording-storage/pam-session-recording-storage-enums";
import { TPamRecordingResolvedConfig } from "@app/ee/services/pam-session-recording-storage/pam-session-recording-storage-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { AuthMode } from "@app/services/auth/auth-type";

const StorageBackendEnum = z.nativeEnum(PamRecordingStorageBackend);

const SanitizedConfigSchema = PamProjectRecordingConfigsSchema.pick({
  id: true,
  projectId: true,
  storageBackend: true,
  connectionId: true,
  bucket: true,
  region: true,
  keyPrefix: true,
  createdAt: true,
  updatedAt: true
});

const UpsertBodySchema = z.object({
  storageBackend: StorageBackendEnum,
  connectionId: z.string().uuid(),
  bucket: z.string().trim().min(1).max(255),
  region: z.nativeEnum(AWSRegion),
  keyPrefix: z
    .string()
    .trim()
    .max(255)
    .regex(
      new RE2(/^[a-zA-Z0-9\-_/]+$/),
      "Key prefix may only contain letters, numbers, hyphens, underscores, and slashes"
    )
    .nullable()
    .optional()
});

export const registerPamRecordingConfigRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/projects/:projectId/recording-config",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({ projectId: z.string().uuid() }),
      response: {
        200: z.object({
          config: SanitizedConfigSchema.nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { config } = await server.services.pamProjectRecordingConfig.getConfig(
        { projectId: req.params.projectId },
        req.permission
      );
      return { config };
    }
  });

  server.route({
    method: "POST",
    url: "/projects/:projectId/recording-config",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ projectId: z.string().uuid() }),
      body: UpsertBodySchema,
      response: {
        200: z.object({ config: SanitizedConfigSchema, corsProbeUrl: z.string().nullable() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const upsertInput = { projectId: req.params.projectId, ...req.body };

      let resolvedConfig: TPamRecordingResolvedConfig | undefined;
      try {
        ({ resolvedConfig } = await server.services.pamProjectRecordingConfig.testConfig(upsertInput, req.permission));
      } catch (err) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId: req.params.projectId,
          event: {
            type: EventType.PAM_RECORDING_BUCKET_CONNECTION_TEST_FAILED,
            metadata: {
              projectId: req.params.projectId,
              storageBackend: req.body.storageBackend,
              bucket: req.body.bucket,
              region: req.body.region,
              reason: (err as Error)?.message ?? "unknown"
            }
          }
        });
        throw err;
      }

      const { config, corsProbeUrl } = await server.services.pamProjectRecordingConfig.upsertConfig(
        upsertInput,
        req.permission,
        resolvedConfig
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.params.projectId,
        event: {
          type: EventType.PAM_RECORDING_CONFIG_UPDATE,
          metadata: {
            projectId: req.params.projectId,
            storageBackend: req.body.storageBackend,
            bucket: req.body.bucket,
            region: req.body.region
          }
        }
      });

      return { config, corsProbeUrl };
    }
  });

  server.route({
    method: "DELETE",
    url: "/projects/:projectId/recording-config",
    config: { rateLimit: writeLimit },
    schema: {
      params: z.object({ projectId: z.string().uuid() }),
      response: { 200: z.object({ ok: z.literal(true) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pamProjectRecordingConfig.deleteConfig(
        { projectId: req.params.projectId },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.params.projectId,
        event: {
          type: EventType.PAM_RECORDING_CONFIG_DELETE,
          metadata: { projectId: req.params.projectId }
        }
      });

      return result;
    }
  });
};
