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
        projectId: z.string().trim().min(1),
        endpointName: z.string().optional(),
        serverName: z.string().optional(),
        toolName: z.string().optional(),
        actor: z.string().optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        offset: z.coerce.number().default(0),
        limit: z.coerce.number().max(100).default(20)
      }),
      response: {
        200: z.object({
          activityLogs: z.array(AiMcpActivityLogsSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId, endpointName, serverName, toolName, actor, startDate, endDate, offset, limit } = req.query;

      const activityLogs = await server.services.aiMcpActivityLog.listActivityLogs({
        projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        filter: {
          endpointName,
          serverName,
          toolName,
          actor,
          startDate,
          endDate,
          offset,
          limit
        }
      });

      return { activityLogs };
    }
  });
};
