import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const ApiEnrollmentSchema = z.object({
  id: z.string().uuid(),
  autoRenew: z.boolean(),
  renewBeforeDays: z.number().int().nullable()
});

export const registerPkiApplicationApiEnrollmentRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "PUT",
    url: "/:applicationId/profiles/:profileId/enrollment/api",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "setPkiApplicationApiEnrollment",
      description: "Enable or update the API enrollment method for a profile on a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({
        applicationId: z.string().uuid(),
        profileId: z.string().uuid()
      }),
      body: z.object({
        autoRenew: z.boolean().default(false),
        renewBeforeDays: z.number().int().min(1).max(365).optional()
      }),
      response: {
        200: z.object({
          applicationId: z.string().uuid(),
          profileId: z.string().uuid(),
          api: ApiEnrollmentSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.setApiEnrollment({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId,
        config: {
          autoRenew: req.body.autoRenew,
          renewBeforeDays: req.body.renewBeforeDays
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.SET_PKI_APPLICATION_API_ENROLLMENT,
          metadata: {
            applicationId: req.params.applicationId,
            profileId: req.params.profileId,
            autoRenew: result.api.autoRenew,
            renewBeforeDays: result.api.renewBeforeDays
          }
        }
      });

      return result;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId/profiles/:profileId/enrollment/api",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "clearPkiApplicationApiEnrollment",
      description: "Disable the API enrollment method for a profile on a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({
        applicationId: z.string().uuid(),
        profileId: z.string().uuid()
      }),
      response: {
        200: z.object({
          applicationId: z.string().uuid(),
          profileId: z.string().uuid()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.clearApiEnrollment({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.CLEAR_PKI_APPLICATION_API_ENROLLMENT,
          metadata: {
            applicationId: req.params.applicationId,
            profileId: req.params.profileId
          }
        }
      });

      return result;
    }
  });
};
