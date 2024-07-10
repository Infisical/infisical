import ms from "ms";
import { z } from "zod";

import {
  IdentitiesSchema,
  IdentityProjectMembershipsSchema,
  ProjectMembershipRole,
  ProjectsSchema,
  ProjectUserMembershipRolesSchema
} from "@app/db/schemas";
import { PROJECT_IDENTITIES } from "@app/lib/api-docs";
import { BadRequestError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { ProjectUserMembershipTemporaryMode } from "@app/services/project-membership/project-membership-types";

export const registerIdentityProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/identity-memberships/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Create project identity membership",
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
        // @depreciated
        role: z.string().trim().optional().default(ProjectMembershipRole.NoAccess),
        roles: z
          .array(
            z.union([
              z.object({
                role: z.string().describe(PROJECT_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(false)
                  .default(false)
                  .describe(PROJECT_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.roles.role)
              }),
              z.object({
                role: z.string().describe(PROJECT_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z.literal(true).describe(PROJECT_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.roles.role),
                temporaryMode: z
                  .nativeEnum(ProjectUserMembershipTemporaryMode)
                  .describe(PROJECT_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.roles.role),
                temporaryRange: z
                  .string()
                  .refine((val) => ms(val) > 0, "Temporary range must be a positive number")
                  .describe(PROJECT_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.roles.role),
                temporaryAccessStartTime: z
                  .string()
                  .datetime()
                  .describe(PROJECT_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.roles.role)
              })
            ])
          )
          .describe(PROJECT_IDENTITIES.CREATE_IDENTITY_MEMBERSHIP.roles.description)
          .optional()
      }),
      response: {
        200: z.object({
          identityMembership: IdentityProjectMembershipsSchema
        })
      }
    },
    handler: async (req) => {
      const { role, roles } = req.body;
      if (!role && !roles) throw new BadRequestError({ message: "You must provide either role or roles field" });

      const identityMembership = await server.services.identityProject.createProjectIdentity({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId,
        projectId: req.params.projectId,
        roles: roles || [{ role }]
      });
      return { identityMembership };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:projectId/identity-memberships/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update project identity memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.projectId),
        identityId: z.string().trim().describe(PROJECT_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.identityId)
      }),
      body: z.object({
        roles: z
          .array(
            z.union([
              z.object({
                role: z.string().describe(PROJECT_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(false)
                  .default(false)
                  .describe(PROJECT_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.roles.isTemporary)
              }),
              z.object({
                role: z.string().describe(PROJECT_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z.literal(true).describe(PROJECT_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.roles.isTemporary),
                temporaryMode: z
                  .nativeEnum(ProjectUserMembershipTemporaryMode)
                  .describe(PROJECT_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.roles.temporaryMode),
                temporaryRange: z
                  .string()
                  .refine((val) => ms(val) > 0, "Temporary range must be a positive number")
                  .describe(PROJECT_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.roles.temporaryRange),
                temporaryAccessStartTime: z
                  .string()
                  .datetime()
                  .describe(PROJECT_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.roles.temporaryAccessStartTime)
              })
            ])
          )
          .min(1)
          .describe(PROJECT_IDENTITIES.UPDATE_IDENTITY_MEMBERSHIP.roles.description)
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
        actorAuthMethod: req.permission.authMethod,
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
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Delete project identity memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_IDENTITIES.DELETE_IDENTITY_MEMBERSHIP.projectId),
        identityId: z.string().trim().describe(PROJECT_IDENTITIES.DELETE_IDENTITY_MEMBERSHIP.identityId)
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
        actorAuthMethod: req.permission.authMethod,
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
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Return project identity memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_IDENTITIES.LIST_IDENTITY_MEMBERSHIPS.projectId)
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
              identity: IdentitiesSchema.pick({ name: true, id: true, authMethod: true }),
              project: ProjectsSchema.pick({ name: true, id: true })
            })
            .array()
        })
      }
    },
    handler: async (req) => {
      const identityMemberships = await server.services.identityProject.listProjectIdentities({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId
      });
      return { identityMemberships };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/identity-memberships/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Return project identity membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_IDENTITIES.GET_IDENTITY_MEMBERSHIP_BY_ID.projectId),
        identityId: z.string().trim().describe(PROJECT_IDENTITIES.GET_IDENTITY_MEMBERSHIP_BY_ID.identityId)
      }),
      response: {
        200: z.object({
          identityMembership: z.object({
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
            identity: IdentitiesSchema.pick({ name: true, id: true, authMethod: true }),
            project: ProjectsSchema.pick({ name: true, id: true })
          })
        })
      }
    },
    handler: async (req) => {
      const identityMembership = await server.services.identityProject.getProjectIdentityByIdentityId({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        identityId: req.params.identityId
      });
      return { identityMembership };
    }
  });
};
