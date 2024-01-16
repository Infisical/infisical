import { Authenticator } from "@fastify/passport";
import fastifySession from "@fastify/session";
import { MultiSamlStrategy } from "@node-saml/passport-saml";
import { FastifyRequest } from "fastify";
import { z } from "zod";

import { SamlConfigsSchema } from "@app/db/schemas";
import { SamlProviders } from "@app/ee/services/saml-config/saml-config-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

type TSAMLConfig = {
  callbackUrl: string;
  entryPoint: string;
  issuer: string;
  cert: string;
  audience: string;
  wantAuthnResponseSigned?: boolean;
};

export const registerSamlRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();
  const passport = new Authenticator({ key: "saml", userProperty: "passportUser" });
  await server.register(fastifySession, { secret: appCfg.COOKIE_SECRET_SIGN_KEY });
  await server.register(passport.initialize());
  await server.register(passport.secureSession());
  server.decorateRequest("ssoConfig", null);
  passport.use(
    new MultiSamlStrategy(
      {
        passReqToCallback: true,
        getSamlOptions: async (req, done) => {
          const { ssoIdentifier } = req.params;
          if (!ssoIdentifier) throw new BadRequestError({ message: "Missing sso identitier" });

          const ssoConfig = await server.services.saml.getSaml({
            type: "ssoId",
            id: ssoIdentifier
          });
          if (!ssoConfig) throw new BadRequestError({ message: "SSO config not found" });

          const samlConfig: TSAMLConfig = {
            callbackUrl: `${appCfg.SITE_URL}/api/v1/sso/saml2/${ssoIdentifier}`,
            entryPoint: ssoConfig.entryPoint,
            issuer: ssoConfig.issuer,
            cert: ssoConfig.cert,
            audience: appCfg.SITE_URL || ""
          };
          if (ssoConfig.authProvider === SamlProviders.JUMPCLOUD_SAML) {
            samlConfig.wantAuthnResponseSigned = false;
          }
          if (ssoConfig.authProvider === SamlProviders.AZURE_SAML) {
            if (req.body.RelayState && JSON.parse(req.body.RelayState).spIntiaited) {
              samlConfig.audience = `spn:${ssoConfig.issuer}`;
            }
          }
          (req as unknown as FastifyRequest).ssoConfig = ssoConfig;
          done(null, samlConfig);
        }
      },
      async (req, profile, cb) => {
        try {
          const serverCfg = server.services.superAdmin.getServerCfg();
          if (!profile) throw new BadRequestError({ message: "Missing profile" });
          const { email, firstName } = profile;
          if (!email || !firstName)
            throw new BadRequestError({ message: "Invalid request. Missing email or first name" });

          const { isUserCompleted, providerAuthToken } = await server.services.saml.samlLogin({
            email,
            firstName: profile.firstName as string,
            lastName: profile.lastName as string,
            isSignupAllowed: Boolean(serverCfg.allowSignUp),
            relayState: (req.body as { RelayState?: string }).RelayState,
            authProvider: (req as unknown as FastifyRequest).ssoConfig?.authProvider as string,
            orgId: (req as unknown as FastifyRequest).ssoConfig?.orgId as string
          });
          cb(null, { isUserCompleted, providerAuthToken });
        } catch (error) {
          cb(null, {});
        }
      },
      () => {}
    )
  );

  server.route({
    url: "/redirect/saml2/:ssoIdentifier",
    method: "GET",
    schema: {
      params: z.object({
        ssoIdentifier: z.string().trim()
      }),
      querystring: z.object({
        callback_port: z.string().optional()
      })
    },
    preValidation: (req, res) =>
      (
        passport.authenticate("saml", {
          failureRedirect: "/",
          additionalParams: {
            RelayState: JSON.stringify({
              spInitiated: true,
              callbackPort: req.query.callback_port ?? ""
            })
          }
        } as any) as any
      )(req, res),
    handler: () => {}
  });

  server.route({
    url: "/saml2/:ssoIdentifier",
    method: "POST",
    schema: {
      params: z.object({
        ssoIdentifier: z.string().trim()
      })
    },
    preValidation: passport.authenticate("saml", {
      session: false,
      failureFlash: true,
      failureRedirect: "/login/provider/error"
      // this is due to zod type difference
    }) as any,
    handler: (req, res) => {
      if (req.passportUser.isUserCompleted) {
        return res.redirect(
          `${appCfg.SITE_URL}/login/sso?token=${encodeURIComponent(
            req.passportUser.providerAuthToken
          )}`
        );
      }
      return res.redirect(
        `${appCfg.SITE_URL}/signup/sso?token=${encodeURIComponent(
          req.passportUser.providerAuthToken
        )}`
      );
    }
  });

  server.route({
    url: "/config",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      querystring: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            organization: z.string(),
            orgId: z.string(),
            authProvider: z.string(),
            isActive: z.boolean(),
            entryPoint: z.string(),
            issuer: z.string(),
            cert: z.string()
          })
          .optional()
      }
    },
    handler: async (req) => {
      const saml = await server.services.saml.getSaml({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.query.organizationId,
        type: "org"
      });
      return saml;
    }
  });

  server.route({
    url: "/config",
    method: "POST",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        organizationId: z.string(),
        authProvider: z.nativeEnum(SamlProviders),
        isActive: z.boolean(),
        entryPoint: z.string(),
        issuer: z.string(),
        cert: z.string()
      }),
      response: {
        200: SamlConfigsSchema
      }
    },
    handler: async (req) => {
      const saml = await server.services.saml.createSamlCfg({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.body.organizationId,
        ...req.body
      });
      return saml;
    }
  });

  server.route({
    url: "/config",
    method: "PATCH",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z
        .object({
          authProvider: z.nativeEnum(SamlProviders),
          isActive: z.boolean(),
          entryPoint: z.string(),
          issuer: z.string(),
          cert: z.string()
        })
        .partial()
        .merge(z.object({ organizationId: z.string() })),
      response: {
        200: SamlConfigsSchema
      }
    },
    handler: async (req) => {
      const saml = await server.services.saml.updateSamlCfg({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.body.organizationId,
        ...req.body
      });
      return saml;
    }
  });
};
