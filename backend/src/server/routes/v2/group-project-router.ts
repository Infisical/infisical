import ms from "ms";
import { z } from "zod";

import {
  GroupProjectMembershipsSchema,
  GroupsSchema,
  ProjectMembershipRole,
  ProjectUserMembershipRolesSchema
} from "@app/db/schemas";
import { PROJECTS } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { ProjectUserMembershipTemporaryMode } from "@app/services/project-membership/project-membership-types";

export const registerGroupProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/groups/:groupId",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Add group to project",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.ADD_GROUP_TO_PROJECT.projectId),
        groupId: z.string().trim().describe(PROJECTS.ADD_GROUP_TO_PROJECT.groupId)
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
                  temporaryMode: z.nativeEnum(ProjectUserMembershipTemporaryMode),
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
      const groupMembership = await server.services.groupProject.addGroupToProject({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        roles: req.body.roles || [{ role: req.body.role }],
        projectId: req.params.projectId,
        groupId: req.params.groupId
      });

      return { groupMembership };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:projectId/groups/:groupId",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update group in project",
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
                temporaryMode: z.nativeEnum(ProjectUserMembershipTemporaryMode),
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
      const roles = await server.services.groupProject.updateGroupInProject({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        groupId: req.params.groupId,
        roles: req.body.roles
      });

      return { roles };
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
      description: "Remove group from project",
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
      const groupMembership = await server.services.groupProject.removeGroupFromProject({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        groupId: req.params.groupId,
        projectId: req.params.projectId
      });

      return { groupMembership };
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
      description: "Return list of groups in project",
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
              group: GroupsSchema.pick({ name: true, id: true, slug: true })
            })
            .array()
        })
      }
    },
    handler: async (req) => {
      const groupMemberships = await server.services.groupProject.listGroupsInProject({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId
      });

      return { groupMemberships };
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
      description: "Return project group",
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
      const groupMembership = await server.services.groupProject.getGroupInProject({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.params
      });

      return { groupMembership };
    }
  });
};
