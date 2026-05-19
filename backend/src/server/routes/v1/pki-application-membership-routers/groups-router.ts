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

const GroupParamsSchema = z.object({
  applicationId: z.string().uuid(),
  groupId: z.string().uuid()
});

export const registerPkiApplicationGroupMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:applicationId/groups",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listPkiApplicationGroupMembers",
      description: "List group members of an application.",
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
        kind: ApplicationMemberKind.Group
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
    url: "/:applicationId/groups/:groupId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "addPkiApplicationGroupMember",
      description: "Add a group as a member of an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: GroupParamsSchema,
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
        groupId: req.params.groupId,
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
            groupId: membership.actorGroupId ?? undefined,
            groupName: membership.details?.name ?? undefined,
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
    url: "/:applicationId/groups/:groupId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updatePkiApplicationGroupMemberRole",
      description: "Update the role of a group member on an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: GroupParamsSchema,
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
        kind: ApplicationMemberKind.Group,
        memberId: req.params.groupId,
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
            groupId: membership.actorGroupId ?? undefined,
            groupName: membership.details?.name ?? undefined,
            role: membership.role
          }
        }
      });

      return { membership };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId/groups/:groupId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "removePkiApplicationGroupMember",
      description: "Remove a group from an application.",
      tags: [ApiDocsTags.PkiApplications],
      params: GroupParamsSchema,
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
        kind: ApplicationMemberKind.Group,
        memberId: req.params.groupId
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
            groupId: result.actorGroupId ?? undefined,
            groupName: result.details?.name ?? undefined
          }
        }
      });

      return { membershipId: result.membershipId, applicationId: result.applicationId };
    }
  });
};
