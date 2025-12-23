import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { BadRequestError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPamAccountSessionRouter = async (server: FastifyZodProvider) => {
  // 1. Create Session
  server.route({
    method: "POST",
    url: "/session",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create PAM browser session",
      body: z.object({
        accountPath: z.string().trim(),
        projectId: z.string().uuid(),
        duration: z
          .string()
          .min(1)
          .optional()
          .default("4h")
          .transform((val, ctx) => {
            const parsedMs = ms(val);

            if (parsedMs <= 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Invalid duration format. Must be a positive duration (e.g., '1h', '30m', '2d')."
              });
              return z.NEVER;
            }
            return val;
          })
      }),
      response: {
        200: z.object({
          sessionId: z.string(),
          expiresAt: z.date(),
          metadata: z.object({
            username: z.string(),
            database: z.string(),
            host: z.string(),
            port: z.number()
          }),
          account: z.object({
            id: z.string(),
            name: z.string()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new BadRequestError({ message: "You can only create PAM sessions using JWT auth tokens." });
      }

      const { accountPath, projectId, duration } = req.body;

      const session = await server.services.pamAccountSessionManager.createSession(
        {
          accountPath,
          projectId,
          duration
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.PAM_ACCOUNT_ACCESS,
          metadata: {
            accountId: session.account.id,
            accountPath,
            accountName: session.account.name,
            duration
          }
        }
      });

      return session;
    }
  });

  // 2. Health Check
  server.route({
    method: "GET",
    url: "/session/:sessionId/health",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Check PAM session health",
      params: z.object({
        sessionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          isAlive: z.boolean(),
          expiresAt: z.date().optional(),
          error: z.string().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { sessionId } = req.params;

      const health = await server.services.pamAccountSessionManager.checkHealth(sessionId);

      return health;
    }
  });

  // 3. Execute Query
  server.route({
    method: "POST",
    url: "/session/:sessionId/query",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Execute query on PAM session",
      params: z.object({
        sessionId: z.string().uuid()
      }),
      body: z.object({
        query: z.string().min(1).max(100000) // Max 100KB query
      }),
      response: {
        200: z.object({
          // TODO: Replace z.any() with proper PostgreSQL field type union (z.union([z.string(), z.number(), z.boolean(), z.null(), z.instanceof(Buffer)]))
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          rows: z.array(z.array(z.any())),
          fields: z.array(z.string()).optional(),
          rowCount: z.number(),
          executionTimeMs: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { sessionId } = req.params;
      const { query } = req.body;

      const sessionInfo = server.services.pamAccountSessionManager.getSessionInfo(sessionId);
      if (!sessionInfo) {
        throw new BadRequestError({ message: "Session not found" });
      }

      const result = await server.services.pamAccountSessionManager.executeQuery(sessionId, query);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.PAM_SESSION_LOGS_UPDATE,
          metadata: {
            sessionId,
            accountName: sessionInfo.accountName
          }
        }
      });

      return result;
    }
  });

  // 4. Terminate Session
  server.route({
    method: "POST",
    url: "/session/:sessionId/terminate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Terminate PAM session",
      params: z.object({
        sessionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          success: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { sessionId } = req.params;

      const sessionInfo = server.services.pamAccountSessionManager.getSessionInfo(sessionId);
      if (!sessionInfo) {
        throw new BadRequestError({ message: "Session not found" });
      }

      await server.services.pamAccountSessionManager.terminateSession(sessionId);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.PAM_SESSION_END,
          metadata: {
            sessionId,
            accountName: sessionInfo.accountName
          }
        }
      });

      return { success: true };
    }
  });
};
