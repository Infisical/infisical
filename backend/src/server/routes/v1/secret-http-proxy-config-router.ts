import { z } from "zod";

import { SecretHttpProxyConfigsSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  ProxyAuthType,
  SubstitutionSurface
} from "@app/services/secret-http-proxy-config/secret-http-proxy-config-types";

const ProxySubstitutionSchema = z.object({
  key: z.string().min(1),
  placeholder: z.string().min(4),
  in: z.array(z.nativeEnum(SubstitutionSurface)).optional()
});

const ProxyRuleSchema = z.object({
  host: z.string().min(1),
  authType: z.nativeEnum(ProxyAuthType),
  headerName: z.string().optional(),
  username: z.string().optional(),
  headerTemplate: z.string().optional(),
  substitutions: z.array(ProxySubstitutionSchema).optional()
});

export const registerSecretHttpProxyConfigRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId/secrets/:secretId/http-proxy-config",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim(),
        secretId: z.string().uuid()
      }),
      response: {
        200: z.object({
          proxyConfig: SecretHttpProxyConfigsSchema.nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const proxyConfig = await server.services.secretHttpProxyConfig.getBySecretId({
        secretId: req.params.secretId,
        projectId: req.params.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { proxyConfig: proxyConfig ?? null };
    }
  });

  server.route({
    method: "PUT",
    url: "/:projectId/secrets/:secretId/http-proxy-config",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim(),
        secretId: z.string().uuid()
      }),
      body: z.object({
        placeholder: z.string().min(4).optional(),
        rules: z.array(ProxyRuleSchema)
      }),
      response: {
        200: z.object({
          proxyConfig: SecretHttpProxyConfigsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const proxyConfig = await server.services.secretHttpProxyConfig.upsert({
        secretId: req.params.secretId,
        projectId: req.params.projectId,
        placeholder: req.body.placeholder,
        rules: req.body.rules,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { proxyConfig };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/secrets/:secretId/http-proxy-config",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim(),
        secretId: z.string().uuid()
      }),
      response: {
        200: z.object({
          proxyConfig: SecretHttpProxyConfigsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const proxyConfig = await server.services.secretHttpProxyConfig.deleteBySecretId({
        secretId: req.params.secretId,
        projectId: req.params.projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { proxyConfig };
    }
  });

  server.route({
    method: "GET",
    url: "/:projectId/secrets/http-proxy-configs",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().trim()
      }),
      querystring: z.object({
        environment: z.string(),
        secretPath: z.string().default("/")
      }),
      response: {
        200: z.object({
          proxyConfigs: SecretHttpProxyConfigsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const proxyConfigs = await server.services.secretHttpProxyConfig.listByScope({
        projectId: req.params.projectId,
        environment: req.query.environment,
        secretPath: req.query.secretPath,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return { proxyConfigs };
    }
  });
};
