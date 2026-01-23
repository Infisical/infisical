import { z } from "zod";

import { IdentitiesSchema } from "@app/db/schemas/identities";
import { IdentityProjectMembershipsSchema } from "@app/db/schemas/identity-project-memberships";
import { AccessScope, ProjectMembershipRole, TemporaryPermissionMode } from "@app/db/schemas/models";
import { ProjectUserMembershipRolesSchema } from "@app/db/schemas/project-user-membership-roles";
import { ApiDocsTags, ORGANIZATIONS, PROJECT_IDENTITIES } from "@app/lib/api-docs";
import { BadRequestError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { OrderByDirection } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { ProjectIdentityOrderBy } from "@app/services/identity-project/identity-project-types";

import { SanitizedProjectSchema } from "../sanitizedSchemas";

export const registerDeprecatedIdentityProjectMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/identity-memberships/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectIdentities],
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
                  .nativeEnum(TemporaryPermissionMode)
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

      const { membership } = await server.services.membershipIdentity.createMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        data: {
          identityId: req.params.identityId,
          roles: roles || [{ role, isTemporary: false }]
        }
      });

      return {
        identityMembership: { ...membership, identityId: req.params.identityId, projectId: req.params.projectId }
      };
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
      hide: false,
      tags: [ApiDocsTags.ProjectIdentities],
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
                  .nativeEnum(TemporaryPermissionMode)
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
      const { membership } = await server.services.membershipIdentity.updateMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        selector: {
          identityId: req.params.identityId
        },
        data: {
          roles: req.body.roles
        }
      });

      return {
        roles: membership.roles.map((el) => ({ ...el, projectMembershipId: membership.id }))
      };
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
      hide: false,
      tags: [ApiDocsTags.ProjectIdentities],
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
      const { membership } = await server.services.membershipIdentity.deleteMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        selector: {
          identityId: req.params.identityId
        }
      });

      return {
        identityMembership: { ...membership, identityId: req.params.identityId, projectId: req.params.projectId }
      };
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
      hide: false,
      tags: [ApiDocsTags.ProjectIdentities],
      description: "Return project identity memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_IDENTITIES.LIST_IDENTITY_MEMBERSHIPS.projectId)
      }),
      querystring: z.object({
        offset: z.coerce
          .number()
          .min(0)
          .default(0)
          .describe(PROJECT_IDENTITIES.LIST_IDENTITY_MEMBERSHIPS.offset)
          .optional(),
        limit: z.coerce
          .number()
          .min(1)
          .max(20000) // TODO: temp limit until combobox added to add identity to project modal, reduce once added
          .default(100)
          .describe(PROJECT_IDENTITIES.LIST_IDENTITY_MEMBERSHIPS.limit)
          .optional(),
        orderBy: z
          .nativeEnum(ProjectIdentityOrderBy)
          .default(ProjectIdentityOrderBy.Name)
          .describe(ORGANIZATIONS.LIST_IDENTITY_MEMBERSHIPS.orderBy)
          .optional(),
        orderDirection: z
          .nativeEnum(OrderByDirection)
          .default(OrderByDirection.ASC)
          .describe(ORGANIZATIONS.LIST_IDENTITY_MEMBERSHIPS.orderDirection)
          .optional(),
        search: z.string().trim().describe(PROJECT_IDENTITIES.LIST_IDENTITY_MEMBERSHIPS.search).optional()
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
              identity: IdentitiesSchema.pick({ name: true, id: true, projectId: true, orgId: true }).extend({
                authMethods: z.array(z.string())
              }),
              project: SanitizedProjectSchema.pick({ name: true, id: true })
            })
            .array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { identityMemberships, totalCount } = await server.services.identityProject.listProjectIdentities({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.projectId,
        limit: req.query.limit,
        offset: req.query.offset,
        orderBy: req.query.orderBy,
        orderDirection: req.query.orderDirection,
        search: req.query.search
      });

      return { identityMemberships, totalCount };
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
      hide: false,
      tags: [ApiDocsTags.ProjectIdentities],
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
            lastLoginAuthMethod: z.string().nullable().optional(),
            lastLoginTime: z.date().nullable().optional(),
            identity: IdentitiesSchema.pick({ name: true, id: true, projectId: true, orgId: true }).extend({
              authMethods: z.array(z.string())
            }),
            project: SanitizedProjectSchema.pick({ name: true, id: true })
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

  server.route({
    method: "GET",
    url: "/identity-memberships/:identityMembershipId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectIdentities],
      params: z.object({
        identityMembershipId: z.string().trim()
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
            identity: IdentitiesSchema.pick({ name: true, id: true }).extend({
              authMethods: z.array(z.string())
            }),
            project: SanitizedProjectSchema.pick({ name: true, id: true })
          })
        })
      }
    },
    handler: async (req) => {
      const identityMembership = await server.services.identityProject.getProjectIdentityByMembershipId({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityMembershipId: req.params.identityMembershipId
      });
      return { identityMembership };
    }
  });
};
