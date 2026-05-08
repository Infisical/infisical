import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPkiApplicationEstEnrollmentRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "PUT",
    url: "/:applicationId/profiles/:profileId/enrollment/est",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "setPkiApplicationEstEnrollment",
      description: "Enable or update the EST enrollment method for a profile on a application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }),
      body: z.object({
        passphrase: z.string().min(8),
        disableBootstrapCaValidation: z.boolean().optional().default(false),
        caChain: z.string().optional()
      }),
      response: {
        200: z.object({
          applicationId: z.string().uuid(),
          profileId: z.string().uuid(),
          est: z.object({ id: z.string().uuid(), disableBootstrapCaValidation: z.boolean() })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.setEstEnrollment({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId,
        config: {
          passphrase: req.body.passphrase,
          disableBootstrapCaValidation: req.body.disableBootstrapCaValidation,
          caChain: req.body.caChain
        }
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.SET_PKI_APPLICATION_EST_ENROLLMENT,
          metadata: {
            applicationId: req.params.applicationId,
            profileId: req.params.profileId,
            disableBootstrapCaValidation: result.est.disableBootstrapCaValidation
          }
        }
      });
      return result;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId/profiles/:profileId/enrollment/est",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "clearPkiApplicationEstEnrollment",
      description: "Disable the EST enrollment method for a profile on a application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }),
      response: {
        200: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.clearEstEnrollment({
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
          type: EventType.CLEAR_PKI_APPLICATION_EST_ENROLLMENT,
          metadata: { applicationId: req.params.applicationId, profileId: req.params.profileId }
        }
      });
      return result;
    }
  });
};
