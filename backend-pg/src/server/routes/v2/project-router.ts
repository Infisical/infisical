import { ProjectKeysSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { z } from "zod";

export const registerProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/:workspaceId/encrypted-key",
    method: "GET",
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      response: {
        200: ProjectKeysSchema.merge(
          z.object({
            sender: z.object({
              publicKey: z.string()
            })
          })
        )
      }
    },
    onResponse: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const key = await server.services.projectKey.getLatestProjectKey({
        actor: req.permission.type,
        actorId: req.permission.id,
        projectId: req.params.workspaceId
      });

      return key;
    }
  });
};
