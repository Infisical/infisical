import ms from "ms";
import { z } from "zod";

import { DynamicSecretLeasesSchema } from "@app/db/schemas";
import { DYNAMIC_SECRET_LEASES } from "@app/lib/api-docs";
import { daysToMillisecond } from "@app/lib/dates";
import { removeTrailingSlash } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedDynamicSecretSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerDynamicSecretLeaseRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        dynamicSecretName: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.CREATE.dynamicSecretName).toLowerCase(),
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.CREATE.projectSlug),
        ttl: z
          .string()
          .optional()
          .describe(DYNAMIC_SECRET_LEASES.CREATE.ttl)
          .superRefine((val, ctx) => {
            if (!val) return;
            const valMs = ms(val);
            if (valMs < 60 * 1000)
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
            if (valMs > daysToMillisecond(1))
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
          }),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(DYNAMIC_SECRET_LEASES.CREATE.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.CREATE.path)
      }),
      response: {
        200: z.object({
          lease: DynamicSecretLeasesSchema,
          dynamicSecret: SanitizedDynamicSecretSchema,
          data: z.unknown()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { data, lease, dynamicSecret } = await server.services.dynamicSecretLease.create({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name: req.body.dynamicSecretName,
        ...req.body
      });
      return { lease, data, dynamicSecret };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:leaseId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        leaseId: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.DELETE.leaseId)
      }),
      body: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.DELETE.projectSlug),
        path: z
          .string()
          .min(1)
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(DYNAMIC_SECRET_LEASES.DELETE.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.DELETE.environmentSlug),
        isForced: z.boolean().default(false).describe(DYNAMIC_SECRET_LEASES.DELETE.isForced)
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
    method: "POST",
    url: "/:leaseId/renew",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        leaseId: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.RENEW.leaseId)
      }),
      body: z.object({
        ttl: z
          .string()
          .describe(DYNAMIC_SECRET_LEASES.RENEW.ttl)
          .optional()
          .superRefine((val, ctx) => {
            if (!val) return;
            const valMs = ms(val);
            if (valMs < 60 * 1000)
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
            if (valMs > daysToMillisecond(1))
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
          }),
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.RENEW.projectSlug),
        path: z
          .string()
          .min(1)
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(DYNAMIC_SECRET_LEASES.RENEW.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.RENEW.environmentSlug)
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
    url: "/:leaseId",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        leaseId: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.GET_BY_LEASEID.leaseId)
      }),
      querystring: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.GET_BY_LEASEID.projectSlug),
        path: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(DYNAMIC_SECRET_LEASES.GET_BY_LEASEID.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.GET_BY_LEASEID.environmentSlug)
      }),
      response: {
        200: z.object({
          lease: DynamicSecretLeasesSchema.extend({
            dynamicSecret: SanitizedDynamicSecretSchema
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const lease = await server.services.dynamicSecretLease.getLeaseDetails({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        leaseId: req.params.leaseId,
        ...req.query
      });
      return { lease };
    }
  });
};
