import type WebSocket from "ws";
import z from "zod";

import { UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { BadRequestError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerPamSessionRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:accountId/web-access-ticket",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "pamSessionWebAccessTicket",
      params: z.object({
        accountId: z.string().uuid()
      }),
      body: z.object({
        reason: z.string().trim().max(1000).optional()
      }),
      response: {
        200: z.object({ ticket: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new BadRequestError({ message: "Web access requires JWT authentication" });
      }

      const { ticket } = await server.services.pamWebAccess.issueWebSocketTicket({
        accountId: req.params.accountId,
        projectId: req.internalPamProjectId,
        orgId: req.permission.orgId,
        actor: req.permission,
        actorEmail: req.auth.user.email ?? "",
        actorName: `${req.auth.user.firstName ?? ""} ${req.auth.user.lastName ?? ""}`.trim(),
        auditLogInfo: req.auditLogInfo,
        reason: req.body.reason
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamSessionStarted,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            orgId: req.permission.orgId
          }
        })
        .catch(() => {});

      return { ticket };
    }
  });

  server.route({
    method: "GET",
    url: "/:accountId/web-access",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "pamSessionWebAccess",
      params: z.object({
        accountId: z.string().uuid()
      }),
      querystring: z.object({
        ticket: z.string()
      }),
      response: {
        200: z.object({ message: z.string() })
      }
    },
    wsHandler: async (connection: WebSocket, req) => {
      const preAuthMessages: { data: Buffer; isBinary: boolean }[] = [];
      const preAuthHandler = (raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
        let buf: Buffer;
        if (Buffer.isBuffer(raw)) {
          buf = raw;
        } else if (Array.isArray(raw)) {
          buf = Buffer.concat(raw);
        } else {
          buf = Buffer.from(raw);
        }
        preAuthMessages.push({ data: buf, isBinary });
      };
      connection.on("message", preAuthHandler);

      try {
        const ticketValue = req.query.ticket;
        const separatorIndex = ticketValue.indexOf(":");
        if (separatorIndex === -1) {
          connection.off("message", preAuthHandler);
          connection.close(4001, "Invalid or expired ticket");
          return;
        }

        const userId = ticketValue.slice(0, separatorIndex);
        const tokenCode = ticketValue.slice(separatorIndex + 1);

        const tokenRecord = await server.services.authToken.validateTokenForUser({
          type: TokenType.TOKEN_PAM_WS_TICKET,
          userId,
          code: tokenCode
        });

        if (!tokenRecord?.payload) {
          connection.off("message", preAuthHandler);
          connection.close(4001, "Invalid or expired ticket");
          return;
        }

        const payload = z
          .object({
            accountId: z.string(),
            projectId: z.string(),
            orgId: z.string(),
            accountName: z.string(),
            accountType: z.string(),
            actorEmail: z.string(),
            actorName: z.string(),
            reason: z.string().nullable().optional(),
            auditLogInfo: z.object({
              ipAddress: z.string().optional(),
              userAgent: z.string().optional(),
              userAgentType: z.nativeEnum(UserAgentType).optional(),
              actor: z.object({
                type: z.nativeEnum(ActorType),
                metadata: z.record(z.unknown())
              })
            })
          })
          .parse(JSON.parse(tokenRecord.payload));

        if (payload.accountId !== req.params.accountId) {
          connection.off("message", preAuthHandler);
          connection.close(4001, "Invalid or expired ticket");
          return;
        }

        await server.services.pamWebAccess.handleWebSocketConnection({
          socket: connection,
          accountId: payload.accountId,
          projectId: payload.projectId,
          orgId: payload.orgId,
          accountName: payload.accountName,
          actorEmail: payload.actorEmail,
          actorName: payload.actorName,
          auditLogInfo: payload.auditLogInfo as Parameters<
            typeof server.services.pamWebAccess.handleWebSocketConnection
          >[0]["auditLogInfo"],
          userId,
          actorIp: req.realIp ?? "",
          actorUserAgent: req.headers["user-agent"] ?? "",
          reason: payload.reason,
          preAuthMessages,
          preAuthHandler
        });
      } catch (err) {
        connection.off("message", preAuthHandler);
        connection.close(4001, "Invalid or expired ticket");
      }
    },
    handler: async () => {
      return { message: "WebSocket upgrade required" };
    }
  });
};
