import { z } from "zod";

import { IdentitiesSchema } from "@app/db/schemas/identities";
import { IdentityOrgMembershipsSchema } from "@app/db/schemas/identity-org-memberships";
import { OrgRolesSchema } from "@app/db/schemas/org-roles";
import { ApiDocsTags, ORGANIZATIONS } from "@app/lib/api-docs";
import { OrderByDirection } from "@app/lib/types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { OrgIdentityOrderBy } from "@app/services/identity/identity-types";

export const registerIdentityOrgRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:orgId/identity-memberships",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "listOrgIdentityMemberships",
      tags: [ApiDocsTags.Organizations],
      description: "Return organization identity memberships",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        orgId: z.string().trim().describe(ORGANIZATIONS.LIST_IDENTITY_MEMBERSHIPS.orgId)
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0).describe(ORGANIZATIONS.LIST_IDENTITY_MEMBERSHIPS.offset).optional(),
        limit: z.coerce
          .number()
          .min(1)
          .max(20000) // TODO: temp limit until combobox added to add identity to project modal, reduce once added
          .default(100)
          .describe(ORGANIZATIONS.LIST_IDENTITY_MEMBERSHIPS.limit)
          .optional(),
        orderBy: z
          .nativeEnum(OrgIdentityOrderBy)
          .default(OrgIdentityOrderBy.Name)
          .describe(ORGANIZATIONS.LIST_IDENTITY_MEMBERSHIPS.orderBy)
          .optional(),
        orderDirection: z
          .nativeEnum(OrderByDirection)
          .default(OrderByDirection.ASC)
          .describe(ORGANIZATIONS.LIST_IDENTITY_MEMBERSHIPS.orderDirection)
          .optional(),
        search: z.string().trim().describe(ORGANIZATIONS.LIST_IDENTITY_MEMBERSHIPS.search).optional()
      }),
      response: {
        200: z.object({
          identityMemberships: IdentityOrgMembershipsSchema.merge(
            z.object({
              customRole: OrgRolesSchema.pick({
                id: true,
                name: true,
                slug: true,
                permissions: true,
                description: true
              }).optional(),
              identity: IdentitiesSchema.pick({ name: true, id: true, orgId: true }).extend({
                authMethods: z.array(z.string())
              })
            })
          ).array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { identityMemberships, totalCount } = await server.services.identityV1.listOrgIdentities({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.params.orgId,
        limit: req.query.limit,
        offset: req.query.offset,
        orderBy: req.query.orderBy,
        orderDirection: req.query.orderDirection,
        search: req.query.search
      });

      return { identityMemberships, totalCount };
    }
  });
};
