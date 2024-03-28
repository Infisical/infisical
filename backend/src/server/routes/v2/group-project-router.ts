import ms from "ms";
import { z } from "zod";

import {
  GroupProjectMembershipsSchema,
  GroupsSchema,
  ProjectMembershipRole,
  ProjectUserMembershipRolesSchema
} from "@app/db/schemas";
import { PROJECTS } from "@app/lib/api-docs";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { ProjectUserMembershipTemporaryMode } from "@app/services/project-membership/project-membership-types";

export const registerGroupProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/group-memberships/:groupSlug",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      params: z.object({
        projectId: z.string().trim(),
        groupSlug: z.string().trim()
      }),
      body: z.object({
        role: z.string().trim().min(1).default(ProjectMembershipRole.NoAccess)
      }),
      response: {
        200: z.object({
          groupMembership: GroupProjectMembershipsSchema
        })
      }
    },
    handler: async (req) => {
      const groupMembership = await server.services.groupProject.createProjectGroup({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        groupSlug: req.params.groupSlug,
        projectId: req.params.projectId,
        role: req.body.role
      });
      return { groupMembership };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:projectId/group-memberships/:groupSlug",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update project group memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim(),
        groupSlug: z.string().trim()
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
      }),
      response: {
        200: z.object({
          roles: ProjectUserMembershipRolesSchema.array()
        })
      }
    },
    handler: async (req) => {
      const roles = await server.services.groupProject.updateProjectGroup({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        groupSlug: req.params.groupSlug,
        projectId: req.params.projectId,
        roles: req.body.roles
      });
      return { roles };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/group-memberships/:groupSlug",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Delete project group memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.DELETE_IDENTITY_MEMBERSHIP.projectId),
        groupSlug: z.string().trim().describe(PROJECTS.DELETE_IDENTITY_MEMBERSHIP.identityId)
      }),
      response: {
        200: z.object({
          groupMembership: GroupProjectMembershipsSchema
        })
      }
    },
    handler: async (req) => {
      const groupMembership = await server.services.groupProject.deleteProjectGroup({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        groupSlug: req.params.groupSlug,
        projectId: req.params.projectId
      });
      return { groupMembership };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/group-memberships",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Return project group memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECTS.LIST_IDENTITY_MEMBERSHIPS.projectId)
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
      const groupMemberships = await server.services.groupProject.listProjectGroup({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId
      });
      return { groupMemberships };
    }
  });
};
