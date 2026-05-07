import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { ApplicationIdParamsSchema } from "../pki-application-schemas";
import { ApplicationMemberSchema, RemoveResponseSchema, RoleBodySchema } from "./schemas";

const UserParamsSchema = z.object({
  applicationId: z.string().uuid(),
  userId: z.string().uuid()
});

export const registerPkiApplicationUserMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:applicationId/users",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listPkiApplicationUserMembers",
      description: "List user members of a Cert Manager application.",
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
        kind: "user"
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
    url: "/:applicationId/users/:userId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "addPkiApplicationUserMember",
      description: "Add a user as a member of a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: UserParamsSchema,
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
        userId: req.params.userId,
        role: req.body.role
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.ADD_PKI_APPLICATION_MEMBER,
          metadata: {
            applicationId: membership.applicationId,
            membershipId: membership.membershipId,
            userId: membership.actorUserId ?? undefined,
            role: membership.role
          }
        }
      });

      return { membership };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:applicationId/users/:userId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updatePkiApplicationUserMemberRole",
      description: "Update the role of a user member on a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: UserParamsSchema,
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
        kind: "user",
        memberId: req.params.userId,
        role: req.body.role
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.UPDATE_PKI_APPLICATION_MEMBER_ROLE,
          metadata: {
            applicationId: membership.applicationId,
            membershipId: membership.membershipId,
            role: membership.role
          }
        }
      });

      return { membership };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:applicationId/users/:userId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "removePkiApplicationUserMember",
      description: "Remove a user from a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: UserParamsSchema,
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
        kind: "user",
        memberId: req.params.userId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.internalCertManagerProjectId,
        event: {
          type: EventType.REMOVE_PKI_APPLICATION_MEMBER,
          metadata: { applicationId: result.applicationId, membershipId: result.membershipId }
        }
      });

      return result;
    }
  });
};
