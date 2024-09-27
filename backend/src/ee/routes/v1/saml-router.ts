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
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

type TSAMLConfig = {
  callbackUrl: string;
  entryPoint: string;
  issuer: string;
  cert: string;
  audience: string;
  wantAuthnResponseSigned?: boolean;
  wantAssertionsSigned?: boolean;
  disableRequestedAuthnContext?: boolean;
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
              };
            } else if (samlConfigId) {
              ssoLookupDetails = {
                type: "ssoId",
                id: samlConfigId
              };
            } else {
              throw new BadRequestError({ message: "Missing sso identitier or org slug" });
            }

            const ssoConfig = await server.services.saml.getSaml(ssoLookupDetails);
            if (!ssoConfig || !ssoConfig.isActive)
              throw new BadRequestError({ message: "Failed to authenticate with SAML SSO" });

            const samlConfig: TSAMLConfig = {
              callbackUrl: `${appCfg.SITE_URL}/api/v1/sso/saml2/${ssoConfig.id}`,
              entryPoint: ssoConfig.entryPoint,
              issuer: ssoConfig.issuer,
              cert: ssoConfig.cert,
              audience: appCfg.SITE_URL || ""
            };
            if (ssoConfig.authProvider === SamlProviders.JUMPCLOUD_SAML) {
              samlConfig.wantAuthnResponseSigned = false;
            }
            if (ssoConfig.authProvider === SamlProviders.AZURE_SAML) {
              samlConfig.disableRequestedAuthnContext = true;
              if (req.body?.RelayState && JSON.parse(req.body.RelayState).spInitiated) {
                samlConfig.audience = `spn:${ssoConfig.issuer}`;
              }
            }
            if (ssoConfig.authProvider === SamlProviders.GOOGLE_SAML) {
              samlConfig.wantAssertionsSigned = false;
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
          if (!profile) throw new BadRequestError({ message: "Missing profile" });
          const email =
            profile?.email ??
            // entra sends data in this format
            (profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/email"] as string) ??
            (profile?.emailAddress as string); // emailRippling is added because in Rippling the field `email` reserved\

          const firstName = (profile.firstName ??
            // entra sends data in this format
            profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/firstName"]) as string;

          const lastName =
            profile.lastName ?? profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/lastName"];

          if (!email || !firstName) {
            logger.info(
              {
                err: new Error("Invalid saml request. Missing email or first name"),
                profile
              },
              `email: ${email} firstName: ${profile.firstName as string}`
            );
          }

          const { isUserCompleted, providerAuthToken } = await server.services.saml.samlLogin({
            externalId: profile.nameID,
            email,
            firstName,
            lastName: lastName as string,
            relayState: (req.body as { RelayState?: string }).RelayState,
            authProvider: (req as unknown as FastifyRequest).ssoConfig?.authProvider as string,
            orgId: (req as unknown as FastifyRequest).ssoConfig?.orgId as string
          });
          cb(null, { isUserCompleted, providerAuthToken });
        } catch (error) {
          logger.error(error);
          cb(error as Error);
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
    method: "GET",
    url: "/config",
    config: {
      rateLimit: readLimit
    },
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
            cert: z.string(),
            lastUsed: z.date().nullable().optional()
          })
          .optional()
      }
    },
    handler: async (req) => {
      const saml = await server.services.saml.getSaml({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        orgId: req.query.organizationId,
        type: "org"
      });
      return saml;
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.body.organizationId,
        ...req.body
      });
      return saml;
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.body.organizationId,
        ...req.body
      });
      return saml;
    }
  });
};
