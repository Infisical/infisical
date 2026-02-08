import { z } from "zod";

import { PamSessionsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { KubernetesSessionCredentialsSchema } from "@app/ee/services/pam-resource/kubernetes/kubernetes-resource-schemas";
import { MySQLSessionCredentialsSchema } from "@app/ee/services/pam-resource/mysql/mysql-resource-schemas";
import { PostgresSessionCredentialsSchema } from "@app/ee/services/pam-resource/postgres/postgres-resource-schemas";
import { RedisSessionCredentialsSchema } from "@app/ee/services/pam-resource/redis/redis-resource-schemas";
import { SSHSessionCredentialsSchema } from "@app/ee/services/pam-resource/ssh/ssh-resource-schemas";
import {
  HttpEventSchema,
  PamSessionCommandLogSchema,
  SanitizedSessionSchema,
  TerminalEventSchema
} from "@app/ee/services/pam-session/pam-session-schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SessionCredentialsSchema = z.union([
  SSHSessionCredentialsSchema,
  PostgresSessionCredentialsSchema,
  MySQLSessionCredentialsSchema,
  KubernetesSessionCredentialsSchema,
  RedisSessionCredentialsSchema
]);

export const registerPamSessionRouter = async (server: FastifyZodProvider) => {
  // Meant to be hit solely by gateway identities
  server.route({
    method: "GET",
    url: "/:sessionId/credentials",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get PAM session credentials and start session",
      params: z.object({
        sessionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          credentials: SessionCredentialsSchema,
          sharedSecret: z.string().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { credentials, sharedSecret, projectId, account, sessionStarted } =
        await server.services.pamAccount.getSessionCredentials(req.params.sessionId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.PAM_SESSION_CREDENTIALS_GET,
          metadata: {
            sessionId: req.params.sessionId,
            accountName: account.name
          }
        }
      });

      if (sessionStarted) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId,
          event: {
            type: EventType.PAM_SESSION_START,
            metadata: {
              sessionId: req.params.sessionId,
              accountName: account.name
            }
          }
        });
      }

      return { credentials: credentials as z.infer<typeof SessionCredentialsSchema>, sharedSecret };
    }
  });

  // Meant to be hit solely by gateway identities
  server.route({
    method: "POST",
    url: "/:sessionId/logs",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Update PAM session logs",
      params: z.object({
        sessionId: z.string().uuid()
      }),
      body: z.object({
        logs: z.array(z.union([PamSessionCommandLogSchema, TerminalEventSchema, HttpEventSchema]))
      }),
      response: {
        200: z.object({
          session: PamSessionsSchema.omit({
            encryptedLogsBlob: true
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { session, projectId } = await server.services.pamSession.updateLogsById(
        {
          sessionId: req.params.sessionId,
          logs: req.body.logs
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.PAM_SESSION_LOGS_UPDATE,
          metadata: {
            sessionId: req.params.sessionId,
            accountName: session.accountName
          }
        }
      });

      return { session };
    }
  });

  // Meant to be hit solely by gateway identities
  server.route({
    method: "POST",
    url: "/:sessionId/end",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "End PAM session",
      params: z.object({
        sessionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          session: PamSessionsSchema.omit({
            encryptedLogsBlob: true
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { session, projectId } = await server.services.pamSession.endSessionById(
        req.params.sessionId,
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.PAM_SESSION_END,
          metadata: {
            sessionId: req.params.sessionId,
            accountName: session.accountName
          }
        }
      });

      return { session };
    }
  });

  server.route({
    method: "GET",
    url: "/:sessionId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get PAM session",
      params: z.object({
        sessionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          session: SanitizedSessionSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const response = await server.services.pamSession.getById(req.params.sessionId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: response.session.projectId,
        event: {
          type: EventType.PAM_SESSION_GET,
          metadata: {
            sessionId: req.params.sessionId
          }
        }
      });

      return response;
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List PAM sessions",
      querystring: z.object({
        projectId: z.string().uuid()
      }),
      response: {
        200: z.object({
          sessions: SanitizedSessionSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const response = await server.services.pamSession.list(req.query.projectId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.query.projectId,
        event: {
          type: EventType.PAM_SESSION_LIST,
          metadata: {
            count: response.sessions.length
          }
        }
      });

      return response;
    }
  });
};
