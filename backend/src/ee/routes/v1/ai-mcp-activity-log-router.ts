import { z } from "zod";

import { AiMcpActivityLogsSchema } from "@app/db/schemas";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerAiMcpActivityLogRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        projectId: z.string().trim().min(1)
      }),
      response: {
        200: z.array(AiMcpActivityLogsSchema)
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const activityLogs = await server.services.aiMcpActivityLog.listActivityLogs({
        projectId: req.query.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return activityLogs;
    }
  });
};
