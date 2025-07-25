/* eslint-disable @typescript-eslint/no-floating-promises */
import { z } from "zod";

import { writeLimit } from "@app/server/config/rateLimiter";
import { TopicName } from "@app/services/events";
import { logger } from "@app/lib/logger";

export const registerEventRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/subscribe",
    schema: {
      body: z.object({
        projectId: z.string().trim(),
        events: z.array(
          z.object({
            type: z.string()
          })
        )
      })
    },
    // onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, reply) => {
      try {
        const res = reply.raw;

        reply.hijack();

        res.writeHead(200, {
          "Cache-Control": "no-cache",
          "Content-Type": "text/event-stream",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
          "Access-Control-Allow-Origin": "*" // TODO: Testing
        });

        res.flushHeaders();

        const { events } = req.server.services;

        const control = new AbortController();

        control.signal.addEventListener("abort", () => {
          if (!res.writableEnded) res.end();
        });

        res.on("close", () => {
          try {
            control.abort();
          } catch (e) {
            logger.debug(e, "Request aborted");
          }
        });

        const stream = await events.subscribe(TopicName.CoreServers, control.signal);

        for await (const event of stream()) {
          logger.info( event.data,`Sending sse to client: ${event.type}`);

          if (res.writableEnded) {
            logger.info("Response has ended, stopping event stream");
            break;
          }

          const serialized = events.serialize({
            id: event.time,
            event: event.type,
            data: JSON.stringify(event)
          });

          res.write(serialized);
        }
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
      rateLimit: writeLimit // TODO: Change this to a more appropriate limit
    },
    schema: {
      body: z.record(z.string(), z.any()),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    // onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, res) => {
      const { events } = req.server.services;

      await events.publish(TopicName.CoreServers, {
        source: "infisical-api",
        type: "secrets-manager",
        data: {
          event_type: "test_event",
          payload: req.body
        }
      });

      return res.code(200).send({
        message: "Event published successfully"
      });
    }
  });
};
