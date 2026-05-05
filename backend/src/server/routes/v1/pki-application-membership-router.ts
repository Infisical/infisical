import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { ApplicationIdParamsSchema } from "./pki-application-schemas";

const ApplicationMemberSchema = z.object({
  membershipId: z.string().uuid(),
  applicationId: z.string().uuid(),
  actorUserId: z.string().uuid().nullable().optional(),
  actorIdentityId: z.string().uuid().nullable().optional(),
  actorGroupId: z.string().uuid().nullable().optional(),
  role: z.string(),
  customRoleId: z.string().uuid().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  details: z
    .object({
      name: z.string().nullable(),
      email: z.string().nullable().optional(),
      username: z.string().nullable().optional(),
      authMethod: z.string().nullable().optional(),
      slug: z.string().nullable().optional()
    })
    .nullable()
    .optional()
});

export const registerPkiApplicationMembershipRoutes = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:applicationId/memberships",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listPkiApplicationMembers",
      description: "List members of a Cert Manager application.",
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
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
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
    url: "/:applicationId/memberships",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "addPkiApplicationMember",
      description: "Add a user, identity, or group as a member of a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: ApplicationIdParamsSchema,
      body: z
        .object({
          userId: z.string().uuid().optional(),
          identityId: z.string().uuid().optional(),
          groupId: z.string().uuid().optional(),
          role: z.string().min(1)
        })
        .refine(
          (data) => [data.userId, data.identityId, data.groupId].filter(Boolean).length === 1,
          "Exactly one of userId, identityId, or groupId must be provided."
        ),
      response: { 200: z.object({ membership: ApplicationMemberSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pkiApplicationMembership.addMember({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId,
        userId: req.body.userId,
        identityId: req.body.identityId,
        groupId: req.body.groupId,
        role: req.body.role
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.ADD_PKI_APPLICATION_MEMBER,
          metadata: {
            applicationId: membership.applicationId,
            membershipId: membership.membershipId,
            userId: membership.actorUserId ?? undefined,
            identityId: membership.actorIdentityId ?? undefined,
            groupId: membership.actorGroupId ?? undefined,
            role: membership.role
          }
        }
      });

      return { membership };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:applicationId/memberships/:membershipId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "updatePkiApplicationMemberRole",
      description: "Update the role of a member on a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({
        applicationId: z.string().uuid(),
        membershipId: z.string().uuid()
      }),
      body: z.object({
        role: z.string().min(1)
      }),
      response: { 200: z.object({ membership: ApplicationMemberSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.pkiApplicationMembership.updateMemberRole({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId,
        membershipId: req.params.membershipId,
        role: req.body.role
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
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
    url: "/:applicationId/memberships/:membershipId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "removePkiApplicationMember",
      description: "Remove a member from a Cert Manager application.",
      tags: [ApiDocsTags.PkiApplications],
      params: z.object({
        applicationId: z.string().uuid(),
        membershipId: z.string().uuid()
      }),
      response: {
        200: z.object({
          membershipId: z.string().uuid(),
          applicationId: z.string().uuid()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiApplicationMembership.removeMember({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.certManagerProjectId,
        applicationId: req.params.applicationId,
        membershipId: req.params.membershipId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.certManagerProjectId,
        event: {
          type: EventType.REMOVE_PKI_APPLICATION_MEMBER,
          metadata: {
            applicationId: result.applicationId,
            membershipId: result.membershipId
          }
        }
      });

      return result;
    }
  });
};
