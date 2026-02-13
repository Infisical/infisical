import { z } from "zod";

import {
  AccessScope,
  GroupProjectMembershipsSchema,
  GroupsSchema,
  ProjectMembershipRole,
  ProjectUserMembershipRolesSchema,
  TemporaryPermissionMode,
  UsersSchema
} from "@app/db/schemas";
import { FilterReturnedUsers } from "@app/ee/services/group/group-types";
import { ApiDocsTags, GROUPS, PROJECTS } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { isUuidV4 } from "@app/lib/validator";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerGroupProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/groups/:groupIdOrName",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      deprecated: true,
      operationId: "addGroupToProject",
      tags: [ApiDocsTags.ProjectGroups],
      description:
        "Deprecated: Use POST /api/v1/projects/:projectId/memberships/groups/:groupId instead. Add group to project.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.ADD_GROUP_TO_PROJECT.projectId),
        groupIdOrName: z.string().trim().describe(PROJECTS.ADD_GROUP_TO_PROJECT.groupIdOrName)
      }),
      body: z
        .object({
          role: z
            .string()
            .trim()
            .min(1)
            .default(ProjectMembershipRole.NoAccess)
            .describe(PROJECTS.ADD_GROUP_TO_PROJECT.role),
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
          groupMembership: GroupProjectMembershipsSchema
        })
      }
    },
    handler: async (req) => {
      let groupId = req.params.groupIdOrName;
      if (!isUuidV4(req.params.groupIdOrName)) {
        const groupDetails = await server.services.convertor.getGroupIdFromName(groupId, req.permission.orgId);
        groupId = groupDetails.groupId;
      }

      const { membership: groupMembership } = await server.services.membershipGroup.createMembership({
        permission: req.permission,
        data: {
          groupId,
          roles: req.body.roles || [{ role: req.body.role, isTemporary: false }]
        },
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        }
      });

      return {
        groupMembership: {
          ...groupMembership,
          projectId: req.params.projectId,
          groupId: groupMembership.actorGroupId as string
        }
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:projectId/groups/:groupId",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      deprecated: true,
      operationId: "updateProjectGroup",
      tags: [ApiDocsTags.ProjectGroups],
      description:
        "Deprecated: Use PATCH /api/v1/projects/:projectId/memberships/groups/:groupId instead. Update group in project.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.UPDATE_GROUP_IN_PROJECT.projectId),
        groupId: z.string().trim().describe(PROJECTS.UPDATE_GROUP_IN_PROJECT.groupId)
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
        selector: {
          groupId: req.params.groupId
        },
        data: {
          roles: req.body.roles
        },
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        }
      });

      return { roles: groupMembership.roles.map((el) => ({ ...el, projectMembershipId: groupMembership.id })) };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/groups/:groupId",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      deprecated: true,
      operationId: "removeGroupFromProject",
      tags: [ApiDocsTags.ProjectGroups],
      description:
        "Deprecated: Use DELETE /api/v1/projects/:projectId/memberships/groups/:groupId instead. Remove group from project.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.REMOVE_GROUP_FROM_PROJECT.projectId),
        groupId: z.string().trim().describe(PROJECTS.REMOVE_GROUP_FROM_PROJECT.groupId)
      }),
      response: {
        200: z.object({
          groupMembership: GroupProjectMembershipsSchema
        })
      }
    },
    handler: async (req) => {
      const { membership: groupMembership } = await server.services.membershipGroup.deleteMembership({
        permission: req.permission,
        selector: {
          groupId: req.params.groupId
        },
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        }
      });

      return {
        groupMembership: {
          ...groupMembership,
          projectId: req.params.projectId,
          groupId: groupMembership.actorGroupId as string
        }
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/groups",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      deprecated: true,
      operationId: "listProjectGroups",
      tags: [ApiDocsTags.ProjectGroups],
      description:
        "Deprecated: Use GET /api/v1/projects/:projectId/memberships/groups instead. Return list of groups in project.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.LIST_GROUPS_IN_PROJECT.projectId)
      }),
      response: {
        200: z.object({
          groupMemberships: z
            .object({
              id: z.string(),
              groupId: z.string(),
              createdAt: z.date(),
              updatedAt: z.date(),
              roles: z.array(
                z.object({
                  id: z.string(),
                  role: z.string(),
                  customRoleId: z.string().optional().nullable(),
                  customRoleName: z.string().optional().nullable(),
                  customRoleSlug: z.string().optional().nullable(),
                  isTemporary: z.boolean(),
                  temporaryMode: z.string().optional().nullable(),
                  temporaryRange: z.string().nullable().optional(),
                  temporaryAccessStartTime: z.date().nullable().optional(),
                  temporaryAccessEndTime: z.date().nullable().optional()
                })
              ),
              group: GroupsSchema.pick({ name: true, id: true, slug: true }).and(
                z.object({ orgId: z.string().uuid().optional() })
              )
            })
            .array()
        })
      }
    },
    handler: async (req) => {
      const { memberships: groupMemberships } = await server.services.membershipGroup.listMemberships({
        permission: req.permission,
        data: {},
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        }
      });

      return { groupMemberships: groupMemberships.map((el) => ({ ...el, groupId: el.actorGroupId as string })) };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/groups/:groupId",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      deprecated: true,
      operationId: "getProjectGroup",
      tags: [ApiDocsTags.ProjectGroups],
      description:
        "Deprecated: Use GET /api/v1/projects/:projectId/memberships/groups/:groupId instead. Return project group.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim(),
        groupId: z.string().trim()
      }),
      response: {
        200: z.object({
          groupMembership: z.object({
            id: z.string(),
            groupId: z.string(),
            createdAt: z.date(),
            updatedAt: z.date(),
            roles: z.array(
              z.object({
                id: z.string(),
                role: z.string(),
                customRoleId: z.string().optional().nullable(),
                customRoleName: z.string().optional().nullable(),
                customRoleSlug: z.string().optional().nullable(),
                isTemporary: z.boolean(),
                temporaryMode: z.string().optional().nullable(),
                temporaryRange: z.string().nullable().optional(),
                temporaryAccessStartTime: z.date().nullable().optional(),
                temporaryAccessEndTime: z.date().nullable().optional()
              })
            ),
            group: GroupsSchema.pick({ name: true, id: true, slug: true })
          })
        })
      }
    },
    handler: async (req) => {
      const { membership: groupMembership } = await server.services.membershipGroup.getMembershipByGroupId({
        permission: req.permission,
        selector: {
          groupId: req.params.groupId
        },
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        }
      });

      return {
        groupMembership: {
          ...groupMembership,
          projectId: req.params.projectId,
          groupId: groupMembership.actorGroupId as string
        }
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/groups/:groupId/users",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: true,
      operationId: "listProjectGroupUsers",
      deprecated: true,
      tags: [ApiDocsTags.ProjectGroups],
      description: "Return project group users (Deprecated: Use /api/v1/groups/{id}/users instead)",
      params: z.object({
        projectId: z.string().trim().describe(GROUPS.LIST_USERS.projectId),
        groupId: z.string().trim().describe(GROUPS.LIST_USERS.id)
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).max(100).default(0).describe(GROUPS.LIST_USERS.offset),
        limit: z.coerce.number().min(1).max(100).default(10).describe(GROUPS.LIST_USERS.limit),
        username: z.string().trim().optional().describe(GROUPS.LIST_USERS.username),
        search: z.string().trim().optional().describe(GROUPS.LIST_USERS.search),
        filter: z.nativeEnum(FilterReturnedUsers).optional().describe(GROUPS.LIST_USERS.filterUsers)
      }),
      response: {
        200: z.object({
          users: UsersSchema.pick({
            email: true,
            username: true,
            firstName: true,
            lastName: true,
            id: true
          })
            .merge(
              z.object({
                isPartOfGroup: z.boolean(),
                joinedGroupAt: z.date().nullable()
              })
            )
            .array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { users, totalCount } = await server.services.groupProject.listProjectGroupUsers({
        id: req.params.groupId,
        projectId: req.params.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });

      return { users, totalCount };
    }
  });
};
