import { z } from "zod";

import {
  IdentitiesSchema,
  IdentityProjectMembershipsSchema,
  ProjectMembershipRole,
  ProjectRolesSchema
} from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

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
      const identityMembership = await server.services.identityProject.updateProjectIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        identityId: req.params.identityId,
        projectId: req.params.projectId,
        role: req.body.role
      });
      return { identityMembership };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/identity-memberships/:identityId",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
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
      params: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          identityMemberships: IdentityProjectMembershipsSchema.merge(
            z.object({
              customRole: ProjectRolesSchema.pick({
                id: true,
                name: true,
                slug: true,
                permissions: true,
                description: true
              }).optional(),
              identity: IdentitiesSchema.pick({ name: true, id: true, authMethod: true })
            })
          ).array()
        })
      }
    },
    handler: async (req) => {
      const identityMemberships = await server.services.identityProject.listProjectIdentities({
        actor: req.permission.type,
        actorId: req.permission.id,
        projectId: req.params.projectId
      });
      return { identityMemberships };
    }
  });
};
