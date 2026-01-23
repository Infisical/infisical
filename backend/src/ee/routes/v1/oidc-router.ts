/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// All the any rules are disabled because passport typesense with fastify is really poor

import { Authenticator, Strategy } from "@fastify/passport";
import fastifySession from "@fastify/session";
import RedisStore from "connect-redis";
import { z } from "zod";

import { OidcConfigsSchema } from "@app/db/schemas/oidc-configs";
import { OIDCConfigurationType, OIDCJWTSignatureAlgorithm } from "@app/ee/services/oidc/oidc-config-types";
import { ApiDocsTags, OidcSSo } from "@app/lib/api-docs";
import { getConfig } from "@app/lib/config/env";
import { authRateLimit, readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SanitizedOidcConfigSchema = OidcConfigsSchema.pick({
  id: true,
  issuer: true,
  authorizationEndpoint: true,
  configurationType: true,
  discoveryURL: true,
  jwksUri: true,
  tokenEndpoint: true,
  userinfoEndpoint: true,
  orgId: true,
  isActive: true,
  allowedEmailDomains: true,
  manageGroupMemberships: true,
  jwtSignatureAlgorithm: true
});

export const registerOidcRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();
  const passport = new Authenticator({ key: "oidc", userProperty: "passportUser" });

  /*
  - OIDC protocol cannot work without sessions: https://github.com/panva/node-openid-client/issues/190
  - Current redis usage is not ideal and will eventually have to be refactored to use a better structure
  - Fastify session <> Redis structure is based on the ff: https://github.com/fastify/session/blob/master/examples/redis.js
  */
  const redisStore = new RedisStore({
    client: server.redis,
    prefix: "oidc-session:",
    ttl: 600 // 10 minutes
  });

  await server.register(fastifySession, {
    secret: appCfg.COOKIE_SECRET_SIGN_KEY,
    store: redisStore,
    cookie: {
      secure: appCfg.HTTPS_ENABLED,
      sameSite: "lax" // we want cookies to be sent to Infisical in redirects originating from IDP server
    }
  });

  await server.register(passport.initialize());
  await server.register(passport.secureSession());

  // redirect to IDP for login
  server.route({
    url: "/login",
    method: "GET",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      querystring: z.object({
        orgSlug: z.string().trim(),
        callbackPort: z.string().trim().optional()
      })
    },
    preValidation: [
      async (req, res) => {
        const { orgSlug, callbackPort } = req.query;

        // ensure fresh session state per login attempt
        await req.session.regenerate();

        req.session.set<any>("oidcOrgSlug", orgSlug);

        if (callbackPort) {
          req.session.set<any>("callbackPort", callbackPort);
        }

        const oidcStrategy = await server.services.oidc.getOrgAuthStrategy(orgSlug, callbackPort);
        return (
          passport.authenticate(oidcStrategy as Strategy, {
            scope: "profile email openid"
          }) as any
        )(req, res);
      }
    ],
    handler: () => {}
  });

  // callback route after login from IDP
  server.route({
    url: "/callback",
    method: "GET",
    preValidation: [
      async (req, res) => {
        const oidcOrgSlug = req.session.get<any>("oidcOrgSlug");
        const callbackPort = req.session.get<any>("callbackPort");
        const oidcStrategy = await server.services.oidc.getOrgAuthStrategy(oidcOrgSlug, callbackPort);

        return (
          passport.authenticate(oidcStrategy as Strategy, {
            failureRedirect: "/api/v1/sso/oidc/login/error",
            session: false,
            failureMessage: true
          }) as any
        )(req, res);
      }
    ],
    handler: async (req, res) => {
      await req.session.destroy();

      if (req.passportUser.isUserCompleted) {
        return res.redirect(
          `${appCfg.SITE_URL}/login/sso?token=${encodeURIComponent(req.passportUser.providerAuthToken)}`
        );
      }

      // signup
      return res.redirect(
        `${appCfg.SITE_URL}/signup/sso?token=${encodeURIComponent(req.passportUser.providerAuthToken)}`
      );
    }
  });

  server.route({
    url: "/login/error",
    method: "GET",
    handler: async (req, res) => {
      const failureMessage = req.session.get<any>("messages");
      await req.session.destroy();

      return res.status(500).send({
        error: "Authentication error",
        details: failureMessage ?? req.query
      });
    }
  });

  server.route({
    url: "/config",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.OidcSso],
      description: "Get OIDC config",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        organizationId: z.string().trim().describe(OidcSSo.GET_CONFIG.organizationId)
      }),
      response: {
        200: SanitizedOidcConfigSchema.pick({
          id: true,
          issuer: true,
          authorizationEndpoint: true,
          jwksUri: true,
          tokenEndpoint: true,
          userinfoEndpoint: true,
          configurationType: true,
          discoveryURL: true,
          isActive: true,
          orgId: true,
          allowedEmailDomains: true,
          manageGroupMemberships: true,
          jwtSignatureAlgorithm: true
        }).extend({
          clientId: z.string(),
          clientSecret: z.string()
        })
      }
    },
    handler: async (req) => {
      const oidc = await server.services.oidc.getOidc({
        organizationId: req.query.organizationId,
        type: "external",
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      return oidc;
    }
  });

  server.route({
    method: "PATCH",
    url: "/config",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.OidcSso],
      description: "Update OIDC config",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z
        .object({
          allowedEmailDomains: z
            .string()
            .trim()
            .optional()
            .default("")
            .transform((data) => {
              if (data === "") return "";
              // Trim each ID and join with ', ' to ensure formatting
              return data
                .split(",")
                .map((id) => id.trim())
                .join(", ");
            })
            .describe(OidcSSo.UPDATE_CONFIG.allowedEmailDomains),
          discoveryURL: z.string().trim().describe(OidcSSo.UPDATE_CONFIG.discoveryURL),
          configurationType: z.nativeEnum(OIDCConfigurationType).describe(OidcSSo.UPDATE_CONFIG.configurationType),
          issuer: z.string().trim().describe(OidcSSo.UPDATE_CONFIG.issuer),
          authorizationEndpoint: z.string().trim().describe(OidcSSo.UPDATE_CONFIG.authorizationEndpoint),
          jwksUri: z.string().trim().describe(OidcSSo.UPDATE_CONFIG.jwksUri),
          tokenEndpoint: z.string().trim().describe(OidcSSo.UPDATE_CONFIG.tokenEndpoint),
          userinfoEndpoint: z.string().trim().describe(OidcSSo.UPDATE_CONFIG.userinfoEndpoint),
          clientId: z.string().trim().describe(OidcSSo.UPDATE_CONFIG.clientId),
          clientSecret: z.string().trim().describe(OidcSSo.UPDATE_CONFIG.clientSecret),
          isActive: z.boolean().describe(OidcSSo.UPDATE_CONFIG.isActive),
          manageGroupMemberships: z.boolean().optional().describe(OidcSSo.UPDATE_CONFIG.manageGroupMemberships),
          jwtSignatureAlgorithm: z
            .nativeEnum(OIDCJWTSignatureAlgorithm)
            .optional()
            .describe(OidcSSo.UPDATE_CONFIG.jwtSignatureAlgorithm)
        })
        .partial()
        .merge(z.object({ organizationId: z.string().describe(OidcSSo.UPDATE_CONFIG.organizationId) })),
      response: {
        200: SanitizedOidcConfigSchema.pick({
          id: true,
          issuer: true,
          authorizationEndpoint: true,
          configurationType: true,
          discoveryURL: true,
          jwksUri: true,
          tokenEndpoint: true,
          userinfoEndpoint: true,
          orgId: true,
          allowedEmailDomains: true,
          isActive: true,
          manageGroupMemberships: true
        })
      }
    },
    handler: async (req) => {
      const oidc = await server.services.oidc.updateOidcCfg({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });
      return oidc;
    }
  });

  server.route({
    method: "POST",
    url: "/config",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.OidcSso],
      description: "Create OIDC config",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z
        .object({
          allowedEmailDomains: z
            .string()
            .trim()
            .optional()
            .default("")
            .transform((data) => {
              if (data === "") return "";
              // Trim each ID and join with ', ' to ensure formatting
              return data
                .split(",")
                .map((id) => id.trim())
                .join(", ");
            })
            .describe(OidcSSo.CREATE_CONFIG.allowedEmailDomains),
          configurationType: z.nativeEnum(OIDCConfigurationType).describe(OidcSSo.CREATE_CONFIG.configurationType),
          issuer: z.string().trim().optional().default("").describe(OidcSSo.CREATE_CONFIG.issuer),
          discoveryURL: z.string().trim().optional().default("").describe(OidcSSo.CREATE_CONFIG.discoveryURL),
          authorizationEndpoint: z
            .string()
            .trim()
            .optional()
            .default("")
            .describe(OidcSSo.CREATE_CONFIG.authorizationEndpoint),
          jwksUri: z.string().trim().optional().default("").describe(OidcSSo.CREATE_CONFIG.jwksUri),
          tokenEndpoint: z.string().trim().optional().default("").describe(OidcSSo.CREATE_CONFIG.tokenEndpoint),
          userinfoEndpoint: z.string().trim().optional().default("").describe(OidcSSo.CREATE_CONFIG.userinfoEndpoint),
          clientId: z.string().trim().describe(OidcSSo.CREATE_CONFIG.clientId),
          clientSecret: z.string().trim().describe(OidcSSo.CREATE_CONFIG.clientSecret),
          isActive: z.boolean().describe(OidcSSo.CREATE_CONFIG.isActive),
          organizationId: z.string().trim().describe(OidcSSo.CREATE_CONFIG.organizationId),
          manageGroupMemberships: z
            .boolean()
            .optional()
            .default(false)
            .describe(OidcSSo.CREATE_CONFIG.manageGroupMemberships),
          jwtSignatureAlgorithm: z
            .nativeEnum(OIDCJWTSignatureAlgorithm)
            .optional()
            .default(OIDCJWTSignatureAlgorithm.RS256)
            .describe(OidcSSo.CREATE_CONFIG.jwtSignatureAlgorithm)
        })
        .superRefine((data, ctx) => {
          if (data.configurationType === OIDCConfigurationType.CUSTOM) {
            if (!data.issuer) {
              ctx.addIssue({
                path: ["issuer"],
                message: "Issuer is required",
                code: z.ZodIssueCode.custom
              });
            }
            if (!data.authorizationEndpoint) {
              ctx.addIssue({
                path: ["authorizationEndpoint"],
                message: "Authorization endpoint is required",
                code: z.ZodIssueCode.custom
              });
            }
            if (!data.jwksUri) {
              ctx.addIssue({
                path: ["jwksUri"],
                message: "JWKS URI is required",
                code: z.ZodIssueCode.custom
              });
            }
            if (!data.tokenEndpoint) {
              ctx.addIssue({
                path: ["tokenEndpoint"],
                message: "Token endpoint is required",
                code: z.ZodIssueCode.custom
              });
            }
            if (!data.userinfoEndpoint) {
              ctx.addIssue({
                path: ["userinfoEndpoint"],
                message: "Userinfo endpoint is required",
                code: z.ZodIssueCode.custom
              });
            }
          } else {
            // eslint-disable-next-line no-lonely-if
            if (!data.discoveryURL) {
              ctx.addIssue({
                path: ["discoveryURL"],
                message: "Discovery URL is required",
                code: z.ZodIssueCode.custom
              });
            }
          }
        }),
      response: {
        200: SanitizedOidcConfigSchema
      }
    },

    handler: async (req) => {
      const oidc = await server.services.oidc.createOidcCfg({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });
      return oidc;
    }
  });

  server.route({
    method: "GET",
    url: "/manage-group-memberships",
    schema: {
      querystring: z.object({
        orgId: z.string().trim().min(1, "Org ID is required")
      }),
      response: {
        200: z.object({
          isEnabled: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const isEnabled = await server.services.oidc.isOidcManageGroupMembershipsEnabled(req.query.orgId, req.permission);

      return { isEnabled };
    }
  });
};
