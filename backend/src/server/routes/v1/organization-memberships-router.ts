import { z } from "zod";

import { AccessScope, GroupsSchema, TemporaryPermissionMode } from "@app/db/schemas";
import { ApiDocsTags } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

/**
 * Organization group memberships.
 * - Scope: organizations (no org id in path).
 * - Actor type: groups. Resource: the membership (id, roles), not the group in isolation.
 */
const orgGroupMembershipRoleSchema = z.object({
  id: z.string(),
  role: z.string(),
  customRoleId: z.string().optional().nullable(),
  customRoleName: z.string().optional().nullable(),
  customRoleSlug: z.string().optional().nullable(),
  isTemporary: z.boolean(),
  temporaryMode: z.string().optional().nullable(),
  temporaryRange: z.string().nullable().optional(),
  temporaryAccessStartTime: z.date().nullable().optional(),
  temporaryAccessEndTime: z.date().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

const orgGroupMembershipSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  group: GroupsSchema.pick({ id: true, name: true, slug: true }).extend({
    orgId: z.string().uuid().optional()
  }),
  roles: z.array(orgGroupMembershipRoleSchema),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const registerOrganizationMembershipsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/memberships/groups",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "listOrganizationGroupMemberships",
      tags: [ApiDocsTags.Groups],
      description: "List organization group memberships",
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        limit: z.coerce.number().min(1).max(100).default(100).optional(),
        offset: z.coerce.number().min(0).default(0).optional()
      }),
      response: {
        200: z.object({
          groupMemberships: z.array(orgGroupMembershipSchema),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { memberships, totalCount } = await server.services.membershipGroup.listMemberships({
        permission: req.permission,
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
        },
        data: {
          limit: req.query.limit,
          offset: req.query.offset
        }
      });

      return {
        groupMemberships: memberships.map((m) => ({
          ...m,
          groupId: m.actorGroupId as string,
          group: m.group
        })),
        totalCount
      };
    }
  });

  server.route({
    method: "POST",
    url: "/memberships/groups/:groupId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: false,
      operationId: "createOrganizationGroupMembership",
      tags: [ApiDocsTags.Groups],
      description:
        "Create organization group membership (link group to current org). Sub-org only: links a parent-org group.",
      security: [{ bearerAuth: [] }],
      params: z.object({
        groupId: z.string().uuid().describe("The ID of the group to link to the current organization")
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
      }),
      response: {
        200: z.object({
          groupMembership: orgGroupMembershipSchema
        })
      }
    },
    handler: async (req) => {
      await server.services.membershipGroup.createMembership({
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
        },
        permission: req.permission,
        data: {
          groupId: req.params.groupId,
          roles: req.body.roles
        }
      });

      const { membership: full } = await server.services.membershipGroup.getMembershipByGroupId({
        permission: req.permission,
        scopeData: { scope: AccessScope.Organization, orgId: req.permission.orgId },
        selector: { groupId: req.params.groupId }
      });

      return {
        groupMembership: {
          ...full,
          groupId: full.actorGroupId as string,
          group: full.group
        }
      };
    }
  });

  server.route({
    method: "GET",
    url: "/memberships/groups/:groupId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getOrganizationGroupMembership",
      tags: [ApiDocsTags.Groups],
      description: "Get organization group membership by group ID.",
      security: [{ bearerAuth: [] }],
      params: z.object({
        groupId: z.string().uuid()
      }),
      response: {
        200: z.object({
          groupMembership: orgGroupMembershipSchema
        })
      }
    },
    handler: async (req) => {
      const { membership } = await server.services.membershipGroup.getMembershipByGroupId({
        permission: req.permission,
        scopeData: { scope: AccessScope.Organization, orgId: req.permission.orgId },
        selector: { groupId: req.params.groupId }
      });

      return {
        groupMembership: {
          ...membership,
          groupId: membership.actorGroupId as string,
          group: membership.group
        }
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/memberships/groups/:groupId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: false,
      operationId: "updateOrganizationGroupMembership",
      tags: [ApiDocsTags.Groups],
      description: "Update organization group membership roles.",
      security: [{ bearerAuth: [] }],
      params: z.object({
        groupId: z.string().uuid()
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
      }),
      response: {
        200: z.object({
          groupMembership: orgGroupMembershipSchema
        })
      }
    },
    handler: async (req) => {
      await server.services.membershipGroup.updateMembership({
        permission: req.permission,
        scopeData: { scope: AccessScope.Organization, orgId: req.permission.orgId },
        selector: { groupId: req.params.groupId },
        data: { roles: req.body.roles }
      });

      const { membership: full } = await server.services.membershipGroup.getMembershipByGroupId({
        permission: req.permission,
        scopeData: { scope: AccessScope.Organization, orgId: req.permission.orgId },
        selector: { groupId: req.params.groupId }
      });

      return {
        groupMembership: {
          ...full,
          groupId: full.actorGroupId as string,
          group: full.group
        }
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/memberships/groups/:groupId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: false,
      operationId: "deleteOrganizationGroupMembership",
      tags: [ApiDocsTags.Groups],
      description:
        "Unlink a group from the current organization. Only applicable in sub-organizations where the group is linked; cannot be used in the organization that owns the group.",
      security: [{ bearerAuth: [] }],
      params: z.object({
        groupId: z.string().uuid()
      }),
      response: {
        200: z.object({
          groupMembership: z.object({
            id: z.string().uuid(),
            groupId: z.string().uuid(),
            orgId: z.string(),
            createdAt: z.date(),
            updatedAt: z.date()
          })
        })
      }
    },
    handler: async (req) => {
      const { membership } = await server.services.membershipGroup.deleteMembership({
        scopeData: { scope: AccessScope.Organization, orgId: req.permission.orgId },
        permission: req.permission,
        selector: { groupId: req.params.groupId }
      });

      return {
        groupMembership: {
          ...membership,
          groupId: req.params.groupId,
          orgId: req.permission.orgId
        }
      };
    }
  });
};
