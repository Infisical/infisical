import ms from "ms";
import { z } from "zod";

import { DynamicSecretLeasesSchema } from "@app/db/schemas";
import { daysToMillisecond } from "@app/lib/dates";
import { removeTrailingSlash } from "@app/lib/fn";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { SanitizedDynamicSecretSchema } from "../sanitizedSchemas";

export const registerDynamicSecretLeaseRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      body: z.object({
        slug: z.string().min(1),
        projectSlug: z.string().min(1),
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
        environment: z.string().min(1)
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
        ...req.body
      });
      return { lease, data, dynamicSecret };
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
        projectSlug: z.string().min(1),
        path: z.string().min(1).trim().default("/").transform(removeTrailingSlash),
        environment: z.string().min(1),
        isForced: z.boolean().default(false)
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
        projectSlug: z.string().min(1),
        path: z.string().min(1).trim().default("/").transform(removeTrailingSlash),
        environment: z.string().min(1)
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
    schema: {
      params: z.object({
        leaseId: z.string()
      }),
      querystring: z.object({
        projectSlug: z.string().min(1),
        path: z.string().trim().default("/").transform(removeTrailingSlash),
        environment: z.string().min(1)
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
