import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { ApplicationIdParamsSchema, ApplicationProfileSchema } from "./pki-application-schemas";

export const registerPkiApplicationProfileRoutes = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:applicationId/profiles",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listPkiApplicationProfiles",
      description: "List profiles attached to a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: ApplicationIdParamsSchema,
      response: {
        200: z.object({ profiles: z.array(ApplicationProfileSchema) })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const profiles = await server.services.pkiApplication.listApplicationProfiles({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId
      });

      return { profiles };
    }
  });

  server.route({
    method: "POST",
    url: "/:applicationId/profiles",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "attachPkiApplicationProfiles",
      description: "Attach one or more profiles to a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: ApplicationIdParamsSchema,
      body: z.object({
        profileIds: z.array(z.string().uuid()).min(1)
      }),
      response: {
        200: z.object({ profiles: z.array(ApplicationProfileSchema) })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const profiles = await server.services.pkiApplication.attachProfiles({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        profileIds: req.body.profileIds
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.ATTACH_PKI_APPLICATION_PROFILES,
          metadata: {
            applicationId: req.params.applicationId,
            profileIds: req.body.profileIds
          }
        }
      });

      return { profiles };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId/profiles/:profileId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "detachPkiApplicationProfile",
      description: "Detach a profile from a Cert Manager application.",
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
      const result = await server.services.pkiApplication.detachProfile({
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
          type: EventType.DETACH_PKI_APPLICATION_PROFILE,
          metadata: {
            applicationId: result.applicationId,
            profileId: result.profileId
          }
        }
      });

      return result;
    }
  });
};
