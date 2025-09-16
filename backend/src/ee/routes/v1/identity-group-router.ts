import { z } from "zod";

import { IdentityGroupsSchema, OrgMembershipRole } from "@app/db/schemas";
import { ApiDocsTags, GROUPS } from "@app/lib/api-docs";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerIdentityGroupRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentityGroups],
      body: z.object({
        name: z.string().trim().min(1).max(50).describe(GROUPS.CREATE.name),
        slug: slugSchema({ min: 5, max: 36 }).optional().describe(GROUPS.CREATE.slug),
        role: z.string().trim().min(1).default(OrgMembershipRole.NoAccess).describe(GROUPS.CREATE.role)
      }),
      response: {
        200: IdentityGroupsSchema
      }
    },
    handler: async (req) => {
      const group = await server.services.identityGroup.createIdentityGroup({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      return group;
    }
  });
};
