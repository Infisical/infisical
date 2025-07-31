/* eslint-disable @typescript-eslint/no-floating-promises */
import { subject } from "@casl/ability";
import { pipeline } from "stream/promises";
import { z } from "zod";

import { ActionProjectType, ProjectType } from "@app/db/schemas";
import { getServerSentEventsHeaders } from "@app/ee/services/event/event-sse-stream";
import { EventRegisterSchema } from "@app/ee/services/event/types";
import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, RateLimitError } from "@app/lib/errors";
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
      body: z.object({
        projectId: z.string().trim(),
        register: z.array(EventRegisterSchema).max(10)
      })
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req, reply) => {
      try {
        const { sse, permission, identityAccessToken, authToken, license } = req.server.services;

        const plan = await license.getPlan(req.auth.orgId);

        if (!plan.eventSubscriptions) {
          throw new BadRequestError({
            message:
              "Failed to use event subscriptions due to plan restriction. Upgrade plan to access enterprise event subscriptions."
          });
        }

        const count = await sse.getActiveConnectionsCount(req.body.projectId, req.permission.id);

        if (count >= 5) {
          throw new RateLimitError({
            message: `Too many active connections for project ${req.body.projectId}. Please close some connections before opening a new one.`
          });
        }

        const client = await sse.subscribe({
          type: ProjectType.SecretManager,
          registered: req.body.register,
          async getAuthInfo() {
            const ability = await permission.getProjectPermission({
              actor: req.auth.actor,
              projectId: req.body.projectId,
              actionProjectType: ActionProjectType.Any,
              actorAuthMethod: req.auth.authMethod,
              actorId: req.permission.id,
              actorOrgId: req.permission.orgId
            });

            return { permission: ability.permission, actorId: req.permission.id, projectId: req.body.projectId };
          },
          async onAuthRefresh(info) {
            switch (req.auth.authMode) {
              case AuthMode.JWT:
                await authToken.fnValidateJwtIdentity(req.auth.token);
                break;
              case AuthMode.IDENTITY_ACCESS_TOKEN:
                await identityAccessToken.fnValidateIdentityAccessToken(req.auth.token, req.realIp);
                break;
              default:
                throw new Error("Unsupported authentication method");
            }

            req.body.register.forEach((r) => {
              const allowed = info.permission.can(
                ProjectPermissionSecretActions.Subscribe,
                subject(ProjectPermissionSub.Secrets, {
                  environment: r.conditions?.environmentSlug ?? "",
                  secretPath: r.conditions?.secretPath ?? "/",
                  eventType: r.event
                })
              );

              if (!allowed) {
                throw new ForbiddenRequestError({
                  name: "PermissionDenied",
                  message: `You are not allowed to subscribe on secrets`,
                  details: {
                    event: r.event,
                    environmentSlug: r.conditions?.environmentSlug,
                    secretPath: r.conditions?.secretPath ?? "/"
                  }
                });
              }
            });
          }
        });

        // Switches to manual response and enable SSE streaming
        reply.hijack();
        reply.raw.writeHead(200, getServerSentEventsHeaders()).flushHeaders();
        reply.raw.on("close", client.abort);

        await pipeline(client.stream, reply.raw, { signal: client.signal });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          // If the stream is aborted, we don't need to do anything
          return;
        }

        throw error;
      }
    }
  });
};
