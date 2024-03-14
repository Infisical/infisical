import { z } from "zod";

import { IdentitiesSchema, IdentityOrgMembershipsSchema, OrgRolesSchema } from "@app/db/schemas";
import { ORGANIZATIONS } from "@app/lib/api-docs";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerIdentityOrgRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:orgId/identity-memberships",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Return organization identity memberships",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      params: z.object({
        orgId: z.string().trim().describe(ORGANIZATIONS.LIST_IDENTITY_MEMBERSHIPS.orgId)
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
              identity: IdentitiesSchema.pick({ name: true, id: true, authMethod: true })
            })
          ).array()
        })
      }
    },
    handler: async (req) => {
      const identityMemberships = await server.services.identity.listOrgIdentities({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        orgId: req.params.orgId
      });
      return { identityMemberships };
    }
  });
};
