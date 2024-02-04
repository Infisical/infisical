/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// All the any rules are disabled because passport typesense with fastify is really poor

import { Authenticator } from "@fastify/passport";
import fastifySession from "@fastify/session";
import { MultiSamlStrategy } from "@node-saml/passport-saml";
import { FastifyRequest } from "fastify";
import { z } from "zod";

import { SamlConfigsSchema } from "@app/db/schemas";
import { SamlProviders, TGetSamlCfgDTO } from "@app/ee/services/saml-config/saml-config-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";

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
        // eslint-disable-next-line
        getSamlOptions: async (req, done) => {
          try {
            const { samlConfigId, orgSlug } = req.params;
          
            let ssoLookupDetails: TGetSamlCfgDTO;
            
            if (orgSlug) {
              ssoLookupDetails = {
                type: "orgSlug",
                orgSlug
              }
            } else if (samlConfigId) {
              ssoLookupDetails = {
                type: "ssoId",
                id: samlConfigId
              }
            } else {
              throw new BadRequestError({ message: "Missing sso identitier or org slug" });
            }

            const ssoConfig = await server.services.saml.getSaml(ssoLookupDetails);
            if (!ssoConfig) throw new BadRequestError({ message: "SSO config not found" });

            const samlConfig: TSAMLConfig = {
              callbackUrl: `${appCfg.SITE_URL}/api/v1/sso/saml2/${samlConfigId}`,
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
          } catch (error) {
            logger.error(error);
            done(error as Error);
          }
        }
      },
      // eslint-disable-next-line
      async (req, profile, cb) => {
        try {
          const serverCfg = getServerCfg();
          if (!profile) throw new BadRequestError({ message: "Missing profile" });
          const { firstName } = profile;
          const email = profile?.email ?? (profile?.emailAddress as string); // emailRippling is added because in Rippling the field `email` reserved

          if (!email || !firstName) {
            throw new BadRequestError({ message: "Invalid request. Missing email or first name" });
          }

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
          logger.error(error);
          cb(null, {});
        }
      },
      () => {}
    )
  );

  server.route({
    url: "/redirect/saml2/organizations/:orgSlug",
    method: "GET",
    schema: {
      params: z.object({
        orgSlug: z.string().trim()
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
    url: "/redirect/saml2/:samlConfigId",
    method: "GET",
    schema: {
      params: z.object({
        samlConfigId: z.string().trim()
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
    url: "/saml2/:samlConfigId",
    method: "POST",
    schema: {
      params: z.object({
        samlConfigId: z.string().trim()
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
          `${appCfg.SITE_URL}/login/sso?token=${encodeURIComponent(req.passportUser.providerAuthToken)}`
        );
      }
      return res.redirect(
        `${appCfg.SITE_URL}/signup/sso?token=${encodeURIComponent(req.passportUser.providerAuthToken)}`
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
        actorOrgScope: req.permission.orgId,
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
        actorOrgScope: req.permission.orgId,
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
        actorOrgScope: req.permission.orgId,
        orgId: req.body.organizationId,
        ...req.body
      });
      return saml;
    }
  });
};
