/* eslint-disable @typescript-eslint/no-floating-promises */
import { pipeline } from "stream/promises";
import { z } from "zod";

import { ActionProjectType } from "@app/db/schemas";
import { getSSEHeaders } from "@app/ee/services/project-events/project-events-sse-service";
import { ProjectEventRegisterSchema } from "@app/ee/services/project-events/project-events-types";
import { ApiDocsTags, EventSubscriptions } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const CONNECTION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

export const registerEventRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/subscribe/project-events",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "subscribeToProjectEvents",
      tags: [ApiDocsTags.Events],
      description: "Subscribe to project events",
      body: z.object({
        projectId: z.string().trim().describe(EventSubscriptions.SUBSCRIBE_PROJECT_EVENTS.projectId),
        register: z.array(ProjectEventRegisterSchema).min(1).max(10)
      }),
      produces: ["text/event-stream"]
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req, reply) => {
      const client = await server.services.projectEventsSSE.subscribe({
        projectId: req.body.projectId,
        actor: req.auth.actor,
        actorId: req.permission.id,
        actorAuthMethod: req.auth.authMethod,
        actorOrgId: req.permission.orgId,
        actionProjectType: ActionProjectType.Any,
        register: req.body.register
      });

      reply.hijack();
      reply.raw.writeHead(200, getSSEHeaders()).flushHeaders();

      try {
        await pipeline(client.stream, reply.raw, { signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS) });
      } catch (error) {
        // ERR_STREAM_PREMATURE_CLOSE is expected when clients disconnect from SSE
        // ABORT_ERR is expected when connection timeout is reached
        const { code } = error as NodeJS.ErrnoException;
        if (code !== "ERR_STREAM_PREMATURE_CLOSE" && code !== "ABORT_ERR") {
          throw error;
        }
      }
    }
  });
};
