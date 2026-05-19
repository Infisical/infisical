import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPkiApplicationAcmeEnrollmentRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "PUT",
    url: "/:applicationId/profiles/:profileId/enrollment/acme",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "setPkiApplicationAcmeEnrollment",
      description: "Enable or update the ACME enrollment method for a profile on an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }),
      body: z
        .object({
          skipDnsOwnershipVerification: z.boolean().optional().default(false),
          skipEabBinding: z.boolean().optional().default(false)
        })
        .refine((v) => !(v.skipDnsOwnershipVerification && v.skipEabBinding), {
          message: "skipDnsOwnershipVerification and skipEabBinding cannot both be enabled — pick at most one.",
          path: ["skipEabBinding"]
        }),
      response: {
        200: z.object({
          applicationId: z.string().uuid(),
          profileId: z.string().uuid(),
          acme: z.object({
            id: z.string().uuid(),
            skipDnsOwnershipVerification: z.boolean(),
            skipEabBinding: z.boolean()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.setAcmeEnrollment({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        profileId: req.params.profileId,
        config: {
          skipDnsOwnershipVerification: req.body.skipDnsOwnershipVerification,
          skipEabBinding: req.body.skipEabBinding
        }
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.SET_PKI_APPLICATION_ACME_ENROLLMENT,
          metadata: {
            applicationId: req.params.applicationId,
            profileId: req.params.profileId,
            skipDnsOwnershipVerification: result.acme.skipDnsOwnershipVerification,
            skipEabBinding: result.acme.skipEabBinding
          }
        }
      });
      return result;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId/profiles/:profileId/enrollment/acme",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "clearPkiApplicationAcmeEnrollment",
      description: "Disable the ACME enrollment method for a profile on an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }),
      response: { 200: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.clearAcmeEnrollment({
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
          type: EventType.CLEAR_PKI_APPLICATION_ACME_ENROLLMENT,
          metadata: { applicationId: req.params.applicationId, profileId: req.params.profileId }
        }
      });
      return result;
    }
  });

  server.route({
    method: "POST",
    url: "/:applicationId/profiles/:profileId/enrollment/acme/eab/reveal",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "revealPkiApplicationAcmeEabSecret",
      description: "Reveal the ACME EAB secret for a profile on an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }),
      response: {
        200: z.object({
          applicationId: z.string().uuid(),
          profileId: z.string().uuid(),
          eabKid: z.string(),
          eabSecret: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.revealAcmeEabSecret({
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
          type: EventType.REVEAL_PKI_APPLICATION_ACME_EAB_SECRET,
          metadata: { applicationId: req.params.applicationId, profileId: req.params.profileId }
        }
      });
      return result;
    }
  });

  server.route({
    method: "POST",
    url: "/:applicationId/profiles/:profileId/enrollment/acme/eab/rotate",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "rotatePkiApplicationAcmeEabSecret",
      description: "Rotate the ACME EAB secret for a profile on an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }),
      response: { 200: z.object({ applicationId: z.string().uuid(), profileId: z.string().uuid() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationEnrollment.rotateAcmeEabSecret({
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
          type: EventType.ROTATE_PKI_APPLICATION_ACME_EAB_SECRET,
          metadata: { applicationId: req.params.applicationId, profileId: req.params.profileId }
        }
      });
      return result;
    }
  });
};
