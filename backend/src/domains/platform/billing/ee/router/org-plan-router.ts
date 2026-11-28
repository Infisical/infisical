import { FastifyRequest } from "fastify";
import { z } from "zod";

import { AuthMode } from "@app/lib/auth/actor-types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";

import { TBillingOverviewService } from "../services/billing-overview/service";

// Plan reads, for any member of the org. The rest of billing is in billing-router.
export type TOrgPlanRouterServices = { billingOverviewService: TBillingOverviewService };

export const registerOrgPlanRouter = async (server: FastifyZodProvider, services: TOrgPlanRouterServices) => {
  const readOrgPlan = (req: FastifyRequest, orgId: string, refreshCache: boolean) =>
    services.billingOverviewService.getOrgPlan({ orgId, actor: req.actor, refreshCache });

  server.route({
    method: "GET",
    url: "/:organizationId/plan",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getOrganizationPlan",
      params: z.object({ organizationId: z.string().trim() }),
      querystring: z.object({
        refreshCache: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true")
      }),
      response: {
        200: z.object({ plan: z.any() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const plan = await readOrgPlan(req, req.params.organizationId, req.query.refreshCache);
      return { plan: plan.toJSON() };
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/plans",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listOrganizationPlans",
      params: z.object({ organizationId: z.string().trim() }),
      querystring: z.object({ workspaceId: z.string().trim().optional() }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const plan = await readOrgPlan(req, req.params.organizationId, false);
      return plan.toJSON();
    }
  });
};
