/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// All the any rules are disabled because passport typesense with fastify is really poor

import { Authenticator } from "@fastify/passport";
import { requestContext } from "@fastify/request-context";
import fastifySession from "@fastify/session";
import { MultiSamlStrategy } from "@node-saml/passport-saml";
import { AuthenticateOptions } from "@node-saml/passport-saml/lib/types";
import { FastifyRequest } from "fastify";
import { z } from "zod";

import { SamlProviders, TGetSamlCfgDTO } from "@app/ee/services/saml-config/saml-config-types";
import { ApiDocsTags, SamlSso } from "@app/lib/api-docs";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { AuthAttemptAuthMethod, AuthAttemptAuthResult, authAttemptCounter } from "@app/lib/telemetry/metrics";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { addAuthOriginDomainCookie } from "@app/server/lib/cookie";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedSamlConfigSchema } from "@app/server/routes/sanitizedSchema/directory-config";
import { AuthMode, ProviderAuthResult, TProviderAuthCallback } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

type TSAMLConfig = {
  callbackUrl: string;
  entryPoint: string;
  issuer: string;
  idpCert: string;
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
            const { samlConfigId, domain, orgSlug } = req.params;

            let ssoLookupDetails: TGetSamlCfgDTO;

            if (domain) {
              ssoLookupDetails = {
                type: "domain",
                domain
              };
            } else if (orgSlug) {
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
              throw new BadRequestError({ message: "Missing sso identifier or org slug" });
            }

            const ssoConfig = await server.services.saml.getSaml(ssoLookupDetails);
            if (!ssoConfig || !ssoConfig.isActive)
              throw new BadRequestError({ message: "Failed to authenticate with SAML SSO" });

            const samlConfig: TSAMLConfig = {
              callbackUrl: `${appCfg.SITE_URL}/api/v1/sso/saml2/${ssoConfig.id}`,
              entryPoint: ssoConfig.entryPoint,
              issuer: ssoConfig.issuer,
              idpCert: ssoConfig.cert,
              audience: appCfg.SITE_URL || ""
            };
            if (ssoConfig.authProvider === SamlProviders.JUMPCLOUD_SAML) {
              samlConfig.wantAuthnResponseSigned = false;
            }
            if (ssoConfig.authProvider === SamlProviders.AZURE_SAML) {
              samlConfig.disableRequestedAuthnContext = true;
              // Azure AD/Entra ID can be configured to sign only the assertion (not the response).
              // Setting wantAuthnResponseSigned to false allows both "Sign SAML assertion" and
              // "Sign SAML response and assertion" configurations to work.
              samlConfig.wantAuthnResponseSigned = false;
              if (req.body?.RelayState && JSON.parse(req.body.RelayState).spInitiated) {
                samlConfig.audience = `spn:${ssoConfig.issuer}`;
              }
            }
            if (
              ssoConfig.authProvider === SamlProviders.GOOGLE_SAML ||
              ssoConfig.authProvider === SamlProviders.AUTH0_SAML
            ) {
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
        if (!profile) throw new BadRequestError({ message: "Missing profile" });

        const email =
          profile?.email ??
          // entra sends data in this format
          (profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/email"] as string) ??
          (profile?.emailAddress as string); // emailRippling is added because in Rippling the field `email` reserved\

        try {
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

            throw new BadRequestError({
              message:
                "Missing email or first name. Please double check your SAML attribute mapping for the selected provider."
            });
          }

          const userMetadata = Object.keys(profile.attributes || {})
            .map((key) => {
              // for the ones like in format: http://schemas.xmlsoap.org/ws/2005/05/identity/claims/email
              const formatedKey = key.startsWith("http") ? key.split("/").at(-1) || "" : key;
              return {
                key: formatedKey,
                value: String((profile.attributes as Record<string, string>)[key]).substring(0, 1020)
              };
            })
            .filter((el) => el.key && !["email", "firstName", "lastName"].includes(el.key));

          let callbackPort: number | undefined;
          try {
            const relayStatePayload =
              typeof req?.body === "object" ? (req.body as { RelayState?: string })?.RelayState : undefined;
            if (relayStatePayload && Buffer.byteLength(relayStatePayload) <= 1024) {
              callbackPort = Number(JSON.parse(relayStatePayload)?.callbackPort);
            }
          } catch (err) {
            logger.error(err, "Relay state parsing failed");
          }

          const loginResult = await server.services.saml.samlLogin({
            externalId: profile.nameID,
            email: email.toLowerCase(),
            firstName,
            lastName: lastName as string,
            callbackPort,
            authProvider: (req as unknown as FastifyRequest).ssoConfig?.authProvider,
            orgId: (req as unknown as FastifyRequest).ssoConfig?.orgId,
            ip: requestContext.get("ip") || "",
            userAgent: requestContext.get("userAgent") || "",
            metadata: userMetadata
          });

          if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
            authAttemptCounter.add(1, {
              "infisical.user.email": email.toLowerCase(),
              "infisical.user.id": loginResult.userId,
              "infisical.organization.id": loginResult.orgId,
              "infisical.organization.name": loginResult.orgName,
              "infisical.auth.method": AuthAttemptAuthMethod.SAML,
              "infisical.auth.result": AuthAttemptAuthResult.SUCCESS,
              "client.address": requestContext.get(RequestContextKey.Ip),
              "user_agent.original": requestContext.get(RequestContextKey.UserAgent)
            });
          }

          cb(null, loginResult);
        } catch (error) {
          if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
            authAttemptCounter.add(1, {
              "infisical.user.email": email.toLowerCase(),
              "infisical.auth.method": AuthAttemptAuthMethod.SAML,
              "infisical.auth.result": AuthAttemptAuthResult.FAILURE,
              "client.address": requestContext.get(RequestContextKey.Ip),
              "user_agent.original": requestContext.get(RequestContextKey.UserAgent)
            });
          }

          logger.error(error);
          cb(error as Error);
        }
      },
      () => {}
    )
  );

  server.route({
    url: "/redirect/saml2/organizations/domain/:domain",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        domain: z.string().trim()
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
        } as AuthenticateOptions) as any
      )(req, res),
    handler: () => {}
  });

  server.route({
    url: "/redirect/saml2/organizations/:orgSlug",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
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
        } as AuthenticateOptions) as any
      )(req, res),
    handler: () => {}
  });

  server.route({
    url: "/redirect/saml2/:samlConfigId",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
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
        } as AuthenticateOptions) as any
      )(req, res),
    handler: () => {}
  });

  server.route({
    url: "/saml2/:samlConfigId",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        samlConfigId: z.string().trim()
      })
    },
    preValidation: passport.authenticate(
      "saml",
      {
        session: false
      },
      async (req, res, err, user) => {
        if (err) {
          throw new BadRequestError({ message: `Saml authentication failed. ${err?.message}`, error: err });
        }
        req.passportUser = user as TProviderAuthCallback;
      }
    ) as any, // this is due to zod type difference
    handler: (req, res) => {
      const passportResult = req.passportUser;
      const cbPort = passportResult.callbackPort;

      if (passportResult.result === ProviderAuthResult.SESSION) {
        void res.setCookie("jid", passportResult.tokens.refresh, {
          httpOnly: true,
          path: "/api",
          sameSite: "strict",
          secure: appCfg.HTTPS_ENABLED
        });
        addAuthOriginDomainCookie(res);
        const sessionUrl = new URL("/login/select-organization", appCfg.SITE_URL);
        if (cbPort) sessionUrl.searchParams.set("callback_port", String(cbPort));
        return res.redirect(sessionUrl.toString());
      }

      if (passportResult.result === ProviderAuthResult.SIGNUP_REQUIRED) {
        const signupUrl = new URL("/signup/sso", appCfg.SITE_URL);
        signupUrl.searchParams.set("token", passportResult.signupToken);
        if (cbPort) signupUrl.searchParams.set("callback_port", String(cbPort));
        return res.redirect(signupUrl.toString());
      }

      throw new BadRequestError({ message: "Unexpected auth result" });
    }
  });

  server.route({
    method: "GET",
    url: "/config",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.SamlSso],
      description: "Get SAML config",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        organizationId: z.string().trim().describe(SamlSso.GET_CONFIG.organizationId)
      }),
      response: {
        200: z.object({
          id: z.string(),
          organization: z.string(),
          orgId: z.string(),
          authProvider: z.string(),
          isActive: z.boolean(),
          entryPoint: z.string(),
          issuer: z.string(),
          cert: z.string(),
          lastUsed: z.date().nullable().optional(),
          enableGroupSync: z.boolean().optional()
        })
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
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.SamlSso],
      description: "Create SAML config",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        organizationId: z.string().trim().describe(SamlSso.CREATE_CONFIG.organizationId),
        authProvider: z.nativeEnum(SamlProviders).describe(SamlSso.CREATE_CONFIG.authProvider),
        isActive: z.boolean().describe(SamlSso.CREATE_CONFIG.isActive),
        entryPoint: z.string().trim().describe(SamlSso.CREATE_CONFIG.entryPoint),
        issuer: z.string().trim().describe(SamlSso.CREATE_CONFIG.issuer),
        cert: z.string().trim().describe(SamlSso.CREATE_CONFIG.cert),
        enableGroupSync: z.boolean().optional().describe(SamlSso.CREATE_CONFIG.enableGroupSync)
      }),
      response: {
        200: SanitizedSamlConfigSchema
      }
    },
    handler: async (req) => {
      const { isActive, authProvider, issuer, entryPoint, cert, enableGroupSync } = req.body;
      const { permission } = req;

      const samlCfg = await server.services.saml.createSamlCfg({
        isActive,
        authProvider,
        issuer,
        entryPoint,
        idpCert: cert,
        enableGroupSync,
        actor: permission.type,
        actorId: permission.id,
        actorAuthMethod: permission.authMethod,
        actorOrgId: permission.orgId,
        orgId: req.body.organizationId
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.SSOConfigured,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            provider: authProvider,
            action: "create"
          }
        })
        .catch((err) => logger.error(err, "Failed to send SSOConfigured telemetry event"));

      return samlCfg;
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
      tags: [ApiDocsTags.SamlSso],
      description: "Update SAML config",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z
        .object({
          authProvider: z.nativeEnum(SamlProviders).describe(SamlSso.UPDATE_CONFIG.authProvider),
          isActive: z.boolean().describe(SamlSso.UPDATE_CONFIG.isActive),
          entryPoint: z.string().trim().describe(SamlSso.UPDATE_CONFIG.entryPoint),
          issuer: z.string().trim().describe(SamlSso.UPDATE_CONFIG.issuer),
          cert: z.string().trim().describe(SamlSso.UPDATE_CONFIG.cert),
          enableGroupSync: z.boolean().optional().describe(SamlSso.UPDATE_CONFIG.enableGroupSync)
        })
        .partial()
        .merge(z.object({ organizationId: z.string().trim().describe(SamlSso.UPDATE_CONFIG.organizationId) })),
      response: {
        200: SanitizedSamlConfigSchema
      }
    },
    handler: async (req) => {
      const { isActive, authProvider, issuer, entryPoint, cert, enableGroupSync } = req.body;
      const { permission } = req;

      const samlCfg = await server.services.saml.updateSamlCfg({
        isActive,
        authProvider,
        issuer,
        entryPoint,
        idpCert: cert,
        enableGroupSync,
        actor: permission.type,
        actorId: permission.id,
        actorAuthMethod: permission.authMethod,
        actorOrgId: permission.orgId,
        orgId: req.body.organizationId
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.SSOConfigured,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            provider: authProvider ?? "saml",
            action: "update"
          }
        })
        .catch((err) => logger.error(err, "Failed to send SSOConfigured telemetry event"));

      return samlCfg;
    }
  });
};
