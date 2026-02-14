import { z } from "zod";

import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

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
};
