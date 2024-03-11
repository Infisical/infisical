import ms from "ms";
import { z } from "zod";

import {
  IdentitiesSchema,
  IdentityProjectMembershipsSchema,
  ProjectMembershipRole,
  ProjectUserMembershipRolesSchema
} from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { ProjectUserMembershipTemporaryMode } from "@app/services/project-membership/project-membership-types";

export const registerIdentityProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/identity-memberships/:identityId",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      params: z.object({
        projectId: z.string().trim(),
        identityId: z.string().trim()
      }),
      body: z.object({
        role: z.string().trim().min(1).default(ProjectMembershipRole.NoAccess)
      }),
      response: {
        200: z.object({
          identityMembership: IdentityProjectMembershipsSchema
        })
      }
    },
    handler: async (req) => {
      const identityMembership = await server.services.identityProject.createProjectIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId,
        projectId: req.params.projectId,
        role: req.body.role
      });
      return { identityMembership };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:projectId/identity-memberships/:identityId",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update project identity memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim(),
        identityId: z.string().trim()
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
                temporaryRange: z.string().refine((val) => ms(val) > 0, "Temporary range must be positive"),
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
      const roles = await server.services.identityProject.updateProjectIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId,
        projectId: req.params.projectId,
        roles: req.body.roles
      });
      return { roles };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/identity-memberships/:identityId",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Delete project identity memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim(),
        identityId: z.string().trim()
      }),
      response: {
        200: z.object({
          identityMembership: IdentityProjectMembershipsSchema
        })
      }
    },
    handler: async (req) => {
      const identityMembership = await server.services.identityProject.deleteProjectIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId,
        projectId: req.params.projectId
      });
      return { identityMembership };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/identity-memberships",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Return project identity memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          identityMemberships: z
            .object({
              id: z.string(),
              identityId: z.string(),
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
              identity: IdentitiesSchema.pick({ name: true, id: true, authMethod: true })
            })
            .array()
        })
      }
    },
    handler: async (req) => {
      const identityMemberships = await server.services.identityProject.listProjectIdentities({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId
      });
      return { identityMemberships };
    }
  });
};
