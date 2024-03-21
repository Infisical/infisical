import ms from "ms";
import { z } from "zod";

import { DynamicSecretLeasesSchema } from "@app/db/schemas";
import { daysToMillisecond } from "@app/lib/dates";
import { removeTrailingSlash } from "@app/lib/fn";
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
          .superRefine((val, ctx) => {
            if (!val) return;
            const valMs = ms(val);
            if (valMs < 60 * 1000)
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
            if (valMs > daysToMillisecond(1))
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
          }),
        path: z.string().trim().default("/").transform(removeTrailingSlash),
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
        path: z.string().trim().default("/").transform(removeTrailingSlash),
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
        ttl: z
          .string()
          .optional()
          .superRefine((val, ctx) => {
            if (!val) return;
            const valMs = ms(val);
            if (valMs < 60 * 1000)
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
            if (valMs > daysToMillisecond(1))
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
          }),
        projectId: z.string(),
        path: z.string().trim().default("/").transform(removeTrailingSlash),
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
        path: z.string().trim().default("/").transform(removeTrailingSlash),
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
