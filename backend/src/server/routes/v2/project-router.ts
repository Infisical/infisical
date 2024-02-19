import { z } from "zod";

import { ProjectKeysSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/:workspaceId/encrypted-key",
    method: "GET",
    schema: {
      description: "Return encrypted project key",
      security: [
        {
          apiKeyAuth: []
        }
      ],
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
        projectId: req.params.workspaceId,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.GET_WORKSPACE_KEY,
          metadata: {
            keyId: key?.id as string
          }
        }
      });

      return key;
    }
  });
};
