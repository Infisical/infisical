import type WebSocket from "ws";
import z from "zod";

import { PamSessionsSchema } from "@app/db/schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { PamAccountType, PamSessionStatus } from "@app/ee/services/pam/pam-enums";
import { PamPolicyRulesSchema } from "@app/ee/services/pam/pam-policies";
import { PamRecordingStorageBackend } from "@app/ee/services/pam-session-recording/pam-recording-enums";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const SanitizedSessionSchema = PamSessionsSchema.pick({
  id: true,
  accountId: true,
  accountType: true,
  accountName: true,
  userId: true,
  actorName: true,
  actorEmail: true,
  actorIp: true,
  actorUserAgent: true,
  status: true,
  expiresAt: true,
  startedAt: true,
  endedAt: true,
  createdAt: true,
  updatedAt: true,
  accessMethod: true,
  reason: true,
  gatewayId: true,
  resourceName: true,
  folderName: true,
  selectedHost: true
}).extend({
  folderId: z.string().nullable().optional(),
  gatewayName: z.string().nullable().optional(),
  gatewayIdentityId: z.string().nullable().optional()
});

export const registerPamSessionRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listPamSessions",
      description: "List PAM sessions for a project",
      tags: [ApiDocsTags.PamSessions],
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0).optional().describe("The offset to start from for pagination"),
        limit: z.coerce
          .number()
          .min(1)
          .max(100)
          .default(20)
          .optional()
          .describe("The number of records to return for pagination"),
        search: z
          .string()
          .trim()
          .optional()
          .describe("Search by account name, actor name, actor email, or folder name"),
        status: z.nativeEnum(PamSessionStatus).optional().describe("Filter by session status")
      }),
      response: {
        200: z.object({ sessions: SanitizedSessionSchema.array(), totalCount: z.number() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { sessions, totalCount } = await server.services.pamSession.listSessions(
        req.internalPamProjectId,
        {
          actor: req.permission.type,
          actorId: req.permission.id,
          actorOrgId: req.permission.orgId,
          actorAuthMethod: req.permission.authMethod
        },
        { offset: req.query.offset, limit: req.query.limit, search: req.query.search, status: req.query.status }
      );
      return { sessions, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:sessionId",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getPamSession",
      description: "Get a PAM session by ID",
      tags: [ApiDocsTags.PamSessions],
      params: z.object({
        sessionId: z.string().uuid().describe("The ID of the session")
      }),
      response: {
        200: z.object({ session: SanitizedSessionSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const session = await server.services.pamSession.getSessionById(req.params.sessionId, {
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      if (!session) {
        throw new NotFoundError({ message: "Session not found" });
      }
      return { session };
    }
  });

  server.route({
    method: "GET",
    url: "/:sessionId/credentials",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getPamSessionCredentials",
      description: "Get connection credentials for a PAM session",
      tags: [ApiDocsTags.PamSessions],
      params: z.object({
        sessionId: z.string().uuid().describe("The ID of the session")
      }),
      response: {
        200: z.object({
          credentials: z.record(z.unknown()),
          recording: z
            .object({
              sessionKey: z.string(),
              uploadToken: z.string(),
              storageBackend: z.nativeEnum(PamRecordingStorageBackend),
              projectId: z.string(),
              sessionId: z.string()
            })
            .nullable(),
          policyRules: PamPolicyRulesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.GATEWAY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pamSession.getSessionCredentials(req.params.sessionId, req.permission.id);

      if (result.sessionStarted) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId: result.projectId,
          event: {
            type: EventType.PAM_SESSION_START,
            metadata: {
              sessionId: req.params.sessionId,
              accountId: result.accountId ?? undefined,
              accountName: result.accountName
            }
          }
        });

        void server.services.telemetry
          .sendPostHogEvents({
            event: PostHogEventTypes.PamSessionStarted,
            distinctId: result.actorEmail || getTelemetryDistinctId(req),
            organizationId: req.permission.orgId,
            properties: {
              accountType: result.accountType,
              orgId: req.permission.orgId
            }
          })
          .catch(() => {});
      }

      return {
        credentials: result.credentials,
        recording: result.recording,
        policyRules: result.policyRules ?? null
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:sessionId/end",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "endPamSession",
      description: "End a PAM session",
      tags: [ApiDocsTags.PamSessions],
      params: z.object({
        sessionId: z.string().uuid().describe("The ID of the session")
      }),
      response: {
        200: z.object({ message: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.GATEWAY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { projectId, accountId, accountName, alreadyEnded } =
        await server.services.pamSession.endSessionFromGateway(req.params.sessionId, req.permission.id);

      if (!alreadyEnded) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId,
          event: {
            type: EventType.PAM_SESSION_END,
            metadata: {
              sessionId: req.params.sessionId,
              accountId: accountId ?? undefined,
              accountName
            }
          }
        });
      }

      return { message: "Session ended" };
    }
  });

  server.route({
    method: "POST",
    url: "/:sessionId/terminate",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "terminatePamSession",
      description: "Terminate an active PAM session",
      tags: [ApiDocsTags.PamSessions],
      params: z.object({
        sessionId: z.string().uuid().describe("The ID of the session")
      }),
      response: {
        200: z.object({ session: SanitizedSessionSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { session, projectId, accountName } = await server.services.pamSession.terminateSession(
        req.params.sessionId,
        {
          actor: req.permission.type,
          actorId: req.permission.id,
          actorOrgId: req.permission.orgId,
          actorAuthMethod: req.permission.authMethod
        }
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.PAM_SESSION_TERMINATE,
          metadata: {
            sessionId: req.params.sessionId,
            accountId: session.accountId ?? undefined,
            accountName
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamSessionTerminated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            accountType: session.accountType,
            orgId: req.permission.orgId
          }
        })
        .catch(() => {});

      return { session };
    }
  });
};

export const registerPamWebAccessRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/access",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "pamAccountAccess",
      description: "Access a PAM account by path and obtain gateway connection details",
      tags: [ApiDocsTags.PamSessions],
      body: z.object({
        path: z.string().trim().min(3).describe("Account path in the format 'folderName/accountName'"),
        reason: z.string().trim().max(1000).optional().describe("Optional reason for the session"),
        duration: z
          .string()
          .trim()
          .optional()
          .describe("Session duration (e.g. '1h', '30m'). Capped at the account's max session duration."),
        mfaSessionId: z.string().max(64).optional().describe("MFA session ID from a completed MFA verification")
      }),
      response: {
        200: z.object({
          sessionId: z.string().describe("The ID of the created session"),
          accountType: z.nativeEnum(PamAccountType).describe("The account type"),
          metadata: z.record(z.string()).optional().describe("Account-type-specific metadata (e.g., username)"),
          relayHost: z.string().describe("The relay host to connect to"),
          relayClientCertificate: z.string().describe("Client certificate for the relay connection"),
          relayClientPrivateKey: z.string().describe("Client private key for the relay connection"),
          relayServerCertificateChain: z.string().describe("Server certificate chain for the relay connection"),
          gatewayClientCertificate: z.string().describe("Client certificate for the gateway connection"),
          gatewayClientPrivateKey: z.string().describe("Client private key for the gateway connection"),
          gatewayServerCertificateChain: z.string().describe("Server certificate chain for the gateway connection")
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new BadRequestError({ message: "Account access requires JWT authentication" });
      }

      const result = await server.services.pamSession.access({
        path: req.body.path,
        projectId: req.internalPamProjectId,
        actor: {
          actorId: req.permission.id,
          actor: req.permission.type,
          actorOrgId: req.permission.orgId,
          actorAuthMethod: req.permission.authMethod
        },
        actorEmail: req.auth.user.email ?? "",
        actorName: `${req.auth.user.firstName ?? ""} ${req.auth.user.lastName ?? ""}`.trim(),
        actorIp: req.realIp ?? "",
        actorUserAgent: req.headers["user-agent"] ?? "",
        reason: req.body.reason,
        duration: req.body.duration,
        mfaSessionId: req.body.mfaSessionId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_ACCOUNT_ACCESS,
          metadata: {
            accountId: result.accountId,
            resourceName: result.accountName,
            accountName: result.accountName,
            reason: req.body.reason
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamAccountAccessed,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            accountType: result.accountType,
            orgId: req.permission.orgId,
            duration: result.sessionDurationMs
          }
        })
        .catch(() => {});

      return {
        sessionId: result.sessionId,
        accountType: result.accountType,
        metadata: result.metadata,
        relayHost: result.relayHost,
        relayClientCertificate: result.relayClientCertificate,
        relayClientPrivateKey: result.relayClientPrivateKey,
        relayServerCertificateChain: result.relayServerCertificateChain,
        gatewayClientCertificate: result.gatewayClientCertificate,
        gatewayClientPrivateKey: result.gatewayClientPrivateKey,
        gatewayServerCertificateChain: result.gatewayServerCertificateChain
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:accountId/web-access-ticket",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "pamSessionWebAccessTicket",
      description: "Create a web access ticket for a PAM account",
      tags: [ApiDocsTags.PamSessions],
      params: z.object({
        accountId: z.string().uuid().describe("The ID of the account")
      }),
      body: z.object({
        reason: z.string().trim().max(1000).optional().describe("Optional reason for the session"),
        mfaSessionId: z.string().max(64).optional().describe("MFA session ID from a completed MFA verification")
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
        reason: req.body.reason,
        mfaSessionId: req.body.mfaSessionId
      });

      return { ticket };
    }
  });

  server.route({
    method: "GET",
    url: "/:accountId/web-access",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "pamSessionWebAccess",
      description: "WebSocket endpoint for web-based access to a PAM account",
      tags: [ApiDocsTags.PamSessions],
      params: z.object({
        accountId: z.string().uuid().describe("The ID of the account")
      }),
      querystring: z.object({
        ticket: z.string().describe("WebSocket authentication ticket")
      }),
      response: {
        200: z.object({ message: z.string() })
      }
    },
    wsHandler: async (connection: WebSocket, req) => {
      const PRE_AUTH_MAX_MESSAGES = 10;
      const PRE_AUTH_MAX_BYTES = 64 * 1024;
      let preAuthBytes = 0;

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

        preAuthBytes += buf.byteLength;
        if (preAuthMessages.length >= PRE_AUTH_MAX_MESSAGES || preAuthBytes > PRE_AUTH_MAX_BYTES) {
          connection.off("message", preAuthHandler);
          connection.close(4008, "Pre-auth buffer exceeded");
          return;
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
            accountId: z.string().uuid(),
            projectId: z.string().uuid(),
            orgId: z.string().uuid(),
            accountName: z.string(),
            accountType: z.string(),
            actorEmail: z.string(),
            actorName: z.string(),
            reason: z.string().nullable().optional(),
            maxSessionDurationMs: z.number().optional(),
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
          maxSessionDurationMs: payload.maxSessionDurationMs,
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
