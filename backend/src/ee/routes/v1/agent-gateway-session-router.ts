import { z } from "zod";

import { AgentGatewaySessionMode } from "@app/ee/services/agent-gateway/agent-gateway-enums";
import {
  BUNDLE_REFRESH_AFTER_SECONDS,
  DEFAULT_SESSION_TTL_SECONDS
} from "@app/ee/services/agent-gateway/agent-gateway-session-service";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_GATEWAYS, ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

const BrokerCredentialSchema = z.object({
  id: z.string().uuid(),
  role: z.string(),
  headerName: z.string().nullish(),
  headerPrefix: z.string().nullish(),
  headerPurpose: z.string().nullish(),
  placeholderKey: z.string().nullish(),
  placeholderValue: z.string().nullish(),
  substitutionSurfaces: z.string().array().nullish(),
  kind: z.enum(["static", "dynamic"]),
  // Names, for the broker's activity log. Never a value.
  secretKey: z.string().nullish(),
  dynamicSecretName: z.string().nullish(),
  dynamicSecretField: z.string().nullish(),
  // The resolved credential. Present only when the credential resolved; never logged.
  value: z.string().optional(),
  leaseId: z.string().uuid().optional(),
  leaseExpiresAt: z.date().optional(),
  unavailable: z.boolean().optional(),
  unavailableReason: z.string().optional()
});

const BrokerServiceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  hostPattern: z.string(),
  isEnabled: z.boolean(),
  priority: z.number(),
  credentials: BrokerCredentialSchema.array()
});

export const registerAgentGatewaySessionRouter = async (server: FastifyZodProvider) => {
  // RPC-shaped on purpose, and a POST rather than a GET because opening a session mints credentials and
  // dynamic-secret leases. This matches POST /pam/sessions/access; the deviation from resource-shaped REST
  // is intentional, not an oversight.
  server.route({
    method: "POST",
    url: "/:agentGatewayId/sessions",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AgentGateways],
      description: "Open a session against an Agent Gateway",
      operationId: "openAgentGatewaySession",
      params: z.object({
        agentGatewayId: z.string().uuid().describe(AGENT_GATEWAYS.SESSIONS.agentGatewayId)
      }),
      body: z.object({
        mode: z.nativeEnum(AgentGatewaySessionMode).describe(AGENT_GATEWAYS.SESSIONS.mode),
        ttlSeconds: z.coerce
          .number()
          .int()
          .min(60)
          .max(43200)
          .default(DEFAULT_SESSION_TTL_SECONDS)
          .describe(AGENT_GATEWAYS.SESSIONS.ttlSeconds)
      }),
      response: {
        200: z.object({
          session: z.object({
            id: z.string().uuid(),
            agentGatewayId: z.string().uuid(),
            agentGatewayName: z.string(),
            mode: z.nativeEnum(AgentGatewaySessionMode),
            projectId: z.string(),
            projectSlug: z.string(),
            expiresAt: z.date(),
            renewAfterSeconds: z.number(),
            refreshAfterSeconds: z.number(),
            // Local mode runs the broker in the caller's own CLI, so it is told the policy directly rather
            // than reading it off a certificate.
            unmatchedHostPolicy: z.string(),
            allowedHosts: z.string().array()
          })
        })
      }
    },
    handler: async (req) => {
      const { session, agentGateway, projectSlug, renewAfterSeconds } =
        await server.services.agentGatewaySession.openSession(
          { agentGatewayId: req.params.agentGatewayId, mode: req.body.mode, ttlSeconds: req.body.ttlSeconds },
          req.permission
        );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: agentGateway.projectId,
        event: {
          type: EventType.AGENT_GATEWAY_SESSION_START,
          metadata: {
            sessionId: session.id,
            agentGatewayId: agentGateway.id,
            agentGatewayName: agentGateway.name,
            mode: session.mode,
            gatewayId: session.gatewayId ?? undefined
          }
        }
      });

      return {
        session: {
          id: session.id,
          agentGatewayId: agentGateway.id,
          agentGatewayName: agentGateway.name,
          mode: session.mode as AgentGatewaySessionMode,
          projectId: agentGateway.projectId,
          projectSlug,
          expiresAt: session.expiresAt,
          renewAfterSeconds,
          refreshAfterSeconds: BUNDLE_REFRESH_AFTER_SECONDS,
          unmatchedHostPolicy: agentGateway.unmatchedHostPolicy,
          allowedHosts: agentGateway.allowedHosts ?? []
        }
      };
    }
  });

  // Accepts three auth modes and branches in the service: a GATEWAY_ACCESS_TOKEN must match the session's
  // pinned gateway, while a user or identity token may only read a local-mode session it owns. The
  // deviation from one-auth-mode-per-route is intentional; it is one resource with two legitimate readers.
  // Side-effect-free apart from an idempotent lastResolvedAt stamp.
  server.route({
    method: "GET",
    url: "/sessions/:sessionId/broker-bundle",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.GATEWAY_ACCESS_TOKEN, AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: true,
      params: z.object({
        sessionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          sessionId: z.string().uuid(),
          agentGatewayId: z.string().uuid(),
          services: BrokerServiceSchema.array(),
          refreshAfterSeconds: z.number(),
          expiresAt: z.date()
        })
      }
    },
    handler: async (req) => {
      const { bundle, session, secretRefs } = await server.services.agentGatewaySession.resolveBundle({
        sessionId: req.params.sessionId,
        caller: {
          type: req.permission.type,
          id: req.permission.id,
          orgId: req.permission.orgId,
          rootOrgId: req.permission.rootOrgId,
          parentOrgId: req.permission.parentOrgId
        }
      });

      // Replaces the per-secret read audit row that existed when the broker fetched values itself. Both
      // halves of the delegation are recorded, because "on whose authority" and "for whom" are different
      // questions and an investigation needs both.
      if (session.resolvedRefFingerprint !== bundle.refFingerprint) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: session.projectId,
          event: {
            type: EventType.AGENT_GATEWAY_BROKER_RESOLVE,
            metadata: {
              sessionId: session.id,
              agentGatewayId: session.agentGatewayId,
              gatewayId: session.gatewayId ?? undefined,
              mode: session.mode,
              secretRefs,
              requestingActorType: session.actorUserId ? ActorType.USER : ActorType.IDENTITY,
              requestingActorId: (session.actorUserId ?? session.actorIdentityId) as string,
              unavailableCount: bundle.services.reduce(
                (total, service) => total + service.credentials.filter((c) => c.unavailable).length,
                0
              )
            }
          }
        });
      }

      return {
        sessionId: session.id,
        agentGatewayId: session.agentGatewayId,
        services: bundle.services,
        refreshAfterSeconds: BUNDLE_REFRESH_AFTER_SECONDS,
        expiresAt: session.expiresAt
      };
    }
  });

  // The mTLS material and trust anchor the CLI needs to reach a remote session's broker. Deliberately does
  // not include any brokered value: those go to the gateway, which is the whole point of remote mode.
  server.route({
    method: "GET",
    url: "/sessions/:sessionId/transport",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: true,
      params: z.object({
        sessionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          relayHost: z.string(),
          gateway: z.object({
            clientCertificate: z.string(),
            clientPrivateKey: z.string(),
            serverCertificateChain: z.string()
          }),
          relay: z.object({
            clientCertificate: z.string(),
            clientPrivateKey: z.string(),
            serverCertificateChain: z.string()
          }),
          caCertificate: z.string(),
          placeholders: z.object({ key: z.string(), value: z.string() }).array(),
          hostPatterns: z.string().array(),
          expiresAt: z.date(),
          certificateExpiresAt: z.date()
        })
      }
    },
    handler: async (req) => {
      const transport = await server.services.agentGatewaySession.getTransport(req.params, req.permission);
      return {
        relayHost: transport.relayHost,
        gateway: transport.gateway,
        relay: transport.relay,
        caCertificate: transport.caCertificate,
        placeholders: transport.placeholders,
        hostPatterns: transport.hostPatterns,
        expiresAt: transport.expiresAt,
        certificateExpiresAt: transport.certificateExpiresAt
      };
    }
  });

  server.route({
    method: "POST",
    url: "/sessions/:sessionId/renew",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AgentGateways],
      description: "Extend an Agent Gateway session",
      operationId: "renewAgentGatewaySession",
      params: z.object({
        sessionId: z.string().uuid().describe(AGENT_GATEWAYS.SESSIONS.sessionId)
      }),
      response: {
        200: z.object({
          expiresAt: z.date(),
          renewAfterSeconds: z.number()
        })
      }
    },
    handler: async (req) => {
      const { session, renewAfterSeconds } = await server.services.agentGatewaySession.renewSession(
        req.params,
        req.permission
      );
      return { expiresAt: session.expiresAt, renewAfterSeconds };
    }
  });

  // Idempotent, and callable by the session's owner or its gateway. Returns 204 whether or not there was
  // an active session to end, because "it is not running" is the caller's desired outcome either way.
  server.route({
    method: "DELETE",
    url: "/sessions/:sessionId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.GATEWAY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AgentGateways],
      description: "End an Agent Gateway session",
      operationId: "endAgentGatewaySession",
      params: z.object({
        sessionId: z.string().uuid().describe(AGENT_GATEWAYS.SESSIONS.sessionId)
      }),
      response: {
        204: z.void()
      }
    },
    handler: async (req, res) => {
      const session = await server.services.agentGatewaySession.endSession(
        { sessionId: req.params.sessionId },
        { type: req.permission.type, id: req.permission.id }
      );

      if (session) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: session.projectId,
          event: {
            type: EventType.AGENT_GATEWAY_SESSION_END,
            metadata: {
              sessionId: session.id,
              agentGatewayId: session.agentGatewayId,
              mode: session.mode
            }
          }
        });
      }

      return res.status(204).send();
    }
  });

  // Reported by the broker, never by the agent: an agent runs in an untrusted environment, so letting it
  // report would let a compromised one forge usage. Same three readers as broker-bundle, for the same reason.
  server.route({
    method: "POST",
    url: "/sessions/:sessionId/report-usage",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.GATEWAY_ACCESS_TOKEN, AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: true,
      params: z.object({
        sessionId: z.string().uuid()
      }),
      body: z.object({
        serviceIds: z.string().uuid().array().min(1).max(100)
      }),
      response: {
        204: z.void()
      }
    },
    handler: async (req, res) => {
      await server.services.agentGatewaySession.reportUsage({
        sessionId: req.params.sessionId,
        serviceIds: req.body.serviceIds,
        caller: { type: req.permission.type, id: req.permission.id }
      });

      return res.status(204).send();
    }
  });

  // Recording. Reported by the broker, in batches, with the same three readers as broker-bundle and for the
  // same reason: the gateway holds the session in remote mode and the caller's own CLI holds it locally.
  server.route({
    method: "POST",
    url: "/sessions/:sessionId/requests",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.GATEWAY_ACCESS_TOKEN, AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: true,
      params: z.object({
        sessionId: z.string().uuid()
      }),
      body: z.object({
        // Bounded so one flush cannot become an unbounded insert; the broker flushes on a timer as well as
        // on a full buffer, so a busy agent sends more batches rather than bigger ones.
        requests: z
          .object({
            occurredAt: z.coerce.date(),
            method: z.string().trim().max(16),
            host: z.string().trim().max(255),
            port: z.coerce.number().int().min(0).max(65535).optional(),
            path: z.string().max(2048).optional(),
            decision: z.enum(["brokered", "passthrough", "allowlisted", "blocked", "canceled", "error"]),
            statusCode: z.coerce.number().int().min(0).max(599).optional(),
            serviceId: z.string().uuid().optional(),
            serviceName: z.string().trim().max(64).optional(),
            credentials: z
              .object({
                key: z.string().trim().max(255).optional(),
                dynamicSecretName: z.string().trim().max(255).optional(),
                dynamicSecretField: z.string().trim().max(255).optional(),
                role: z.string().trim().max(32).optional(),
                header: z.string().trim().max(255).optional(),
                surfaces: z.string().trim().max(16).array().max(8).optional()
              })
              .array()
              .max(16)
              .optional(),
            errorMessage: z.string().trim().max(500).optional()
          })
          .array()
          .min(1)
          .max(200)
      }),
      response: {
        204: z.void()
      }
    },
    handler: async (req, res) => {
      await server.services.agentGatewaySession.recordRequests({
        sessionId: req.params.sessionId,
        requests: req.body.requests,
        caller: { type: req.permission.type, id: req.permission.id }
      });

      return res.status(204).send();
    }
  });

  server.route({
    method: "GET",
    url: "/:agentGatewayId/sessions",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AgentGateways],
      description: "List the sessions opened against an Agent Gateway",
      operationId: "listAgentGatewaySessions",
      params: z.object({
        agentGatewayId: z.string().uuid().describe(AGENT_GATEWAYS.SESSIONS.agentGatewayId)
      }),
      querystring: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0)
      }),
      response: {
        200: z.object({
          totalCount: z.number(),
          sessions: z
            .object({
              id: z.string().uuid(),
              mode: z.string(),
              status: z.string(),
              actorName: z.string(),
              actorType: z.string(),
              gatewayId: z.string().uuid().nullable(),
              expiresAt: z.date(),
              endedAt: z.date().nullable(),
              createdAt: z.date(),
              requestCount: z.number(),
              brokeredCount: z.number()
            })
            .array()
        })
      }
    },
    handler: async (req) =>
      server.services.agentGatewaySession.listSessions(
        {
          agentGatewayId: req.params.agentGatewayId,
          limit: req.query.limit,
          offset: req.query.offset
        },
        req.permission
      )
  });

  // The replay. Gated on Read of the agent gateway rather than on owning the session, because the point of a
  // recording is that somebody other than the person who ran it can review it.
  server.route({
    method: "GET",
    url: "/sessions/:sessionId/requests",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AgentGateways],
      description: "List the requests recorded for an Agent Gateway session",
      operationId: "listAgentGatewaySessionRequests",
      params: z.object({
        sessionId: z.string().uuid().describe(AGENT_GATEWAYS.SESSIONS.sessionId)
      }),
      querystring: z.object({
        limit: z.coerce.number().int().min(1).max(500).default(200),
        offset: z.coerce.number().int().min(0).default(0)
      }),
      response: {
        200: z.object({
          totalCount: z.number(),
          session: z.object({
            id: z.string().uuid(),
            mode: z.string(),
            status: z.string(),
            actorName: z.string(),
            createdAt: z.date(),
            endedAt: z.date().nullable()
          }),
          requests: z
            .object({
              id: z.string().uuid(),
              occurredAt: z.date(),
              method: z.string(),
              host: z.string(),
              port: z.number().nullable(),
              path: z.string().nullable(),
              decision: z.string(),
              statusCode: z.number().nullable(),
              serviceName: z.string().nullable(),
              credentials: z
                .object({
                  key: z.string().optional(),
                  dynamicSecretName: z.string().optional(),
                  dynamicSecretField: z.string().optional(),
                  role: z.string().optional(),
                  header: z.string().optional(),
                  surfaces: z.string().array().optional()
                })
                .array(),
              errorMessage: z.string().nullable()
            })
            .array()
        })
      }
    },
    handler: async (req) =>
      server.services.agentGatewaySession.listSessionRequests(
        {
          sessionId: req.params.sessionId,
          limit: req.query.limit,
          offset: req.query.offset
        },
        req.permission
      )
  });

  // The sub-second kill switch. Separate from DELETE because it does not require being the session's owner:
  // the point is to stop somebody else's session.
  server.route({
    method: "POST",
    url: "/sessions/:sessionId/terminate",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AgentGateways],
      description: "Terminate an Agent Gateway session belonging to someone else",
      operationId: "terminateAgentGatewaySession",
      params: z.object({
        sessionId: z.string().uuid().describe(AGENT_GATEWAYS.SESSIONS.sessionId)
      }),
      response: {
        204: z.void()
      }
    },
    handler: async (req, res) => {
      const { session, agentGateway } = await server.services.agentGatewaySession.terminateSession(
        req.params,
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: agentGateway.projectId,
        event: {
          type: EventType.AGENT_GATEWAY_SESSION_TERMINATE,
          metadata: {
            sessionId: session.id,
            agentGatewayId: agentGateway.id,
            agentGatewayName: agentGateway.name,
            terminatedActorName: session.actorName
          }
        }
      });

      return res.status(204).send();
    }
  });
};
