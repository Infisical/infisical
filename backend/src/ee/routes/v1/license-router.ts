/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// TODO(akhilmhdh): Fix this when license service gets it type
import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

// Plan reads only. The cloud billing surface (checkout, portal, payment methods, tax ids, invoices)
// lives on the License Server v2 routes in license-v2-router; the License Server v1 endpoints these
// used to call are decommissioned.
export const registerLicenseRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:organizationId/plan",
    config: {
      rateLimit: readLimit
    },
    schema: {
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const plan = await server.services.license.getOrgPlan({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        rootOrgId: req.permission.rootOrgId,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId,
        refreshCache: req.query.refreshCache
      });
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
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.license.getOrgPlan({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.params.organizationId,
        rootOrgId: req.permission.rootOrgId
      });
      return data;
    }
  });
};
