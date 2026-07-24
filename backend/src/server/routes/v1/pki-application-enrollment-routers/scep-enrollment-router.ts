import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ScepChallengeType } from "@app/ee/services/pki-scep/challenge";
import { ApiDocsTags } from "@app/lib/api-docs";
import { writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerPkiApplicationScepEnrollmentRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "PUT",
    url: "/:applicationId/profiles/:profileId/enrollment/scep",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "setPkiApplicationScepEnrollment",
      description: "Enable or update the SCEP enrollment method for a profile on an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }),
      body: z.object({
        challengeType: z.nativeEnum(ScepChallengeType).optional(),
        challengePassword: z.string().optional(),
        includeCaCertInResponse: z.boolean().optional().default(true),
        allowCertBasedRenewal: z.boolean().optional().default(true),
        dynamicChallengeExpiryMinutes: z.number().int().min(5).max(1440).optional(),
        dynamicChallengeMaxPending: z.number().int().min(1).max(1000).optional(),
        validationConnectionId: z.string().uuid().optional(),
        signRaWithCa: z.boolean().optional()
      }),
      response: {
        200: z.object({
          applicationId: z.string().uuid(),
          profileId: z.string().uuid(),
          scep: z.object({ id: z.string().uuid(), challengeType: z.nativeEnum(ScepChallengeType) })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.setScepEnrollment({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        actorRootOrgId: req.permission.rootOrgId,
        actorParentOrgId: req.permission.parentOrgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId,
        config: req.body
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.SET_PKI_APPLICATION_SCEP_ENROLLMENT,
          metadata: {
            applicationId: req.params.applicationId,
            profileId: req.params.profileId,
            challengeType: result.scep.challengeType,
            signRaWithCa: result.signRaWithCa,
            ...(result.validationConnection && {
              validationConnectionId: result.validationConnection.id,
              validationConnectionName: result.validationConnection.name ?? undefined
            })
          }
        }
      });
      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.EnrollmentMethodConfigured,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          enrollmentMethod: "scep",
          orgId: req.permission.orgId
        }
      });

      return result;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId/profiles/:profileId/enrollment/scep",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "clearPkiApplicationScepEnrollment",
      description: "Disable the SCEP enrollment method for a profile on an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }),
      response: { 200: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.clearScepEnrollment({
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
          type: EventType.CLEAR_PKI_APPLICATION_SCEP_ENROLLMENT,
          metadata: { applicationId: req.params.applicationId, profileId: req.params.profileId }
        }
      });
      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.EnrollmentMethodRemoved,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          enrollmentMethod: "scep",
          orgId: req.permission.orgId
        }
      });

      return result;
    }
  });
};
