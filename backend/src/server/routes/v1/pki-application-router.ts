import RE2 from "re2";
import { z } from "zod";

import { PkiApplicationsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerPkiApplicationAlertRoutes } from "./pki-application-alert-router";
import { registerPkiApplicationEnrollmentRoutes } from "./pki-application-enrollment-router";
import { registerPkiApplicationMembershipRoutes } from "./pki-application-membership-router";
import { registerPkiApplicationProfileRoutes } from "./pki-application-profile-router";
import { ApplicationIdParamsSchema, ApplicationProfileSchema } from "./pki-application-schemas";
import { registerPkiApplicationSyncRoutes } from "./pki-application-sync-router";

export { ApplicationProfileSchema };

const APPLICATION_NAME_REGEX = new RE2("^[a-z0-9-]+$");
const APPLICATION_NAME_MESSAGE = "Name must contain only lowercase letters, numbers, and hyphens";

const ApplicationListItemSchema = PkiApplicationsSchema.extend({
  profileCount: z.number().int().nonnegative(),
  memberCount: z.number().int().nonnegative(),
  certificateCount: z.number().int().nonnegative()
});

export const registerPkiApplicationRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "createPkiApplication",
      description: "Create a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      body: z.object({
        name: z.string().trim().min(1).max(64).regex(APPLICATION_NAME_REGEX, APPLICATION_NAME_MESSAGE),
        description: z.string().max(256).optional(),
        profileIds: z.array(z.string().uuid()).optional()
      }),
      response: {
        200: z.object({ application: PkiApplicationsSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const application = await server.services.pkiApplication.createApplication({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        name: req.body.name,
        description: req.body.description,
        profileIds: req.body.profileIds
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.CREATE_PKI_APPLICATION,
          metadata: {
            applicationId: application.id,
            name: application.name,
            profileIds: req.body.profileIds
          }
        }
      });

      return { application };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listPkiApplications",
      description: "List Cert Manager applications.",
      tags: [ApiDocsTags.PkiApplications],
      querystring: z.object({
        search: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0)
      }),
      response: {
        200: z.object({
          applications: z.array(ApplicationListItemSchema),
          total: z.number().int().nonnegative()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplication.listApplications({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        search: req.query.search,
        limit: req.query.limit,
        offset: req.query.offset
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.LIST_PKI_APPLICATIONS,
          metadata: { projectId: req.certManagerProjectId }
        }
      });

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/:applicationId",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getPkiApplication",
      description: "Get a Cert Manager application by id.",
      tags: [ApiDocsTags.PkiApplications],
      params: ApplicationIdParamsSchema,
      response: { 200: z.object({ application: PkiApplicationsSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const application = await server.services.pkiApplication.getApplicationById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.GET_PKI_APPLICATION,
          metadata: { applicationId: application.id, name: application.name }
        }
      });

      return { application };
    }
  });

  server.route({
    method: "GET",
    url: "/by-name/:name",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getPkiApplicationByName",
      description: "Get a Cert Manager application by name.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({ name: z.string().regex(APPLICATION_NAME_REGEX, APPLICATION_NAME_MESSAGE) }),
      response: { 200: z.object({ application: PkiApplicationsSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const application = await server.services.pkiApplication.getApplicationByName({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        name: req.params.name
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.GET_PKI_APPLICATION,
          metadata: { applicationId: application.id, name: application.name }
        }
      });

      return { application };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:applicationId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updatePkiApplication",
      description: "Update a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: ApplicationIdParamsSchema,
      body: z
        .object({
          name: z.string().trim().min(1).max(64).regex(APPLICATION_NAME_REGEX, APPLICATION_NAME_MESSAGE).optional(),
          description: z.string().max(256).nullable().optional()
        })
        .refine((d) => d.name !== undefined || d.description !== undefined, {
          message: "At least one of name or description must be provided."
        }),
      response: { 200: z.object({ application: PkiApplicationsSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const application = await server.services.pkiApplication.updateApplication({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId,
        name: req.body.name,
        description: req.body.description
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.UPDATE_PKI_APPLICATION,
          metadata: { applicationId: application.id, name: application.name }
        }
      });

      return { application };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "deletePkiApplication",
      description: "Delete a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: ApplicationIdParamsSchema,
      response: { 200: z.object({ application: PkiApplicationsSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const application = await server.services.pkiApplication.deleteApplication({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.DELETE_PKI_APPLICATION,
          metadata: { applicationId: application.id, name: application.name }
        }
      });

      return { application };
    }
  });

  await registerPkiApplicationProfileRoutes(server);
  await registerPkiApplicationMembershipRoutes(server);
  await registerPkiApplicationEnrollmentRoutes(server);
  await registerPkiApplicationAlertRoutes(server);
  await registerPkiApplicationSyncRoutes(server);
};
