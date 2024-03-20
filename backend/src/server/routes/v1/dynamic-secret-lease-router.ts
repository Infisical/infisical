import ms from "ms";
import { z } from "zod";

import { DynamicSecretLeasesSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerDynamicSecretLeaseRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      body: z.object({
        slug: z.string(),
        projectId: z.string(),
        ttl: z
          .string()
          .optional()
          .refine((val) => typeof val === "undefined" || ms(val) > 0, "TTL must be a positive number"),
        path: z.string().default("/"),
        environment: z.string()
      }),
      response: {
        200: z.object({
          lease: DynamicSecretLeasesSchema,
          data: z.unknown()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { data, lease } = await server.services.dynamicSecretLease.create({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });
      return { lease, data };
    }
  });

  server.route({
    url: "/:leaseId",
    method: "DELETE",
    schema: {
      params: z.object({
        leaseId: z.string()
      }),
      body: z.object({
        projectId: z.string(),
        path: z.string(),
        environment: z.string()
      }),
      response: {
        200: z.object({
          lease: DynamicSecretLeasesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const lease = await server.services.dynamicSecretLease.revokeLease({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        leaseId: req.params.leaseId,
        ...req.body
      });
      return { lease };
    }
  });

  server.route({
    url: "/:leaseId/renew",
    method: "POST",
    schema: {
      params: z.object({
        leaseId: z.string()
      }),
      body: z.object({
        projectId: z.string(),
        path: z.string(),
        environment: z.string()
      }),
      response: {
        200: z.object({
          lease: DynamicSecretLeasesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const lease = await server.services.dynamicSecretLease.renewLease({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        leaseId: req.params.leaseId,
        ...req.body
      });
      return { lease };
    }
  });

  server.route({
    url: "/:slug",
    method: "GET",
    schema: {
      params: z.object({
        slug: z.string()
      }),
      querystring: z.object({
        projectId: z.string(),
        path: z.string(),
        environment: z.string()
      }),
      response: {
        200: z.object({
          leases: DynamicSecretLeasesSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const leases = await server.services.dynamicSecretLease.listLeases({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        slug: req.params.slug,
        ...req.query
      });
      return { leases };
    }
  });
};
