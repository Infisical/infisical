import type WebSocket from "ws";
import { z } from "zod";

import { AuditLogInfo, EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { PamAccountOrderBy, PamAccountView } from "@app/ee/services/pam-account/pam-account-enums";
import { SanitizedAwsIamAccountWithResourceSchema } from "@app/ee/services/pam-resource/aws-iam/aws-iam-resource-schemas";
import { SanitizedKubernetesAccountWithResourceSchema } from "@app/ee/services/pam-resource/kubernetes/kubernetes-resource-schemas";
import { SanitizedMySQLAccountWithResourceSchema } from "@app/ee/services/pam-resource/mysql/mysql-resource-schemas";
import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";
import { GatewayAccessResponseSchema } from "@app/ee/services/pam-resource/pam-resource-schemas";
import { SanitizedPostgresAccountWithResourceSchema } from "@app/ee/services/pam-resource/postgres/postgres-resource-schemas";
import { SanitizedRedisAccountWithResourceSchema } from "@app/ee/services/pam-resource/redis/redis-resource-schemas";
import { SanitizedSSHAccountWithResourceSchema } from "@app/ee/services/pam-resource/ssh/ssh-resource-schemas";
import { SanitizedWindowsAccountWithResourceSchema } from "@app/ee/services/pam-resource/windows-server/windows-server-resource-schemas";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { OrderByDirection } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { TokenType } from "@app/services/auth-token/auth-token-types";

const SanitizedAccountSchema = z.discriminatedUnion("resourceType", [
  SanitizedKubernetesAccountWithResourceSchema,
  SanitizedSSHAccountWithResourceSchema,
  SanitizedPostgresAccountWithResourceSchema,
  SanitizedMySQLAccountWithResourceSchema,
  SanitizedRedisAccountWithResourceSchema,
  SanitizedAwsIamAccountWithResourceSchema,
  SanitizedWindowsAccountWithResourceSchema
]);

const ListPamAccountsResponseSchema = z.object({
  accounts: SanitizedAccountSchema.array(),
  totalCount: z.number().default(0)
});

export const registerPamAccountRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:accountId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get PAM account by ID",
      params: z.object({
        accountId: z.string().uuid()
      }),
      response: {
        200: SanitizedAccountSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { accountId } = req.params;

      const account = await server.services.pamAccount.getById({
        accountId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: account.projectId,
        event: {
          type: EventType.PAM_ACCOUNT_GET,
          metadata: {
            accountId: account.id,
            accountName: account.name
          }
        }
      });

      return account as z.infer<typeof SanitizedAccountSchema>;
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List PAM accounts",
      querystring: z.object({
        projectId: z.string().uuid(),
        accountView: z.nativeEnum(PamAccountView).default(PamAccountView.Flat),
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(100),
        orderBy: z.nativeEnum(PamAccountOrderBy).default(PamAccountOrderBy.Name),
        orderDirection: z.nativeEnum(OrderByDirection).default(OrderByDirection.ASC),
        search: z.string().trim().optional(),
        filterResourceIds: z
          .string()
          .transform((val) =>
            val
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          )
          .optional()
      }),
      response: {
        200: ListPamAccountsResponseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId, accountView, limit, offset, search, orderBy, orderDirection, filterResourceIds } = req.query;

      const { accounts, totalCount } = await server.services.pamAccount.list({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId,
        accountView,
        limit,
        offset,
        search,
        orderBy,
        orderDirection,
        filterResourceIds
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId,
        event: {
          type: EventType.PAM_ACCOUNT_LIST,
          metadata: {
            accountCount: accounts.length
          }
        }
      });

      return { accounts, totalCount } as z.infer<typeof ListPamAccountsResponseSchema>;
    }
  });

  server.route({
    method: "POST",
    url: "/access",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Access PAM account",
      body: z.object({
        resourceName: z.string().trim(),
        accountName: z.string().trim(),
        projectId: z.string().uuid(),
        mfaSessionId: z.string().optional(),
        duration: z
          .string()
          .min(1)
          .transform((val, ctx) => {
            const parsedMs = ms(val);

            if (typeof parsedMs !== "number" || parsedMs <= 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Invalid duration format. Must be a positive duration (e.g., '1h', '30m', '2d')."
              });
              return z.NEVER;
            }
            return parsedMs;
          })
      }),
      response: {
        200: z.discriminatedUnion("resourceType", [
          // Gateway-based resources (Postgres, MySQL, Redis, SSH)
          GatewayAccessResponseSchema.extend({ resourceType: z.literal(PamResource.Postgres) }),
          GatewayAccessResponseSchema.extend({ resourceType: z.literal(PamResource.MySQL) }),
          GatewayAccessResponseSchema.extend({ resourceType: z.literal(PamResource.Redis) }),
          GatewayAccessResponseSchema.extend({ resourceType: z.literal(PamResource.SSH) }),
          GatewayAccessResponseSchema.extend({ resourceType: z.literal(PamResource.Kubernetes) }),
          // AWS IAM (no gateway, returns console URL)
          z.object({
            sessionId: z.string(),
            resourceType: z.literal(PamResource.AwsIam),
            consoleUrl: z.string().url(),
            metadata: z.record(z.string(), z.string().optional()).optional()
          })
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      // To prevent type errors when accessing req.auth
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new BadRequestError({ message: "You can only access PAM accounts using JWT auth tokens." });
      }

      const response = await server.services.pamAccount.access(
        {
          actorEmail: req.auth.user.email ?? "",
          actorIp: req.realIp,
          actorName: `${req.auth.user.firstName ?? ""} ${req.auth.user.lastName ?? ""}`.trim(),
          actorUserAgent: req.auditLogInfo.userAgent ?? "",
          resourceName: req.body.resourceName,
          accountName: req.body.accountName,
          projectId: req.body.projectId,
          duration: req.body.duration,
          mfaSessionId: req.body.mfaSessionId
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.body.projectId,
        event: {
          type: EventType.PAM_ACCOUNT_ACCESS,
          metadata: {
            accountId: response.account.id,
            resourceName: req.body.resourceName,
            accountName: response.account.name,
            duration: req.body.duration ? new Date(req.body.duration).toISOString() : undefined
          }
        }
      });

      return response;
    }
  });

  // Web access ticket endpoint
  server.route({
    method: "POST",
    url: "/:accountId/web-access-ticket",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Issue a one-time ticket for WebSocket web access",
      params: z.object({
        accountId: z.string().uuid()
      }),
      body: z.object({
        projectId: z.string().uuid()
      }),
      response: {
        200: z.object({ ticket: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      // Narrows TypeScript type so req.auth.user is available below (verifyAuth hook already enforces JWT)
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new BadRequestError({ message: "Web access requires JWT authentication" });
      }

      const { ticket } = await server.services.pamWebAccess.issueWebSocketTicket({
        accountId: req.params.accountId,
        projectId: req.body.projectId,
        orgId: req.permission.orgId,
        actor: req.permission,
        actorEmail: req.auth.user.email ?? "",
        actorName: `${req.auth.user.firstName ?? ""} ${req.auth.user.lastName ?? ""}`.trim(),
        auditLogInfo: req.auditLogInfo
      });

      return { ticket };
    }
  });

  // WebSocket endpoint for web access (ticket-based auth)
  server.route({
    method: "GET",
    url: "/:accountId/web-access",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "WebSocket endpoint for browser-based web access to PAM accounts",
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
      try {
        const ticketValue = req.query.ticket;
        const separatorIndex = ticketValue.indexOf(":");
        if (separatorIndex === -1) {
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
          connection.close(4001, "Invalid or expired ticket");
          return;
        }

        const payload = z
          .object({
            accountId: z.string(),
            projectId: z.string(),
            orgId: z.string(),
            resourceName: z.string(),
            accountName: z.string(),
            actorEmail: z.string(),
            actorName: z.string(),
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
          connection.close(4001, "Invalid or expired ticket");
          return;
        }

        await server.services.pamWebAccess.handleWebSocketConnection({
          socket: connection,
          accountId: payload.accountId,
          projectId: payload.projectId,
          orgId: payload.orgId,
          resourceName: payload.resourceName,
          accountName: payload.accountName,
          actorEmail: payload.actorEmail,
          actorName: payload.actorName,
          auditLogInfo: payload.auditLogInfo as AuditLogInfo,
          userId,
          actorIp: req.realIp ?? "",
          actorUserAgent: req.headers["user-agent"] ?? ""
        });
      } catch (err) {
        logger.error(err, "WebSocket ticket validation failed");
        connection.close(4001, "Invalid or expired ticket");
      }
    },
    handler: async () => {
      return { message: "WebSocket upgrade required" };
    }
  });
};
