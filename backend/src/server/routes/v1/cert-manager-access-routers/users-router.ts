import { z } from "zod";

import {
  AccessScope,
  OrgMembershipRole,
  ProjectMembershipRole,
  ProjectMembershipsSchema,
  ProjectUserMembershipRolesSchema
} from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { SanitizedUserSchema } from "../../sanitizedSchemas";
import { MembershipRoleSchema, RolesUpdateBodySchema } from "./schemas";

export const registerCertManagerAccessUsersRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/users",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listCertManagerUsers",
      tags: [ApiDocsTags.ProjectUsers],
      description: "List Certificate Manager users.",
      response: {
        200: z.object({
          memberships: ProjectMembershipsSchema.extend({
            user: SanitizedUserSchema,
            roles: z.array(MembershipRoleSchema)
          })
            .omit({ updatedAt: true, projectId: true })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const { data: memberships } = await server.services.membershipUser.listMemberships({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        data: {}
      });
      return {
        memberships: memberships.map((el) => ({
          ...el,
          userId: el.actorUserId as string
        }))
      };
    }
  });

  server.route({
    method: "GET",
    url: "/users/:userId",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getCertManagerUser",
      params: z.object({ userId: z.string().trim().uuid() }),
      response: {
        200: z.object({
          membership: ProjectMembershipsSchema.extend({
            user: SanitizedUserSchema,
            roles: z.array(MembershipRoleSchema)
          }).omit({ updatedAt: true, projectId: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const { userId } = req.params;
      const membership = await server.services.membershipUser.getMembershipByUserId({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { userId }
      });
      return { membership: { ...membership, userId } };
    }
  });

  server.route({
    method: "POST",
    url: "/users",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "inviteCertManagerUsers",
      tags: [ApiDocsTags.ProjectUsers],
      description: "Invite users to Certificate Manager.",
      body: z.object({
        emails: z
          .string()
          .email()
          .array()
          .default([])
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Email must be lowercase"),
        usernames: z
          .string()
          .array()
          .default([])
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Username must be lowercase"),
        roleSlugs: z.string().array().min(1).optional()
      }),
      response: {
        200: z.object({ memberships: ProjectMembershipsSchema.omit({ projectId: true }).array() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const usernamesAndEmails = [...req.body.emails, ...req.body.usernames];

      await server.services.membershipUser.createMembership({
        permission: req.permission,
        scopeData: { scope: AccessScope.Organization, orgId: req.permission.orgId },
        data: {
          roles: [{ isTemporary: false, role: OrgMembershipRole.NoAccess }],
          usernames: usernamesAndEmails
        }
      });

      const { memberships } = await server.services.membershipUser.createMembership({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        data: {
          roles: (req.body.roleSlugs || [ProjectMembershipRole.Member]).map((role) => ({
            isTemporary: false,
            role
          })),
          usernames: usernamesAndEmails
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.INVITE_CERT_MANAGER_USERS,
          metadata: {
            emails: req.body.emails,
            usernames: req.body.usernames,
            userIds: memberships.map(({ actorUserId }) => actorUserId || ""),
            membershipIds: memberships.map(({ id }) => id),
            roleSlugs: req.body.roleSlugs
          }
        }
      });

      return {
        memberships: memberships.map((el) => ({ ...el, userId: el.actorUserId as string }))
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/users/:userId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "updateCertManagerUser",
      params: z.object({ userId: z.string().trim().uuid() }),
      body: RolesUpdateBodySchema,
      response: { 200: z.object({ roles: ProjectUserMembershipRolesSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const { userId } = req.params;
      const { membership } = await server.services.membershipUser.updateMembership({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { userId },
        data: { roles: req.body.roles }
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.UPDATE_CERT_MANAGER_USER,
          metadata: {
            userId,
            roles: req.body.roles.map((r) => r.role)
          }
        }
      });
      return {
        roles: membership.roles.map((el) => ({ ...el, projectMembershipId: membership.id }))
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/users",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "removeCertManagerUsers",
      body: z.object({
        emails: z
          .string()
          .email()
          .array()
          .default([])
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Email must be lowercase"),
        usernames: z
          .string()
          .array()
          .default([])
          .refine((val) => val.every((el) => el === el.toLowerCase()), "Username must be lowercase")
      }),
      response: { 200: z.object({ memberships: ProjectMembershipsSchema.omit({ projectId: true }).array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const memberships = await server.services.projectMembership.deleteProjectMemberships({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId,
        emails: req.body.emails,
        usernames: req.body.usernames
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.REMOVE_CERT_MANAGER_USERS_BATCH,
          metadata: {
            emails: req.body.emails,
            usernames: req.body.usernames,
            userIds: memberships.map((m) => m.actorUserId as string),
            membershipIds: memberships.map((m) => m.id)
          }
        }
      });
      return {
        memberships: memberships.map((el) => ({ ...el, userId: el.actorUserId as string }))
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/users/:userId",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "removeCertManagerUser",
      params: z.object({ userId: z.string().trim().uuid() }),
      response: { 200: z.object({ membership: ProjectMembershipsSchema.omit({ projectId: true }) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const { userId } = req.params;
      const { membership } = await server.services.membershipUser.deleteMembership({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { userId }
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.REMOVE_CERT_MANAGER_USER,
          metadata: { userId: membership.actorUserId as string, membershipId: membership.id }
        }
      });
      return { membership: { ...membership, userId } };
    }
  });
};
