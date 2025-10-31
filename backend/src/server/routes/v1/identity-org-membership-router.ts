import { z } from "zod";

import { AccessScope, IdentitiesSchema, MembershipRolesSchema, TemporaryPermissionMode } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, ORG_IDENTITY_MEMBERSHIP } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const sanitizedOrgIdentityMembershipSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string(),
  identityId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const registerIdentityOrgMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/identity-memberships/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      tags: [ApiDocsTags.OrgIdentityMembership],
      description: "Create org identity membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(ORG_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.identityId)
      }),
      body: z.object({
        roles: z
          .array(
            z.union([
              z.object({
                role: z.string().describe(ORG_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(false)
                  .default(false)
                  .describe(ORG_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.roles.isTemporary)
              }),
              z.object({
                role: z.string().describe(ORG_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(true)
                  .describe(ORG_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.roles.isTemporary),
                temporaryMode: z
                  .nativeEnum(TemporaryPermissionMode)
                  .describe(ORG_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.roles.temporaryMode),
                temporaryRange: z
                  .string()
                  .refine((val) => ms(val) > 0, "Temporary range must be a positive number")
                  .describe(ORG_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.roles.temporaryRange),
                temporaryAccessStartTime: z
                  .string()
                  .datetime()
                  .describe(ORG_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.roles.temporaryAccessStartTime)
              })
            ])
          )
          .describe(ORG_IDENTITY_MEMBERSHIP.CREATE_IDENTITY_MEMBERSHIP.roles.description)
          .min(1)
      }),
      response: {
        200: z.object({
          identityMembership: sanitizedOrgIdentityMembershipSchema
        })
      }
    },
    handler: async (req) => {
      const { membership } = await server.services.membershipIdentity.createMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
        },
        data: {
          identityId: req.params.identityId,
          roles: req.body.roles
        }
      });

      await server.services.auditLog.createAuditLog({
        orgId: req.permission.orgId,
        ...req.auditLogInfo,
        event: {
          type: EventType.CREATE_IDENTITY_ORG_MEMBERSHIP,
          metadata: {
            identityId: req.params.identityId,
            roles: req.body.roles
          }
        }
      });

      return {
        identityMembership: { ...membership, identityId: req.params.identityId, orgId: req.permission.orgId }
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/identity-memberships/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      tags: [ApiDocsTags.OrgIdentityMembership],
      description: "Update org identity membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(ORG_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.identityId)
      }),
      body: z.object({
        roles: z
          .array(
            z.union([
              z.object({
                role: z.string().describe(ORG_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(false)
                  .default(false)
                  .describe(ORG_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.roles.isTemporary)
              }),
              z.object({
                role: z.string().describe(ORG_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.roles.role),
                isTemporary: z
                  .literal(true)
                  .describe(ORG_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.roles.isTemporary),
                temporaryMode: z
                  .nativeEnum(TemporaryPermissionMode)
                  .describe(ORG_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.roles.temporaryMode),
                temporaryRange: z
                  .string()
                  .refine((val) => ms(val) > 0, "Temporary range must be a positive number")
                  .describe(ORG_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.roles.temporaryRange),
                temporaryAccessStartTime: z
                  .string()
                  .datetime()
                  .describe(ORG_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.roles.temporaryAccessStartTime)
              })
            ])
          )
          .min(1)
          .describe(ORG_IDENTITY_MEMBERSHIP.UPDATE_IDENTITY_MEMBERSHIP.roles.description)
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
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
        },
        selector: {
          identityId: req.params.identityId
        },
        data: {
          roles: req.body.roles
        }
      });

      await server.services.auditLog.createAuditLog({
        orgId: req.permission.orgId,
        ...req.auditLogInfo,
        event: {
          type: EventType.UPDATE_IDENTITY_ORG_MEMBERSHIP,
          metadata: {
            identityId: req.params.identityId,
            roles: req.body.roles
          }
        }
      });

      return {
        roles: membership.roles.map((el) => ({ ...el, membershipId: membership.id }))
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/identity-memberships/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      tags: [ApiDocsTags.OrgIdentityMembership],
      description: "Delete org identity membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(ORG_IDENTITY_MEMBERSHIP.DELETE_IDENTITY_MEMBERSHIP.identityId)
      }),
      response: {
        200: z.object({
          identityMembership: sanitizedOrgIdentityMembershipSchema
        })
      }
    },
    handler: async (req) => {
      const { membership } = await server.services.membershipIdentity.deleteMembership({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
        },
        selector: {
          identityId: req.params.identityId
        }
      });

      await server.services.auditLog.createAuditLog({
        orgId: req.permission.orgId,
        ...req.auditLogInfo,
        event: {
          type: EventType.DELETE_IDENTITY_ORG_MEMBERSHIP,
          metadata: {
            identityId: req.params.identityId
          }
        }
      });

      return {
        identityMembership: { ...membership, identityId: req.params.identityId, orgId: req.permission.orgId }
      };
    }
  });

  server.route({
    method: "GET",
    url: "/identity-memberships",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      tags: [ApiDocsTags.OrgIdentityMembership],
      description: "List org identity memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        offset: z.coerce
          .number()
          .min(0)
          .default(0)
          .describe(ORG_IDENTITY_MEMBERSHIP.LIST_IDENTITY_MEMBERSHIPS.offset)
          .optional(),
        limit: z.coerce
          .number()
          .min(1)
          .max(100)
          .default(20)
          .describe(ORG_IDENTITY_MEMBERSHIP.LIST_IDENTITY_MEMBERSHIPS.limit)
          .optional(),
        identityName: z
          .string()
          .trim()
          .describe(ORG_IDENTITY_MEMBERSHIP.LIST_IDENTITY_MEMBERSHIPS.identityName)
          .optional(),
        roles: z
          .string()
          .transform((val) => val.split(",").map((role) => role.trim()))
          .describe(ORG_IDENTITY_MEMBERSHIP.LIST_IDENTITY_MEMBERSHIPS.roles)
          .optional()
      }),
      response: {
        200: z.object({
          identityMemberships: z
            .object({
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
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
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
    url: "/identity-memberships/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      tags: [ApiDocsTags.OrgIdentityMembership],
      description: "Get org identity membership by identity ID",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(ORG_IDENTITY_MEMBERSHIP.GET_IDENTITY_MEMBERSHIP_BY_ID.identityId)
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
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
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
    url: "/available-identities",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.OrgIdentityMembership],
      description: "List available identities for org membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        offset: z.coerce
          .number()
          .min(0)
          .default(0)
          .describe(ORG_IDENTITY_MEMBERSHIP.LIST_AVAILABLE_IDENTITIES.offset)
          .optional(),
        limit: z.coerce
          .number()
          .min(1)
          .max(100)
          .default(20)
          .describe(ORG_IDENTITY_MEMBERSHIP.LIST_AVAILABLE_IDENTITIES.limit)
          .optional(),
        identityName: z.string().describe(ORG_IDENTITY_MEMBERSHIP.LIST_AVAILABLE_IDENTITIES.identityName).optional()
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
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
        },
        data: {
          offset: req.query.offset,
          limit: req.query.limit,
          identityName: req.query.identityName
        }
      });

      return { identities };
    }
  });
};
