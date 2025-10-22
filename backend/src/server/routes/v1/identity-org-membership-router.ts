import { z } from "zod";

import { AccessScope, TemporaryPermissionMode } from "@app/db/schemas";
import { ApiDocsTags, PROJECT_IDENTITIES } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const sanitizedOrgIdentityMembershipSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string(),
  identityId: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const registerOrgIdentityMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/identity-memberships/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true,
      // this is hidden so not updating tags
      tags: [ApiDocsTags.ProjectIdentities],
      description: "Create org identity membership",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim()
      }),
      body: z.object({
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
          .max(1)
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

      return {
        identityMembership: { ...membership, identityId: req.params.identityId, orgId: req.permission.orgId }
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
      tags: [ApiDocsTags.ProjectIdentities],
      description: "Delete org identity memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(PROJECT_IDENTITIES.DELETE_IDENTITY_MEMBERSHIP.identityId)
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

      return {
        identityMembership: { ...membership, identityId: req.params.identityId, orgId: req.permission.orgId }
      };
    }
  });
};
