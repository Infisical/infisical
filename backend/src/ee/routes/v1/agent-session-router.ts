import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ForbiddenRequestError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

// The token is a bearer credential for the whole session, so it never travels in a URL: not in a path,
// not in a query string. Both the proxy's resolve call and the agent's revoke call put it in the body.
const sessionTokenSchema = z.string().trim().min(1).max(256);

export const registerAgentSessionRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      description:
        "Start a session for a user, on behalf of the calling agent. The agent is trusted to have verified the email.",
      operationId: "createAgentSession",
      body: z.object({
        projectId: z.string().trim().min(1).max(64).describe("Project whose policies apply to this session."),
        userEmail: z
          .string()
          .trim()
          .email()
          .max(255)
          .describe("Email of the human the agent is acting for. The agent is trusted to have verified it.")
      }),
      response: {
        200: z.object({
          token: z.string(),
          user: z.object({ id: z.string(), email: z.string().nullable(), username: z.string() }),
          placeholders: z.object({ key: z.string(), value: z.string() }).array(),
          proxyCaCertificate: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const session = await server.services.agentSession.mintSession(req.body, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.body.projectId,
        event: {
          type: EventType.AGENT_SESSION_CREATE,
          metadata: {
            identityId: req.permission.id,
            userId: session.user.id,
            projectId: req.body.projectId
          }
        }
      });

      return session;
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      description: "List the agent sessions in a project, most recently active first, up to the 200 most recent.",
      operationId: "listAgentSessions",
      querystring: z.object({
        projectId: z.string().trim().min(1).max(64).describe("Project whose sessions to list.")
      }),
      response: {
        200: z.object({
          agentSessions: z
            .object({
              id: z.string(),
              identityId: z.string(),
              agentName: z.string(),
              isAgentEnabled: z.boolean(),
              userId: z.string(),
              userEmail: z.string().nullable(),
              username: z.string(),
              firstName: z.string().nullable(),
              lastName: z.string().nullable(),
              createdAt: z.date(),
              lastUsedAt: z.date().nullable(),
              revokedAt: z.date().nullable()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const agentSessions = await server.services.agentSession.listSessions(
        { projectId: req.query.projectId },
        req.permission
      );
      return { agentSessions };
    }
  });

  server.route({
    method: "POST",
    url: "/:sessionId/revoke",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Revoke an agent session. The proxy drops it on its next policy refresh.",
      operationId: "revokeAgentSessionById",
      params: z.object({ sessionId: z.string().uuid() }),
      response: {
        200: z.object({
          agentSession: z.object({
            id: z.string(),
            identityId: z.string(),
            userId: z.string(),
            projectId: z.string(),
            revokedAt: z.date().nullable()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const agentSession = await server.services.agentSession.revokeSessionById(
        { sessionId: req.params.sessionId },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: agentSession.projectId,
        event: {
          type: EventType.AGENT_SESSION_REVOKE,
          metadata: {
            sessionId: agentSession.id,
            identityId: agentSession.identityId,
            userId: agentSession.userId,
            projectId: agentSession.projectId
          }
        }
      });

      return { agentSession };
    }
  });

  server.route({
    method: "POST",
    url: "/revoke",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Revoke a session the calling agent started.",
      operationId: "revokeAgentSession",
      body: z.object({ token: sessionTokenSchema }),
      response: {
        200: z.object({ message: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      await server.services.agentSession.revokeSession({ token: req.body.token }, req.permission);
      return { message: "Session revoked" };
    }
  });

  server.route({
    method: "POST",
    url: "/resolve",
    config: { rateLimit: readLimit },
    schema: {
      description: "Resolve the policies and credentials for a session. Only an enrolled agent proxy may call this.",
      operationId: "resolveAgentSession",
      body: z.object({ token: sessionTokenSchema }),
      response: {
        200: z.object({
          session: z.object({
            id: z.string(),
            identityId: z.string(),
            agentName: z.string(),
            userId: z.string(),
            projectId: z.string()
          }),
          allowedHosts: z.string().array(),
          agentPolicies: z
            .object({
              id: z.string(),
              name: z.string(),
              target: z.string(),
              rules: z.object({ hostPattern: z.string(), methods: z.string().array() }).array(),
              credentials: z
                .object({
                  role: z.string(),
                  headerName: z.string().nullable(),
                  headerPrefix: z.string().nullable(),
                  headerPurpose: z.string().nullable(),
                  placeholderValue: z.string().nullable(),
                  substitutionSurfaces: z.string().array(),
                  value: z.string()
                })
                .array()
            })
            .array(),
          userPolicies: z
            .object({
              id: z.string(),
              name: z.string(),
              target: z.string(),
              rules: z.object({ hostPattern: z.string(), methods: z.string().array() }).array()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.AGENT_PROXY_ACCESS_TOKEN]),
    handler: async (req) => {
      if (req.permission.type !== ActorType.AGENT_PROXY) {
        throw new ForbiddenRequestError({ message: "Only an agent proxy can resolve a session" });
      }

      return server.services.agentSession.resolveSession({
        token: req.body.token,
        agentProxyId: req.permission.id
      });
    }
  });

  server.route({
    method: "POST",
    url: "/activity",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Record what an agent proxy allowed or blocked for a session.",
      operationId: "recordAgentSessionActivity",
      body: z.object({
        token: sessionTokenSchema,
        events: z
          .object({
            decision: z.enum(["brokered", "passthrough", "blocked", "error"]),
            method: z.string().trim().max(16),
            host: z.string().trim().max(253),
            port: z.number().int().min(1).max(65535),
            path: z.string().trim().max(2048),
            statusCode: z.number().int().min(100).max(599).optional(),
            policyName: z.string().trim().max(64).optional(),
            userPolicyName: z.string().trim().max(64).optional(),
            reason: z.string().trim().max(256).optional()
          })
          .array()
          .min(1)
          .max(100)
      }),
      response: {
        200: z.object({ recorded: z.number() })
      }
    },
    onRequest: verifyAuth([AuthMode.AGENT_PROXY_ACCESS_TOKEN]),
    handler: async (req) => {
      if (req.permission.type !== ActorType.AGENT_PROXY) {
        throw new ForbiddenRequestError({ message: "Only an agent proxy can record session activity" });
      }

      const resolved = await server.services.agentSession.resolveSession({
        token: req.body.token,
        agentProxyId: req.permission.id
      });

      // One audit entry per request the proxy handled, attributed to both the agent and the user, which
      // is the whole point of the intersection model: it says who acted and on whose behalf.
      await Promise.all(
        req.body.events.map((event) =>
          server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            orgId: req.permission.orgId,
            projectId: resolved.session.projectId,
            event: {
              type: EventType.AGENT_PROXY_REQUEST,
              metadata: {
                agentProxyId: req.permission.id,
                // Stamped here rather than sent by the proxy: the session is already resolved from the
                // token, and it is what lets the UI show one session's requests on their own.
                sessionId: resolved.session.id,
                identityId: resolved.session.identityId,
                agentName: resolved.session.agentName,
                userId: resolved.session.userId,
                decision: event.decision,
                method: event.method,
                host: event.host,
                port: event.port,
                path: event.path,
                statusCode: event.statusCode,
                policyName: event.policyName,
                userPolicyName: event.userPolicyName,
                reason: event.reason
              }
            }
          })
        )
      );

      return { recorded: req.body.events.length };
    }
  });
};
