import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { ApplicationMemberKind } from "@app/services/pki-application/pki-application-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { ApplicationIdParamsSchema } from "../pki-application-schemas";
import { ApplicationMemberSchema, RemoveResponseSchema, RoleBodySchema } from "./schemas";

const IdentityParamsSchema = z.object({
  applicationId: z.string().uuid(),
  identityId: z.string().uuid()
});

export const registerPkiApplicationIdentityMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:applicationId/identities",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listPkiApplicationIdentityMembers",
      description: "List identity members of an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: ApplicationIdParamsSchema,
      response: { 200: z.object({ memberships: z.array(ApplicationMemberSchema) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const memberships = await server.services.pkiApplicationMembership.listMembers({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        kind: ApplicationMemberKind.Identity
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.LIST_PKI_APPLICATION_MEMBERS,
          metadata: { applicationId: req.params.applicationId }
        }
      });

      return { memberships };
    }
  });

  server.route({
    method: "POST",
    url: "/:applicationId/identities/:identityId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "addPkiApplicationIdentityMember",
      description: "Add an identity as a member of an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: IdentityParamsSchema,
      body: RoleBodySchema,
      response: { 200: z.object({ membership: ApplicationMemberSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pkiApplicationMembership.addMember({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        identityId: req.params.identityId,
        role: req.body.role
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.ADD_PKI_APPLICATION_MEMBER,
          metadata: {
            applicationId: membership.applicationId,
            applicationName: membership.applicationName,
            membershipId: membership.membershipId,
            identityId: membership.actorIdentityId ?? undefined,
            identityName: membership.details?.name ?? undefined,
            role: membership.role
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.PkiApplicationMemberAdded,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          applicationId: req.params.applicationId,
          orgId: req.permission.orgId,
          role: req.body.role
        }
      });

      return { membership };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:applicationId/identities/:identityId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updatePkiApplicationIdentityMemberRole",
      description: "Update the role of an identity member on an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: IdentityParamsSchema,
      body: RoleBodySchema,
      response: { 200: z.object({ membership: ApplicationMemberSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pkiApplicationMembership.updateMemberRole({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        kind: ApplicationMemberKind.Identity,
        memberId: req.params.identityId,
        role: req.body.role
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.UPDATE_PKI_APPLICATION_MEMBER_ROLE,
          metadata: {
            applicationId: membership.applicationId,
            applicationName: membership.applicationName,
            membershipId: membership.membershipId,
            identityId: membership.actorIdentityId ?? undefined,
            identityName: membership.details?.name ?? undefined,
            role: membership.role
          }
        }
      });

      return { membership };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId/identities/:identityId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "removePkiApplicationIdentityMember",
      description: "Remove an identity from an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: IdentityParamsSchema,
      response: { 200: RemoveResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationMembership.removeMember({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.internalCertManagerProjectId,
        applicationId: req.params.applicationId,
        kind: ApplicationMemberKind.Identity,
        memberId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.REMOVE_PKI_APPLICATION_MEMBER,
          metadata: {
            applicationId: result.applicationId,
            applicationName: result.applicationName,
            membershipId: result.membershipId,
            identityId: result.actorIdentityId ?? undefined,
            identityName: result.details?.name ?? undefined
          }
        }
      });

      return { membershipId: result.membershipId, applicationId: result.applicationId };
    }
  });
};
