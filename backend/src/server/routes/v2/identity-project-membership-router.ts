import { z } from "zod";

import { AccessScope, IdentitiesSchema } from "@app/db/schemas";
import { ApiDocsTags, PROJECT_IDENTITY_MEMBERSHIP } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerIdentityProjectMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId/identity-memberships",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
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
};
