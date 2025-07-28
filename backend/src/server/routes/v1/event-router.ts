/* eslint-disable @typescript-eslint/no-floating-promises */
import { ForbiddenError } from "@casl/ability";
import { pipeline } from "stream/promises";
import { z } from "zod";

import { ActionProjectType } from "@app/db/schemas";
import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes } from "@app/keystore/keystore";
import { RateLimitError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { getServerSentEventsHeaders } from "@app/services/event/event-sse-stream";
import { EventName } from "@app/services/event/types";

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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req, reply) => {
      try {
        const { sse, permission } = req.server.services;
        const { redis } = req.server;

        const key = KeyStorePrefixes.SseConnection(req.body.projectId, req.permission.id);

        const count = await redis.get(key);

        if (count && parseInt(count, 10) >= 5) {
          throw new RateLimitError({
            message: `Too many active connections for project ${req.body.projectId}. Please close some connections before opening a new one.`
          });
        }

        reply.hijack();

        reply.raw.writeHead(200, getServerSentEventsHeaders()).flushHeaders();

        const control = new AbortController();

        reply.raw.on("close", () => {
          try {
            control.abort();
            if (!reply.raw.writableEnded) reply.raw.end();
          } catch (e) {
            logger.debug(e, "Request aborted");
          }
        });

        const stream = await sse.subscribe({
          async getPermissions() {
            const ability = await permission.getProjectPermission({
              actor: req.auth.actor,
              projectId: req.body.projectId,
              actionProjectType: ActionProjectType.Any,
              actorAuthMethod: req.auth.authMethod,
              actorId: req.permission.id,
              actorOrgId: req.permission.orgId
            });

            return ability.permission;
          },
          onPermissionCheck(permissions) {
            ForbiddenError.from(permissions).throwUnlessCan(
              ProjectPermissionSecretActions.Subscribe,
              ProjectPermissionSub.Secrets
            );
          },
          onClose() {
            void redis.decr(key);
          }
        });

        await redis.incr(key);
        await redis.expire(key, 60 * 5); // Set expiration to 5 minutes to avoid ratelimit locking

        await pipeline(stream, reply.raw, { signal: control.signal });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        throw error;
      }
    }
  });
};
