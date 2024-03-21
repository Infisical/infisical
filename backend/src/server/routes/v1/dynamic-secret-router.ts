import ms from "ms";
import { z } from "zod";

import { daysToMillisecond } from "@app/lib/dates";
import { removeTrailingSlash } from "@app/lib/fn";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { DynamicSecretProviderSchema } from "@app/services/dynamic-secret/providers/models";

import { SanitizedDynamicSecretSchema } from "../sanitizedSchemas";

export const registerDynamicSecretRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      body: z.object({
        projectId: z.string(),
        provider: DynamicSecretProviderSchema,
        defaultTTL: z.string().superRefine((val, ctx) => {
          const valMs = ms(val);
          if (valMs < 60 * 1000)
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
          if (valMs > daysToMillisecond(1))
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
        }),
        maxTTL: z
          .string()
          .optional()
          .superRefine((val, ctx) => {
            if (!val) return;
            const valMs = ms(val);
            if (valMs < 60 * 1000)
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
            if (valMs > daysToMillisecond(1))
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
          })
          .nullable(),
        path: z.string().trim().default("/").transform(removeTrailingSlash),
        environment: z.string(),
        slug: z.string().toLowerCase()
      }),
      response: {
        200: z.object({
          dynamicSecret: SanitizedDynamicSecretSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dynamicSecretCfg = await server.services.dynamicSecret.create({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });
      return { dynamicSecret: dynamicSecretCfg };
    }
  });

  server.route({
    url: "/:slug",
    method: "PATCH",
    schema: {
      params: z.object({
        slug: z.string()
      }),
      body: z.object({
        projectId: z.string(),
        path: z.string().trim().default("/").transform(removeTrailingSlash),
        environment: z.string(),
        data: z.object({
          inputs: z.any().optional(),
          defaultTTL: z
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
          maxTTL: z
            .string()
            .optional()
            .superRefine((val, ctx) => {
              if (!val) return;
              const valMs = ms(val);
              if (valMs < 60 * 1000)
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
              if (valMs > daysToMillisecond(1))
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
            })
            .nullable(),
          newSlug: z.string().optional()
        })
      }),
      response: {
        200: z.object({
          dynamicSecret: SanitizedDynamicSecretSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dynamicSecretCfg = await server.services.dynamicSecret.updateBySlug({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        slug: req.params.slug,
        path: req.body.path,
        projectId: req.body.projectId,
        environment: req.body.environment,
        ...req.body.data
      });
      return { dynamicSecret: dynamicSecretCfg };
    }
  });

  server.route({
    url: "/:slug",
    method: "DELETE",
    schema: {
      params: z.object({
        slug: z.string()
      }),
      body: z.object({
        projectId: z.string(),
        path: z.string().trim().default("/").transform(removeTrailingSlash),
        environment: z.string()
      }),
      response: {
        200: z.object({
          dynamicSecret: SanitizedDynamicSecretSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dynamicSecretCfg = await server.services.dynamicSecret.deleteBySlug({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        slug: req.params.slug,
        ...req.body
      });
      return { dynamicSecret: dynamicSecretCfg };
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
          dynamicSecret: SanitizedDynamicSecretSchema.extend({
            inputs: z.unknown()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dynamicSecretCfg = await server.services.dynamicSecret.getDetails({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        slug: req.params.slug,
        ...req.query
      });
      return { dynamicSecret: dynamicSecretCfg };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    schema: {
      querystring: z.object({
        projectId: z.string(),
        path: z.string().trim().default("/").transform(removeTrailingSlash),
        environment: z.string()
      }),
      response: {
        200: z.object({
          dynamicSecrets: SanitizedDynamicSecretSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dynamicSecretCfgs = await server.services.dynamicSecret.list({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });
      return { dynamicSecrets: dynamicSecretCfgs };
    }
  });
};
