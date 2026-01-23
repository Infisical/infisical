import { z } from "zod";

import { IdentitiesSchema } from "@app/db/schemas/identities";
import { IdentityProjectMembershipsSchema } from "@app/db/schemas/identity-project-memberships";
import { AccessScope, ProjectMembershipRole, TemporaryPermissionMode } from "@app/db/schemas/models";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, PROJECT_IDENTITIES, PROJECT_IDENTITY_MEMBERSHIP } from "@app/lib/api-docs";
import { BadRequestError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerIdentityProjectMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "createProjectIdentityMembership",
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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.params.projectId,
        event: {
          type: EventType.CREATE_IDENTITY_PROJECT_MEMBERSHIP,
          metadata: {
            identityId: req.params.identityId,
            roles: req.body.roles
          }
        }
      });

      return {
        identityMembership: { ...membership, identityId: req.params.identityId, projectId: req.params.projectId }
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "updateProjectIdentityMembership",
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
          identityMembership: IdentityProjectMembershipsSchema
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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.params.projectId,
        event: {
          type: EventType.UPDATE_IDENTITY_PROJECT_MEMBERSHIP,
          metadata: {
            identityId: req.params.identityId,
            roles: req.body.roles
          }
        }
      });

      return {
        identityMembership: { ...membership, identityId: req.params.identityId, projectId: req.params.projectId }
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "deleteProjectIdentityMembership",
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

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.params.projectId,
        event: {
          type: EventType.DELETE_IDENTITY_PROJECT_MEMBERSHIP,
          metadata: {
            identityId: req.params.identityId
          }
        }
      });

      return {
        identityMembership: { ...membership, identityId: req.params.identityId, projectId: req.params.projectId }
      };
    }
  });

  server.route({
    method: "GET",
    url: "/identities",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "listProjectIdentityMemberships",
      tags: [ApiDocsTags.IdentityProjectMembership],
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
          .max(1000)
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
    url: "/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getProjectIdentityMembershipById",
      tags: [ApiDocsTags.IdentityProjectMembership],
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
            lastLoginAuthMethod: z.string().nullable().optional(),
            lastLoginTime: z.date().nullable().optional(),
            identity: IdentitiesSchema.pick({ name: true, id: true, orgId: true, projectId: true }).extend({
              authMethods: z.array(z.string()),
              metadata: z
                .object({
                  id: z.string().trim().min(1),
                  key: z.string().trim().min(1),
                  value: z.string().trim().min(1)
                })
                .array()
                .optional()
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
    url: "/available-identities",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: false,
      operationId: "listAvailableProjectIdentities",
      tags: [ApiDocsTags.IdentityProjectMembership],
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
          .max(1000)
          .default(20)
          .describe(PROJECT_IDENTITY_MEMBERSHIP.LIST_AVAILABLE_IDENTITIES.limit)
          .optional(),
        identityName: z
          .string()
          .trim()
          .describe(PROJECT_IDENTITY_MEMBERSHIP.LIST_AVAILABLE_IDENTITIES.identityName)
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
          limit: req.query.limit,
          identityName: req.query.identityName
        }
      });

      return { identities };
    }
  });
};
