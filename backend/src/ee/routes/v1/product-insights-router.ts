import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  SecretsProjectWarningsSchema,
  SecretsUsageInsightsSchema
} from "@app/ee/services/product-insights/product-insights-schemas";
import { PRODUCT_INSIGHTS } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProductInsightsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/secrets/usage-insights",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      operationId: "getSecretsUsageInsights",
      description: "Get secrets management usage counts for the requesting organization.",
      response: {
        200: z.object({
          usageInsights: SecretsUsageInsightsSchema
        })
      }
    },
    handler: async (req) => {
      const usageInsights = await server.services.productInsights.getSecretsUsageInsights({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_USAGE,
          metadata: usageInsights
        }
      });

      return { usageInsights };
    }
  });

  server.route({
    method: "GET",
    url: "/secrets/project-warnings",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      operationId: "getSecretsProjectWarnings",
      description:
        "List the organization's secret management projects with outstanding issue counts, ordered by severity.",
      querystring: z.object({
        offset: z.coerce
          .number()
          .int()
          .min(0)
          .max(10000)
          .default(0)
          .describe(PRODUCT_INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.offset),
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe(PRODUCT_INSIGHTS.GET_SECRETS_PROJECT_WARNINGS.limit)
      }),
      response: {
        200: z.object({
          projectWarnings: SecretsProjectWarningsSchema
        })
      }
    },
    handler: async (req) => {
      const projectWarnings = await server.services.productInsights.getSecretsProjectWarnings({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId,
        offset: req.query.offset,
        limit: req.query.limit
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_PROJECT_WARNINGS,
          metadata: {
            totalProjects: projectWarnings.totalProjects,
            projectsWithIssues: projectWarnings.projectsWithIssues,
            offset: req.query.offset,
            limit: req.query.limit
          }
        }
      });

      return { projectWarnings };
    }
  });
};
