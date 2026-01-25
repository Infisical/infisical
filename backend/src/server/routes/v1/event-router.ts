/* eslint-disable @typescript-eslint/no-floating-promises */
import { pipeline } from "stream/promises";
import { z } from "zod";

import { ActionProjectType } from "@app/db/schemas";
import { getSSEHeaders } from "@app/ee/services/project-events";
import { ProjectEventRegisterSchema } from "@app/ee/services/project-events/project-events-types";
import { ApiDocsTags, EventSubscriptions } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

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
      await pipeline(client.stream, reply.raw);
    }
  });
};
