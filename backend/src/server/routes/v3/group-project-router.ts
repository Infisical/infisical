import { z } from "zod";

import { GroupsSchema } from "@app/db/schemas";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerGroupProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId/groups/:groupId",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Return project group",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        projectId: z.string().trim(),
        groupId: z.string().trim()
      }),
      response: {
        200: z.object({
          groupMembership: z.object({
            id: z.string(),
            groupId: z.string(),
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
            group: GroupsSchema.pick({ name: true, id: true, slug: true })
          })
        })
      }
    },
    handler: async (req) => {
      const groupMembership = await server.services.groupProject.getGroupInProject({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.params
      });

      return { groupMembership };
    }
  });
};
