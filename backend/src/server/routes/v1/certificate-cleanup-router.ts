import { z } from "zod";

import { CertificateCleanupConfigsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { openApiHidden } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerCertificateCleanupRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getCertificateCleanupConfig",
      description: "Get certificate cleanup configuration for a project",
      tags: [ApiDocsTags.PkiCertificates],
      querystring: z.object({
        projectId: z.string().trim().optional().describe(openApiHidden())
      }),
      response: {
        200: z.object({
          config: CertificateCleanupConfigsSchema.omit({ id: true }).nullable()
        })
      }
    },
    handler: async (req) => {
      const config = await server.services.certificateCleanup.getConfig({
        projectId: req.internalCertManagerProjectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { config };
    }
  });

  server.route({
    method: "PUT",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "updateCertificateCleanupConfig",
      description: "Create or update certificate cleanup configuration for a project",
      tags: [ApiDocsTags.PkiCertificates],
      body: z.object({
        projectId: z.string().trim().optional().describe(openApiHidden()),
        isEnabled: z.boolean().optional().describe("Enable cleanup"),
        postExpiryRetentionDays: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe("Days after expiration before deletion"),
        skipCertsWithActiveSyncs: z.boolean().optional().describe("Skip certificates with active syncs")
      }),
      response: {
        200: z.object({
          config: CertificateCleanupConfigsSchema.omit({ id: true })
        })
      }
    },
    handler: async (req) => {
      const config = await server.services.certificateCleanup.updateConfig({
        projectId: req.internalCertManagerProjectId,
        isEnabled: req.body.isEnabled,
        postExpiryRetentionDays: req.body.postExpiryRetentionDays,
        skipCertsWithActiveSyncs: req.body.skipCertsWithActiveSyncs,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.UPDATE_CERTIFICATE_CLEANUP_CONFIG,
          metadata: {
            projectId: req.internalCertManagerProjectId,
            isEnabled: config.isEnabled,
            postExpiryRetentionDays: config.postExpiryRetentionDays,
            skipCertsWithActiveSyncs: config.skipCertsWithActiveSyncs
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.CertificateCleanupConfigured,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          isEnabled: config.isEnabled,
          orgId: req.permission.orgId
        }
      });

      return { config };
    }
  });
};
