import { z } from "zod";

import { AccessScope, TemporaryPermissionMode } from "@app/db/schemas";
import { ApiDocsTags } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const sanitizedOrgGroupMembershipSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string(),
  groupId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const registerGroupOrgMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/available-groups",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: false,
      operationId: "listAvailableOrganizationGroups",
      tags: [ApiDocsTags.Groups],
      description: "List available groups from parent org for linking to sub-organization",
      response: {
        200: z.object({
          groups: z
            .object({
              id: z.string().uuid(),
              name: z.string(),
              slug: z.string()
            })
            .array()
        })
      }
    },
    handler: async (req) => {
      const groups = await server.services.group.listAvailableGroups({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        rootOrgId: req.permission.rootOrgId
      });

      return { groups };
    }
  });

  server.route({
    method: "POST",
    url: "/group-memberships/:groupId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: false,
      operationId: "createOrganizationGroupMembership",
      tags: [ApiDocsTags.Groups],
      description: "Link a group from parent organization to this sub-organization",
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
          groupMembership: sanitizedOrgGroupMembershipSchema
        })
      }
    },
    handler: async (req) => {
      const { membership } = await server.services.membershipGroup.createMembership({
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

      return {
        groupMembership: {
          ...membership,
          groupId: req.params.groupId,
          orgId: req.permission.orgId
        }
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/group-memberships/:groupId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: false,
      operationId: "deleteOrganizationGroupMembership",
      tags: [ApiDocsTags.Groups],
      description: "Unlink a group from this sub-organization",
      params: z.object({
        groupId: z.string().uuid()
      }),
      response: {
        200: z.object({
          groupMembership: sanitizedOrgGroupMembershipSchema
        })
      }
    },
    handler: async (req) => {
      const { membership } = await server.services.membershipGroup.deleteMembership({
        scopeData: {
          scope: AccessScope.Organization,
          orgId: req.permission.orgId
        },
        permission: req.permission,
        selector: {
          groupId: req.params.groupId
        }
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
