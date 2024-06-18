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
import { Redis } from "ioredis";
import { z } from "zod";

import { OidcConfigsSchema } from "@app/db/schemas/oidc-configs";
import { getConfig } from "@app/lib/config/env";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerOidcRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();
  const redis = new Redis(appCfg.REDIS_URL);
  const passport = new Authenticator({ key: "oidc", userProperty: "passportUser" });
  const redisStore = new RedisStore({
    client: redis,
    prefix: "oidc-session:",
    ttl: 600 // 10 minutes
  });

  await server.register(fastifySession, {
    secret: appCfg.COOKIE_SECRET_SIGN_KEY,
    store: redisStore,
    cookie: {
      secure: false // set to true in production
    }
  });

  await server.register(passport.initialize());
  await server.register(passport.secureSession());

  // redirect to IDP for login
  server.route({
    url: "/login",
    method: "GET",
    schema: {
      querystring: z.object({
        orgSlug: z.string().trim(),
        callbackPort: z.string().trim().optional()
      })
    },
    handler: async (req, res) => {
      // get params, save to session
      const { orgSlug, callbackPort } = req.query;
      req.session.set<any>("oidcOrgSlug", orgSlug);

      if (callbackPort) {
        req.session.set<any>("callbackPort", callbackPort);
      }

      const oidcStrategy = await server.services.oidc.getOrgAuthStrategy(orgSlug, callbackPort);
      (
        passport.authenticate(oidcStrategy as Strategy, {
          scope: "profile email openid"
        }) as any
      )(req, res);
    }
  });

  // callback route after login from IDP
  server.route({
    url: "/callback",
    method: "GET",
    handler: async (req, res) => {
      const oidcOrgSlug = req.session.get<any>("oidcOrgSlug");
      const callbackPort = req.session.get<any>("callbackPort");
      const oidcStrategy = await server.services.oidc.getOrgAuthStrategy(oidcOrgSlug, callbackPort);

      await (
        passport.authenticate(oidcStrategy as Strategy, {
          failureRedirect: "/api/v1/sso/oidc/login/error",
          session: false,
          failureMessage: true
        }) as any
      )(req, res);

      await req.session.destroy();

      if (req.passportUser.isUserCompleted) {
        return res.redirect(
          `http://localhost:8080/login/sso?token=${encodeURIComponent(req.passportUser.providerAuthToken)}`
        );
      }

      // signup
      return res.redirect(
        `http://localhost:8080/signup/sso?token=${encodeURIComponent(req.passportUser.providerAuthToken)}`
      );
    }
  });

  server.route({
    url: "/login/error",
    method: "GET",
    handler: async (req, res) => {
      await req.session.destroy();

      return res.status(500).send({
        error: "Authentication error",
        details: req.query
      });
    }
  });

  server.route({
    url: "/config",
    method: "GET",
    schema: {
      querystring: z.object({
        orgSlug: z.string().trim()
      }),
      response: {
        200: OidcConfigsSchema.pick({
          id: true,
          issuer: true,
          authorizationEndpoint: true,
          jwksUri: true,
          tokenEndpoint: true,
          userinfoEndpoint: true,
          isActive: true,
          orgId: true
        }).extend({
          clientId: z.string(),
          clientSecret: z.string()
        })
      }
    },
    handler: async (req) => {
      const { orgSlug } = req.query;
      const oidc = await server.services.oidc.getOidc({
        orgSlug,
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
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z
        .object({
          issuer: z.string().trim(),
          authorizationEndpoint: z.string().trim(),
          jwksUri: z.string().trim(),
          tokenEndpoint: z.string().trim(),
          userinfoEndpoint: z.string().trim(),
          clientId: z.string().trim(),
          clientSecret: z.string().trim(),
          isActive: z.boolean()
        })
        .partial()
        .merge(z.object({ orgSlug: z.string() })),
      response: {
        200: OidcConfigsSchema.pick({
          id: true,
          issuer: true,
          authorizationEndpoint: true,
          jwksUri: true,
          tokenEndpoint: true,
          userinfoEndpoint: true,
          orgId: true,
          isActive: true
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
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        issuer: z.string().trim(),
        authorizationEndpoint: z.string().trim(),
        jwksUri: z.string().trim(),
        tokenEndpoint: z.string().trim(),
        userinfoEndpoint: z.string().trim(),
        clientId: z.string().trim(),
        clientSecret: z.string().trim(),
        isActive: z.boolean(),
        orgSlug: z.string().trim()
      }),
      response: {
        200: OidcConfigsSchema.pick({
          id: true,
          issuer: true,
          authorizationEndpoint: true,
          jwksUri: true,
          tokenEndpoint: true,
          userinfoEndpoint: true,
          orgId: true,
          isActive: true
        })
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
};
