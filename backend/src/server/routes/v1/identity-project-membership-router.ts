import { z } from "zod";

import { AccessScope, IdentitiesSchema, MembershipRolesSchema, TemporaryPermissionMode } from "@app/db/schemas";
import { ApiDocsTags, PROJECT_IDENTITY_MEMBERSHIP } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const sanitizedProjectIdentityMembershipSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string(),
  identityId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const registerProjectIdentityMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:projectId/identity-memberships/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectIdentityMembership],
      description: "Create project identity membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.projectId),
        identityId: z.string().trim().describe(PROJECT_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.identityId)
      }),
      body: z.object({
        roles: z
          .array(
            z.union([
              z.object({
                role: z.string().describe(PROJECT_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(false)
                  .default(false)
                  .describe(PROJECT_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.roles.isTemporary)
              }),
              z.object({
                role: z.string().describe(PROJECT_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(true)
                  .describe(PROJECT_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.roles.isTemporary),
                temporaryMode: z
                  .nativeEnum(TemporaryPermissionMode)
                  .describe(PROJECT_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.roles.temporaryMode),
                temporaryRange: z
                  .string()
                  .refine((val) => ms(val) > 0, "Temporary range must be a positive number")
                  .describe(PROJECT_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.roles.temporaryRange),
                temporaryAccessStartTime: z
                  .string()
                  .datetime()
                  .describe(PROJECT_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.roles.temporaryAccessStartTime)
              })
            ])
          )
          .describe(PROJECT_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.roles.description)
          .min(1)
      }),
      response: {
        200: z.object({
          identityMembership: sanitizedProjectIdentityMembershipSchema
        })
      }
    },
    handler: async (req) => {
      const { membership } = await server.services.membershipIdentity.createMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        data: {
          identityId: req.params.identityId,
          roles: req.body.roles
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
      tags: [ApiDocsTags.ProjectIdentityMembership],
      description: "Update project identity membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.projectId),
        identityId: z.string().trim().describe(PROJECT_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.identityId)
      }),
      body: z.object({
        roles: z
          .array(
            z.union([
              z.object({
                role: z.string().describe(PROJECT_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(false)
                  .default(false)
                  .describe(PROJECT_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.roles.isTemporary)
              }),
              z.object({
                role: z.string().describe(PROJECT_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(true)
                  .describe(PROJECT_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.roles.isTemporary),
                temporaryMode: z
                  .nativeEnum(TemporaryPermissionMode)
                  .describe(PROJECT_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.roles.temporaryMode),
                temporaryRange: z
                  .string()
                  .refine((val) => ms(val) > 0, "Temporary range must be a positive number")
                  .describe(PROJECT_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.roles.temporaryRange),
                temporaryAccessStartTime: z
                  .string()
                  .datetime()
                  .describe(PROJECT_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.roles.temporaryAccessStartTime)
              })
            ])
          )
          .min(1)
          .describe(PROJECT_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.roles.description)
      }),
      response: {
        200: z.object({
          roles: MembershipRolesSchema.array()
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
        roles: membership.roles.map((el) => ({ ...el, membershipId: membership.id }))
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
      tags: [ApiDocsTags.ProjectIdentityMembership],
      description: "Delete project identity membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_IDENTITY_MEMBERSHIP.DELETE_IDENTITY_MEMBERSHIP.projectId),
        identityId: z.string().trim().describe(PROJECT_IDENTITY_MEMBERSHIP.DELETE_IDENTITY_MEMBERSHIP.identityId)
      }),
      response: {
        200: z.object({
          identityMembership: sanitizedProjectIdentityMembershipSchema
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
      tags: [ApiDocsTags.ProjectIdentityMembership],
      description: "List project identity memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_IDENTITY_MEMBERSHIP.LIST_IDENTITY_MEMBERSHIPS.projectId)
      }),
      querystring: z.object({
        offset: z.coerce
          .number()
          .min(0)
          .default(0)
          .describe(PROJECT_IDENTITY_MEMBERSHIP.LIST_IDENTITY_MEMBERSHIPS.offset)
          .optional(),
        limit: z.coerce
          .number()
          .min(1)
          .max(100)
          .default(20)
          .describe(PROJECT_IDENTITY_MEMBERSHIP.LIST_IDENTITY_MEMBERSHIPS.limit)
          .optional(),
        identityName: z
          .string()
          .trim()
          .describe(PROJECT_IDENTITY_MEMBERSHIP.LIST_IDENTITY_MEMBERSHIPS.identityName)
          .optional(),
        roles: z
          .string()
          .transform((val) => val.split(",").map((role) => role.trim()))
          .describe(PROJECT_IDENTITY_MEMBERSHIP.LIST_IDENTITY_MEMBERSHIPS.roles)
          .optional()
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
              identity: IdentitiesSchema.pick({ name: true, id: true, orgId: true, projectId: true })
            })
            .array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { data: identityMemberships, totalCount } = await server.services.membershipIdentity.listMemberships({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        data: {
          offset: req.query.offset,
          limit: req.query.limit,
          identityName: req.query.identityName,
          roles: req.query.roles
        }
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
      tags: [ApiDocsTags.ProjectIdentityMembership],
      description: "Get project identity membership by identity ID",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_IDENTITY_MEMBERSHIP.GET_IDENTITY_MEMBERSHIP_BY_ID.projectId),
        identityId: z.string().trim().describe(PROJECT_IDENTITY_MEMBERSHIP.GET_IDENTITY_MEMBERSHIP_BY_ID.identityId)
      }),
      response: {
        200: z.object({
          identityMembership: z.object({
            id: z.string(),
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
            identity: IdentitiesSchema.pick({ name: true, id: true, orgId: true, projectId: true }).extend({
              authMethods: z.array(z.string())
            })
          })
        })
      }
    },
    handler: async (req) => {
      const identityMembership = await server.services.membershipIdentity.getMembershipByIdentityId({
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

      return { identityMembership };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/available-identities",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProjectIdentityMembership],
      description: "List available identities for project membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim().describe(PROJECT_IDENTITY_MEMBERSHIP.LIST_AVAILABLE_IDENTITIES.projectId)
      }),
      querystring: z.object({
        offset: z.coerce
          .number()
          .min(0)
          .default(0)
          .describe(PROJECT_IDENTITY_MEMBERSHIP.LIST_AVAILABLE_IDENTITIES.offset)
          .optional(),
        limit: z.coerce
          .number()
          .min(1)
          .max(100)
          .default(20)
          .describe(PROJECT_IDENTITY_MEMBERSHIP.LIST_AVAILABLE_IDENTITIES.limit)
          .optional()
      }),
      response: {
        200: z.object({
          identities: IdentitiesSchema.pick({ id: true, name: true }).array()
        })
      }
    },
    handler: async (req) => {
      const { identities } = await server.services.membershipIdentity.listAvailableIdentities({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Project,
          orgId: req.permission.orgId,
          projectId: req.params.projectId
        },
        data: {
          offset: req.query.offset,
          limit: req.query.limit
        }
      });

      return { identities };
    }
  });
};
