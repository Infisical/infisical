import { z } from "zod";

import {
  AccessScope,
  GroupsSchema,
  ProjectMembershipRole,
  ProjectUserMembershipRolesSchema,
  TemporaryPermissionMode
} from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { RolesUpdateBodySchema } from "./schemas";

const certManagerGroupMembershipRoleSchema = z.object({
  id: z.string(),
  role: z.string(),
  customRoleId: z.string().optional().nullable(),
  customRoleName: z.string().optional().nullable(),
  customRoleSlug: z.string().optional().nullable(),
  isTemporary: z.boolean(),
  temporaryMode: z.string().optional().nullable(),
  temporaryRange: z.string().nullable().optional(),
  temporaryAccessStartTime: z.date().nullable().optional(),
  temporaryAccessEndTime: z.date().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

const certManagerGroupMembershipSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  group: GroupsSchema.pick({ id: true, name: true, slug: true }).extend({
    orgId: z.string().uuid().optional()
  }),
  roles: z.array(certManagerGroupMembershipRoleSchema),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const registerCertManagerAccessGroupsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/groups",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "listCertManagerGroups",
      response: { 200: z.object({ groupMemberships: z.array(certManagerGroupMembershipSchema) }) }
    },
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const { memberships: groupMemberships } = await server.services.membershipGroup.listMemberships({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        data: {}
      });
      return {
        groupMemberships: groupMemberships.map((el) => ({
          ...el,
          groupId: el.actorGroupId as string,
          group: el.group
        }))
      };
    }
  });

  server.route({
    method: "GET",
    url: "/groups/:groupId",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "getCertManagerGroup",
      params: z.object({ groupId: z.string().uuid() }),
      response: { 200: z.object({ groupMembership: certManagerGroupMembershipSchema }) }
    },
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const { membership } = await server.services.membershipGroup.getMembershipByGroupId({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { groupId: req.params.groupId }
      });
      return {
        groupMembership: {
          ...membership,
          groupId: membership.actorGroupId as string,
          group: membership.group
        }
      };
    }
  });

  server.route({
    method: "POST",
    url: "/groups/:groupId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "addCertManagerGroup",
      params: z.object({ groupId: z.string().uuid() }),
      body: z.object({
        role: z.string().trim().min(1).default(ProjectMembershipRole.Member).optional(),
        roles: z
          .array(
            z.union([
              z.object({
                role: z.string(),
                isTemporary: z.literal(false).default(false)
              }),
              z.object({
                role: z.string(),
                isTemporary: z.literal(true),
                temporaryMode: z.nativeEnum(TemporaryPermissionMode),
                temporaryRange: z.string().refine((val) => ms(val) > 0, "Temporary range must be a positive number"),
                temporaryAccessStartTime: z.string().datetime()
              })
            ])
          )
          .optional()
      }),
      response: { 200: z.object({ groupMembership: certManagerGroupMembershipSchema }) }
    },
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const roles =
        req.body.roles ??
        (req.body.role
          ? [{ role: req.body.role, isTemporary: false }]
          : [{ role: ProjectMembershipRole.Member, isTemporary: false }]);
      await server.services.membershipGroup.createMembership({
        permission: req.permission,
        data: { groupId: req.params.groupId, roles },
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId }
      });
      const { membership: full } = await server.services.membershipGroup.getMembershipByGroupId({
        permission: req.permission,
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId },
        selector: { groupId: req.params.groupId }
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.ADD_CERT_MANAGER_GROUP,
          metadata: {
            groupId: req.params.groupId,
            membershipId: full.id,
            roles: roles.map((r) => r.role)
          }
        }
      });
      return {
        groupMembership: {
          ...full,
          groupId: full.actorGroupId as string,
          group: full.group
        }
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/groups/:groupId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "updateCertManagerGroup",
      params: z.object({ groupId: z.string().uuid() }),
      body: RolesUpdateBodySchema,
      response: { 200: z.object({ roles: ProjectUserMembershipRolesSchema.array() }) }
    },
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const { membership: groupMembership } = await server.services.membershipGroup.updateMembership({
        permission: req.permission,
        selector: { groupId: req.params.groupId },
        data: { roles: req.body.roles },
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId }
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.UPDATE_CERT_MANAGER_GROUP,
          metadata: {
            groupId: req.params.groupId,
            membershipId: groupMembership.id,
            roles: req.body.roles.map((r) => r.role)
          }
        }
      });
      return {
        roles: groupMembership.roles.map((el) => ({ ...el, projectMembershipId: groupMembership.id }))
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/groups/:groupId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      operationId: "removeCertManagerGroup",
      params: z.object({ groupId: z.string().uuid() }),
      response: {
        200: z.object({
          groupMembership: certManagerGroupMembershipSchema
            .pick({ id: true, groupId: true })
            .extend({ createdAt: z.date(), updatedAt: z.date() })
        })
      }
    },
    handler: async (req) => {
      const projectId = req.internalCertManagerProjectId;
      const { membership: groupMembership } = await server.services.membershipGroup.deleteMembership({
        permission: req.permission,
        selector: { groupId: req.params.groupId },
        scopeData: { scope: AccessScope.Project, orgId: req.permission.orgId, projectId }
      });
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.REMOVE_CERT_MANAGER_GROUP,
          metadata: { groupId: req.params.groupId, membershipId: groupMembership.id }
        }
      });
      return {
        groupMembership: {
          id: groupMembership.id,
          groupId: groupMembership.actorGroupId as string,
          createdAt: groupMembership.createdAt,
          updatedAt: groupMembership.updatedAt
        }
      };
    }
  });
};
