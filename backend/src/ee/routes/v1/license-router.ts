import { FastifyRequest } from "fastify";
import { z } from "zod";

import { OrganizationActionScope } from "@app/db/schemas";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

// Plan reads only. The cloud billing surface (checkout, portal, payment methods, tax ids, invoices)
// lives on the License Server v2 routes in license-v2-router; the License Server v1 endpoints these
// used to call are decommissioned.
export const registerLicenseRouter = async (server: FastifyZodProvider) => {
  // Any member of the org can read its plan, which is always its root org's.
  const readOrgPlan = async (req: FastifyRequest, orgId: string, refreshCache: boolean) => {
    await server.services.permission.getOrgPermission({
      actorId: req.permission.id,
      actor: req.permission.type,
      orgId,
      actorOrgId: req.permission.orgId,
      actorAuthMethod: req.permission.authMethod,
      scope: OrganizationActionScope.Any
    });
    if (refreshCache) {
      await server.services.licenseDomain.refreshPlan(req.permission.rootOrgId);
    }
    return server.services.licenseDomain.getPlan(req.permission.rootOrgId);
  };

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
      return { plan };
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/plans",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({ organizationId: z.string().trim() }),
      querystring: z.object({ workspaceId: z.string().trim().optional() }),
      response: {
        200: z.any()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      return readOrgPlan(req, req.params.organizationId, false);
    }
  });
};
