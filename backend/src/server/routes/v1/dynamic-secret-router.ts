import ms from "ms";
import { z } from "zod";

import { DynamicSecretsSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { DynamicSecretProviderSchema } from "@app/services/dynamic-secret/providers/models";

export const registerDynamicSecretRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      body: z.object({
        projectId: z.string(),
        provider: DynamicSecretProviderSchema,
        defaultTTL: z.string().refine((val) => ms(val) > 0, "TTL must be a positive number"),
        maxTTL: z
          .string()
          .optional()
          .refine((val) => typeof val === "undefined" || ms(val) > 0, "Max TTL must be a positive number"),
        path: z.string().default("/"),
        environment: z.string(),
        slug: z.string().toLowerCase()
      }),
      response: {
        200: z.object({
          dynamicSecret: DynamicSecretsSchema
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
        inputs: z.any().optional(),
        defaultTTL: z
          .string()
          .optional()
          .refine((val) => typeof val === "undefined" || ms(val) > 0, "TTL must be a positive number"),
        maxTTL: z
          .string()
          .optional()
          .refine((val) => typeof val === "undefined" || ms(val) > 0, "Max TTL must be a positive number"),
        path: z.string(),
        environment: z.string(),
        newSlug: z.string()
      }),
      response: {
        200: z.object({
          dynamicSecret: DynamicSecretsSchema
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
        ...req.body
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
        path: z.string(),
        environment: z.string()
      }),
      response: {
        200: z.object({
          dynamicSecret: DynamicSecretsSchema
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
    url: "/",
    method: "GET",
    schema: {
      querystring: z.object({
        projectId: z.string(),
        path: z.string(),
        environment: z.string()
      }),
      response: {
        200: z.object({
          dynamicSecrets: DynamicSecretsSchema.array()
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
