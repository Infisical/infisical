import { z } from "zod";

import {
  AccessScope,
  GroupsSchema,
  ProjectMembershipRole,
  ProjectUserMembershipRolesSchema,
  TemporaryPermissionMode
} from "@app/db/schemas";
import { ApiDocsTags, PROJECTS } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const projectGroupMembershipRoleSchema = z.object({
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

const projectGroupMembershipSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  projectId: z.string().uuid(),
  group: GroupsSchema.pick({ id: true, name: true, slug: true }).extend({
    orgId: z.string().uuid().optional()
  }),
  roles: z.array(projectGroupMembershipRoleSchema),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const registerProjectGroupMembershipsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/groups",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "listProjectGroupMemberships",
      tags: [ApiDocsTags.ProjectGroups],
      description:
        "List project group memberships. Pattern: {scope}/memberships/{actor-type}. This route was restructured to follow the new membership design. Retrocompatibility is preserved (legacy routes remain available).",
      security: [{ bearerAuth: [] }],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.LIST_GROUPS_IN_PROJECT.projectId)
      }),
      response: {
        200: z.object({
          groupMemberships: z.array(projectGroupMembershipSchema)
        })
      }
    },
    handler: async (req) => {
      const { memberships: groupMemberships } = await server.services.membershipGroup.listMemberships({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        data: {}
      });

      return {
        groupMemberships: groupMemberships.map((el) => ({
          ...el,
          groupId: el.actorGroupId as string,
          projectId: req.params.projectId,
          group: el.group!
        }))
      };
    }
  });

  server.route({
    method: "POST",
    url: "/groups/:groupId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "createProjectGroupMembership",
      tags: [ApiDocsTags.ProjectGroups],
      description:
        "Add group to project (create project group membership). This route was restructured to follow the new membership design. Retrocompatibility is preserved (legacy routes remain available).",
      security: [{ bearerAuth: [] }],
      params: z.object({
        projectId: z.string().trim(),
        groupId: z.string().uuid()
      }),
      body: z
        .object({
          role: z.string().trim().min(1).default(ProjectMembershipRole.NoAccess).optional(),
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
        })
        .refine((data) => data.role || data.roles, {
          message: "Either role or roles must be present",
          path: ["role", "roles"]
        }),
      response: {
        200: z.object({
          groupMembership: projectGroupMembershipSchema
        })
      }
    },
    handler: async (req) => {
      const roles = req.body.roles || [{ role: req.body.role!, isTemporary: false }];
      const { membership } = await server.services.membershipGroup.createMembership({
        permission: req.permission,
        data: { groupId: req.params.groupId, roles },
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        }
      });

      const { membership: full } = await server.services.membershipGroup.getMembershipByGroupId({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        selector: { groupId: req.params.groupId }
      });

      return {
        groupMembership: {
          ...full,
          groupId: full.actorGroupId as string,
          projectId: req.params.projectId,
          group: full.group!
        }
      };
    }
  });

  server.route({
    method: "GET",
    url: "/groups/:groupId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getProjectGroupMembership",
      tags: [ApiDocsTags.ProjectGroups],
      description:
        "Get project group membership by group ID. This route was restructured to follow the new membership design. Retrocompatibility is preserved (legacy routes remain available).",
      security: [{ bearerAuth: [] }],
      params: z.object({
        projectId: z.string().trim(),
        groupId: z.string().uuid()
      }),
      response: {
        200: z.object({
          groupMembership: projectGroupMembershipSchema
        })
      }
    },
    handler: async (req) => {
      const { membership } = await server.services.membershipGroup.getMembershipByGroupId({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        selector: { groupId: req.params.groupId }
      });

      return {
        groupMembership: {
          ...membership,
          groupId: membership.actorGroupId as string,
          projectId: req.params.projectId,
          group: membership.group!
        }
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/groups/:groupId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "updateProjectGroupMembership",
      tags: [ApiDocsTags.ProjectGroups],
      description:
        "Update project group membership roles. This route was restructured to follow the new membership design. Retrocompatibility is preserved (legacy routes remain available).",
      security: [{ bearerAuth: [] }],
      params: z.object({
        projectId: z.string().trim(),
        groupId: z.string().uuid()
      }),
      body: z.object({
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
          .min(1)
          .describe(PROJECTS.UPDATE_GROUP_IN_PROJECT.roles)
      }),
      response: {
        200: z.object({
          roles: ProjectUserMembershipRolesSchema.array()
        })
      }
    },
    handler: async (req) => {
      const { membership: groupMembership } = await server.services.membershipGroup.updateMembership({
        permission: req.permission,
        selector: { groupId: req.params.groupId },
        data: { roles: req.body.roles },
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
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
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "removeProjectGroupMembership",
      tags: [ApiDocsTags.ProjectGroups],
      description:
        "Remove group from project (delete project group membership). This route was restructured to follow the new membership design. Retrocompatibility is preserved (legacy routes remain available).",
      security: [{ bearerAuth: [] }],
      params: z.object({
        projectId: z.string().trim(),
        groupId: z.string().uuid()
      }),
      response: {
        200: z.object({
          groupMembership: projectGroupMembershipSchema.pick({ id: true, groupId: true, projectId: true })
            .extend({ createdAt: z.date(), updatedAt: z.date() })
        })
      }
    },
    handler: async (req) => {
      const { membership: groupMembership } = await server.services.membershipGroup.deleteMembership({
        permission: req.permission,
        selector: { groupId: req.params.groupId },
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        }
      });

      return {
        groupMembership: {
          id: groupMembership.id,
          groupId: groupMembership.actorGroupId as string,
          projectId: req.params.projectId,
          createdAt: groupMembership.createdAt,
          updatedAt: groupMembership.updatedAt
        }
      };
    }
  });
};
