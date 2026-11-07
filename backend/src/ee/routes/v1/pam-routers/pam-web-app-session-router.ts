import type WebSocket from "ws";
import { z } from "zod";

import {
  CreateWebAppSessionSchema,
  WebAppSessionViewSchema,
  WebAppStateReportSchema
} from "@app/ee/services/pam-web-app-session/pam-web-app-session-schemas";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { isUserSessionAuth } from "@app/server/plugins/auth/inject-identity";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const params = z.object({ sessionId: z.string().uuid().describe("Browser session ID") });
const response = z.object({ session: WebAppSessionViewSchema });

export const registerPamWebAppSessionRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "createPamWebAppSession",
      tags: [ApiDocsTags.PamSessions],
      body: CreateWebAppSessionSchema,
      response: { 201: response }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, reply) => {
      if (!isUserSessionAuth(req.auth))
        throw new BadRequestError({ message: "Web App sessions require user authentication" });
      const session = await server.services.pamWebAppSession.createSession({
        ...req.body,
        projectId: req.internalPamProjectId,
        actor: req.permission,
        tokenVersionId: req.auth.tokenVersionId,
        actorEmail: req.auth.user.email ?? "",
        actorName: `${req.auth.user.firstName ?? ""} ${req.auth.user.lastName ?? ""}`.trim(),
        actorIp: req.realIp ?? "",
        actorUserAgent: req.headers["user-agent"] ?? "",
        auditLogInfo: req.auditLogInfo
      });
      return reply.code(201).send({ session });
    }
  });
  server.route({
    method: "GET",
    url: "/mine",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listMyPamWebAppSessions",
      tags: [ApiDocsTags.PamSessions],
      response: { 200: z.object({ sessions: z.array(WebAppSessionViewSchema) }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => ({
      sessions: await server.services.pamWebAppSession.listMyActiveSessions(req.internalPamProjectId, req.permission)
    })
  });
  server.route({
    method: "GET",
    url: "/:sessionId",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getPamWebAppSession",
      tags: [ApiDocsTags.PamSessions],
      params,
      response: { 200: response }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => ({
      session: await server.services.pamWebAppSession.getSession(req.params.sessionId, req.permission)
    })
  });
  server.route({
    method: "POST",
    url: "/:sessionId/attach-tickets",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "createPamWebAppAttachTicket",
      tags: [ApiDocsTags.PamSessions],
      params,
      body: z.object({ takeControl: z.boolean().optional().describe("Explicitly take control from another viewer") }),
      response: { 200: z.object({ ticket: z.string() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (!isUserSessionAuth(req.auth))
        throw new BadRequestError({ message: "Browser attachment requires user authentication" });
      return server.services.pamWebAppSession.issueAttachTicket({
        sessionId: req.params.sessionId,
        takeControl: req.body.takeControl,
        actor: req.permission,
        tokenVersionId: req.auth.tokenVersionId,
        accessVersion: req.auth.token.accessVersion
      });
    }
  });
  server.route({
    method: "GET",
    url: "/:sessionId/attach",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "attachPamWebAppSession",
      tags: [ApiDocsTags.PamSessions],
      params,
      querystring: z.object({
        ticket: z
          .string()
          .min(43)
          .max(43)
          .regex(/^[A-Za-z0-9_-]+$/)
          .describe("Single-use browser attachment ticket")
      }),
      response: { 200: z.object({ message: z.string() }) }
    },
    wsHandler: async (socket: WebSocket, req) => {
      const earlyMessage = () => socket.close(4001, "Wait for browser attachment");
      socket.on("message", earlyMessage);
      try {
        const { consumed, record, actor } = await server.services.pamWebAppSession.consumeAttachTicket(
          req.params.sessionId,
          req.query.ticket,
          req.headers.origin
        );
        await server.services.pamWebAppSession.handleAttach(socket, record, consumed, actor);
        socket.off("message", earlyMessage);
      } catch (error) {
        socket.off("message", earlyMessage);
        logger.warn({ error, sessionId: req.params.sessionId }, "Browser attachment refused");
        socket.close(4001, "Browser attachment refused");
      }
    },
    handler: async () => {
      throw new BadRequestError({ message: "Use a WebSocket connection to attach to this browser" });
    }
  });
  server.route({
    method: "POST",
    url: "/:sessionId/end",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "endPamWebAppSession",
      tags: [ApiDocsTags.PamSessions],
      params,
      response: { 200: response }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => ({
      session: await server.services.pamWebAppSession.endSession(req.params.sessionId, req.permission, req.auditLogInfo)
    })
  });
};

export const registerPamWebAppStateRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:sessionId/web-app/state",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "reportPamWebAppState",
      tags: [ApiDocsTags.PamSessions],
      params,
      body: WebAppStateReportSchema,
      response: {
        200: z.object({
          leaseUntil: z.date(),
          leaseSeconds: z.number().int().min(0).max(45),
          expiresAt: z.date(),
          cancel: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.GATEWAY_ACCESS_TOKEN]),
    handler: (req) =>
      server.services.pamWebAppSession.reportState({ ...req.body, sessionId: req.params.sessionId }, req.permission)
  });
};
