/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// All the any rules are disabled because passport typesense with fastify is really poor

import { Authenticator, Strategy } from "@fastify/passport";
import fastifySession from "@fastify/session";
import { z } from "zod";

import { OidcConfigsSchema } from "@app/db/schemas/oidc-configs";
import { getConfig } from "@app/lib/config/env";

export const registerOidcRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();
  const passport = new Authenticator({ key: "oidc", userProperty: "passportUser" });
  await server.register(fastifySession, {
    secret: appCfg.COOKIE_SECRET_SIGN_KEY,
    cookie: {
      secure: false // has to be set to false if testing locally
    }
  });
  await server.register(passport.initialize());
  await server.register(passport.secureSession());

  // redirect to IDP for login
  server.route({
    url: "/login",
    method: "GET",
    schema: {
      params: z.object({
        orgSlug: z.string().trim()
      })
    },
    handler: async (req, res) => {
      // get params, save to session
      const { orgSlug } = req.params;
      req.session.set<any>("oidcOrgSlug", orgSlug);
      const oidcStrategy = await server.services.oidc.getOrgAuthStrategy(orgSlug);
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
      const oidcStrategy = await server.services.oidc.getOrgAuthStrategy(oidcOrgSlug);
      await (
        passport.authenticate(oidcStrategy as Strategy, {
          failureRedirect: "/api/v1/oidc/login/error",
          session: false,
          failureMessage: true
        }) as any
      )(req, res);

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
    handler: (req, res) => {
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
};
