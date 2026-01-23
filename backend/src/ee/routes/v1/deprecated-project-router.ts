import { z } from "zod";

import { AuditLogsSchema } from "@app/db/schemas/audit-logs";
import { SecretSnapshotsSchema } from "@app/db/schemas/secret-snapshots";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, AUDIT_LOGS, PROJECTS } from "@app/lib/api-docs";
import { getLastMidnightDateISO, removeTrailingSlash } from "@app/lib/fn";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerDeprecatedProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:workspaceId/secret-snapshots",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Projects],
      description: "Return project secret snapshots ids",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(PROJECTS.GET_SNAPSHOTS.projectId)
      }),
      querystring: z.object({
        environment: z.string().trim().describe(PROJECTS.GET_SNAPSHOTS.environment),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(PROJECTS.GET_SNAPSHOTS.path),
        offset: z.coerce.number().default(0).describe(PROJECTS.GET_SNAPSHOTS.offset),
        limit: z.coerce.number().default(20).describe(PROJECTS.GET_SNAPSHOTS.limit)
      }),
      response: {
        200: z.object({
          secretSnapshots: SecretSnapshotsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secretSnapshots = await server.services.snapshot.listSnapshots({
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        ...req.query
      });
      return { secretSnapshots };
    }
  });

  server.route({
    method: "GET",
    url: "/:workspaceId/secret-snapshots/count",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      querystring: z.object({
        environment: z.string().trim(),
        path: z.string().trim().default("/").transform(removeTrailingSlash)
      }),
      response: {
        200: z.object({
          count: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const count = await server.services.snapshot.projectSecretSnapshotCount({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        environment: req.query.environment,
        path: req.query.path
      });
      return { count };
    }
  });

  /*
   * Daniel: This endpoint is no longer is use.
   * We are keeping it for now because it has been exposed in our public api docs for a while, so by removing it we are likely to break users workflows.
   *
   * Please refer to the new endpoint, GET /api/v1/organization/audit-logs, for the same (and more) functionality.
   */
  server.route({
    method: "GET",
    url: "/:workspaceId/audit-logs",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Return audit logs",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim().describe(AUDIT_LOGS.EXPORT.projectId)
      }),
      querystring: z
        .object({
          eventType: z.nativeEnum(EventType).optional().describe(AUDIT_LOGS.EXPORT.eventType),
          userAgentType: z.nativeEnum(UserAgentType).optional().describe(AUDIT_LOGS.EXPORT.userAgentType),
          startDate: z.string().datetime().optional().describe(AUDIT_LOGS.EXPORT.startDate),
          endDate: z.string().datetime().optional().describe(AUDIT_LOGS.EXPORT.endDate),
          offset: z.coerce.number().default(0).describe(AUDIT_LOGS.EXPORT.offset),
          limit: z.coerce.number().max(1000).default(20).describe(AUDIT_LOGS.EXPORT.limit),
          actor: z.string().optional().describe(AUDIT_LOGS.EXPORT.actor)
        })
        .superRefine((el, ctx) => {
          if (el.endDate && el.startDate) {
            const startDate = new Date(el.startDate);
            const endDate = new Date(el.endDate);
            const maxAllowedDate = new Date(startDate);
            maxAllowedDate.setMonth(maxAllowedDate.getMonth() + 3);
            if (endDate < startDate) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["endDate"],
                message: "End date cannot be before start date"
              });
            }
            if (endDate > maxAllowedDate) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["endDate"],
                message: "Dates must be within 3 months"
              });
            }
          }
        }),
      response: {
        200: z.object({
          auditLogs: AuditLogsSchema.omit({
            eventMetadata: true,
            eventType: true,
            actor: true,
            actorMetadata: true
          })
            .merge(
              z.object({
                project: z
                  .object({
                    name: z.string(),
                    slug: z.string()
                  })
                  .optional(),
                event: z.object({
                  type: z.string(),
                  metadata: z.any()
                }),
                actor: z.object({
                  type: z.string(),
                  metadata: z.any()
                })
              })
            )
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const auditLogs = await server.services.auditLog.listAuditLogs({
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,

        filter: {
          ...req.query,
          projectId: req.params.workspaceId,
          endDate: req.query.endDate || new Date().toISOString(),
          startDate: req.query.startDate || getLastMidnightDateISO(),
          auditLogActorId: req.query.actor,
          eventType: req.query.eventType ? [req.query.eventType] : undefined
        }
      });
      return { auditLogs };
    }
  });
};
