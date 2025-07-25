/* eslint-disable @typescript-eslint/no-floating-promises */
import { pipeline } from "stream/promises";
import { z } from "zod";

import { ActionProjectType } from "@app/db/schemas";
import { logger } from "@app/lib/logger";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { ServerSentEventsResponse } from "@app/services/event-bus/response";
import { EventSchema, TopicName } from "@app/services/event-bus/types";

const EventName = z.string().refine(
  (arg) => {
    const [source, subject, action] = arg.split(":");

    return source === "infisical" && !!subject && !!action;
  },
  {
    message: "Event name must be in format 'source:subject:action'"
  }
);

export const registerEventRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/subscribe/project-events",
    config: {
      rateLimit: readLimit
    },
    schema: {
      body: z.object({
        projectId: z.string().trim(),
        register: z.array(
          z.object({
            event: EventName,
            conditions: z.object({
              secretPath: z.string(),
              environmentSlug: z.string().optional()
            })
          })
        )
      })
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]),
    handler: async (req, reply) => {
      try {
        const res = reply.raw;

        reply.hijack();

        res.writeHead(200, ServerSentEventsResponse.getHeaders()).flushHeaders();

        const { events } = req.server.services;

        const control = new AbortController();

        res.on("close", () => {
          try {
            control.abort();
            if (!res.writableEnded) res.end();
          } catch (e) {
            logger.debug(e, "Request aborted");
          }
        });

        const permission = {
          actor: req.auth.actor,
          projectId: req.body.projectId,
          actionProjectType: ActionProjectType.Any,
          actorAuthMethod: req.auth.authMethod,
          actorId: req.permission.id,
          actorOrgId: req.permission.orgId
        };

        const stream = await events.subscribe(TopicName.CoreServers, {
          permission,
          readable: {
            objectMode: true,
            signal: control.signal
          }
        });

        await pipeline(stream, new ServerSentEventsResponse(), res);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        throw error;
      }
    }
  });

  server.route({
    method: "POST",
    url: "/publish",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: EventSchema,
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN]),
    handler: async (req, res) => {
      const { events } = req.server.services;

      await events.publish(TopicName.CoreServers, req.body);

      return res.code(200).send({
        message: "Event published successfully"
      });
    }
  });
};
