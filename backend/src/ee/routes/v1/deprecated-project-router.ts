import { z } from "zod";

import { AuditLogsSchema } from "@app/db/schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { AUDIT_LOGS } from "@app/lib/api-docs";
import { getLastMidnightDateISO } from "@app/lib/fn";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

export const registerDeprecatedProjectRouter = async (server: FastifyZodProvider) => {
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
          actor: z.string().optional().describe(AUDIT_LOGS.EXPORT.actor),
          actorType: z.nativeEnum(ActorType).optional().describe(AUDIT_LOGS.EXPORT.actorType)
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
          actorType: req.query.actorType,
          eventType: req.query.eventType ? [req.query.eventType] : undefined
        }
      });
      return { auditLogs };
    }
  });
};
