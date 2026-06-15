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
import RedisStore from "connect-redis";
import { CronJob } from "cron";
import { Strategy as GitLabStrategy } from "passport-gitlab2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as OAuth2Strategy } from "passport-oauth2";
import { z } from "zod";

import { INFISICAL_PROVIDER_GITHUB_ACCESS_TOKEN } from "@app/lib/config/const";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { fetchGithubEmails, fetchGithubUser, selectGithubLoginEmail } from "@app/lib/requests/github";
import {
  AuthAttemptAuthMethod,
  AuthAttemptAuthResult,
  authAttemptCounter,
  recordAuthAttemptMetric
} from "@app/lib/telemetry/metrics";
import { authRateLimit } from "@app/server/config/rateLimiter";
import { addAuthOriginDomainCookie } from "@app/server/lib/cookie";
import { AuthMethod, ProviderAuthResult } from "@app/services/auth/auth-type";
import { OrgAuthMethod } from "@app/services/org/org-types";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const passport = new Authenticator({ key: "sso", userProperty: "passportUser" });

let serverInstance: FastifyZodProvider | null = null;

export const registerOauthMiddlewares = (server: FastifyZodProvider) => {
  serverInstance = server;
  const appCfg = getConfig();

  // passport oauth strategy for Google
  const isGoogleOauthActive = Boolean(appCfg.CLIENT_ID_GOOGLE_LOGIN && appCfg.CLIENT_SECRET_GOOGLE_LOGIN);
  if (isGoogleOauthActive) {
    passport.use(
      new GoogleStrategy(
        {
          passReqToCallback: true,
          clientID: appCfg.CLIENT_ID_GOOGLE_LOGIN as string,
          clientSecret: appCfg.CLIENT_SECRET_GOOGLE_LOGIN as string,
          callbackURL: `${appCfg.SITE_URL}/api/v1/sso/google`,
          scope: ["profile", "email"],
          state: true,
          pkce: true
        },
        // eslint-disable-next-line
        async (req, _accessToken, _refreshToken, profile, cb) => {
          const authMetricStartTime = performance.now();
          // @ts-expect-error this is because this is express type and not fastify
          const callbackPort = req.session.get("callbackPort");
          // @ts-expect-error this is because this is express type and not fastify
          const orgSlug = req.session.get("orgSlug");

          const email = profile?.emails?.[0]?.value;
          if (!email)
            throw new NotFoundError({
              message: "Email not found",
              name: "OauthGoogleRegister"
            });

          // Google maps its email_verified claim onto emails[0].verified (a string "true"/"false"
          // per the userinfo response, occasionally a boolean); when verified we skip our own
          // email verification.
          const isEmailVerifiedByProvider = String(profile?.emails?.[0]?.verified) === "true";

          try {
            const loginResult = await server.services.login.oauth2Login({
              email,
              firstName: profile?.name?.givenName || "",
              lastName: profile?.name?.familyName || "",
              authMethod: AuthMethod.GOOGLE,
              callbackPort,
              orgSlug,
              providerUserId: profile.id,
              isEmailVerifiedByProvider,
              ip: requestContext.get("ip") || "",
              userAgent: requestContext.get("userAgent") || ""
            });

            const googleDistinctId = loginResult.user.username ?? loginResult.user.email ?? "";
            if (googleDistinctId) {
              void server.services.telemetry.identifyUser(
                googleDistinctId,
                {
                  email: loginResult.user.email ?? undefined,
                  username: loginResult.user.username,
                  userId: loginResult.user.id,
                  firstName: loginResult.user.firstName ?? undefined,
                  lastName: loginResult.user.lastName ?? undefined
                },
                { skipDedup: true }
              );
            }

            cb(null, loginResult);

            if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
              authAttemptCounter.add(1, {
                "infisical.user.email": email,
                "infisical.user.id": loginResult.user.id,
                "infisical.organization.id": loginResult.orgId,
                "infisical.organization.name": loginResult.orgName,
                "infisical.auth.method": AuthAttemptAuthMethod.GOOGLE,
                "infisical.auth.result": AuthAttemptAuthResult.SUCCESS,
                "client.address": requestContext.get(RequestContextKey.Ip),
                "user_agent.original": requestContext.get(RequestContextKey.UserAgent)
              });
            }

            recordAuthAttemptMetric({
              startTime: authMetricStartTime,
              method: AuthAttemptAuthMethod.GOOGLE,
              result: AuthAttemptAuthResult.SUCCESS,
              orgId: loginResult.orgId
            });
          } catch (error) {
            logger.error(error);
            if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
              authAttemptCounter.add(1, {
                "infisical.user.email": email,
                "infisical.auth.method": AuthAttemptAuthMethod.GOOGLE,
                "infisical.auth.result": AuthAttemptAuthResult.FAILURE,
                "client.address": requestContext.get(RequestContextKey.Ip),
                "user_agent.original": requestContext.get(RequestContextKey.UserAgent)
              });
            }
            recordAuthAttemptMetric({
              startTime: authMetricStartTime,
              method: AuthAttemptAuthMethod.GOOGLE,
              result: AuthAttemptAuthResult.FAILURE,
              error
            });
            cb(error as Error, false);
          }
        }
      )
    );
  }

  // Passport strategy for Github
  const isGithubOauthActive = Boolean(appCfg.CLIENT_SECRET_GITHUB_LOGIN && appCfg.CLIENT_ID_GITHUB_LOGIN);
  if (isGithubOauthActive) {
    passport.use(
      "github",
      new OAuth2Strategy(
        {
          authorizationURL: "https://github.com/login/oauth/authorize",
          tokenURL: "https://github.com/login/oauth/access_token",
          clientID: appCfg.CLIENT_ID_GITHUB_LOGIN!,
          clientSecret: appCfg.CLIENT_SECRET_GITHUB_LOGIN!,
          callbackURL: `${appCfg.SITE_URL}/api/v1/sso/github`,
          scope: ["user:email", "read:org"],
          state: true,
          pkce: true,
          passReqToCallback: true
        },
        // eslint-disable-next-line
        async (req: any, accessToken: string, _refreshToken: string, _profile: any, done: Function) => {
          const authMetricStartTime = performance.now();
          const ghEmails = await fetchGithubEmails(accessToken);
          const selectedEmail = selectGithubLoginEmail(ghEmails);
          if (!selectedEmail) throw new Error("No email found for GitHub account");
          const { email, isEmailVerifiedByProvider } = selectedEmail;

          try {
            // profile does not get automatically populated so we need to manually fetch user info
            const githubUser = await fetchGithubUser(accessToken);

            const callbackPort = req.session.get("callbackPort");

            const loginResult = await server.services.login.oauth2Login({
              email,
              firstName: githubUser.name || githubUser.login,
              lastName: "",
              authMethod: AuthMethod.GITHUB,
              callbackPort,
              providerUserId: String(githubUser.id),
              isEmailVerifiedByProvider,
              ip: requestContext.get("ip") || "",
              userAgent: requestContext.get("userAgent") || ""
            });

            const githubDistinctId = loginResult.user.username ?? loginResult.user.email ?? "";
            if (githubDistinctId) {
              void server.services.telemetry.identifyUser(
                githubDistinctId,
                {
                  email: loginResult.user.email ?? undefined,
                  username: loginResult.user.username,
                  userId: loginResult.user.id,
                  firstName: loginResult.user.firstName ?? undefined,
                  lastName: loginResult.user.lastName ?? undefined
                },
                { skipDedup: true }
              );
            }

            done(null, { ...loginResult, externalProviderAccessToken: accessToken });

            if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
              authAttemptCounter.add(1, {
                "infisical.user.email": email,
                "infisical.user.id": loginResult.user.id,
                "infisical.organization.id": loginResult.orgId,
                "infisical.organization.name": loginResult.orgName,
                "infisical.auth.method": AuthAttemptAuthMethod.GITHUB,
                "infisical.auth.result": AuthAttemptAuthResult.SUCCESS,
                "client.address": requestContext.get(RequestContextKey.Ip),
                "user_agent.original": requestContext.get(RequestContextKey.UserAgent)
              });
            }

            recordAuthAttemptMetric({
              startTime: authMetricStartTime,
              method: AuthAttemptAuthMethod.GITHUB,
              result: AuthAttemptAuthResult.SUCCESS,
              orgId: loginResult.orgId
            });
          } catch (err) {
            if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
              authAttemptCounter.add(1, {
                "infisical.user.email": email,
                "infisical.auth.method": AuthAttemptAuthMethod.GITHUB,
                "infisical.auth.result": AuthAttemptAuthResult.FAILURE,
                "client.address": requestContext.get(RequestContextKey.Ip),
                "user_agent.original": requestContext.get(RequestContextKey.UserAgent)
              });
            }
            recordAuthAttemptMetric({
              startTime: authMetricStartTime,
              method: AuthAttemptAuthMethod.GITHUB,
              result: AuthAttemptAuthResult.FAILURE,
              error: err
            });
            logger.error(err);
            done(err as Error, false);
          }
        }
      )
    );
  }

  // passport strategy for gitlab
  const isGitlabOauthActive = Boolean(
    appCfg.CLIENT_ID_GITLAB_LOGIN && appCfg.CLIENT_SECRET_GITLAB_LOGIN && appCfg.CLIENT_GITLAB_LOGIN_URL
  );
  if (isGitlabOauthActive) {
    passport.use(
      new GitLabStrategy(
        {
          passReqToCallback: true,
          clientID: appCfg.CLIENT_ID_GITLAB_LOGIN,
          clientSecret: appCfg.CLIENT_SECRET_GITLAB_LOGIN,
          callbackURL: `${appCfg.SITE_URL}/api/v1/sso/gitlab`,
          baseURL: appCfg.CLIENT_GITLAB_LOGIN_URL,
          state: true,
          pkce: true
        },
        async (req: any, _accessToken: string, _refreshToken: string, profile: any, cb: any) => {
          const authMetricStartTime = performance.now();
          const email = profile.emails[0].value;
          // GitLab's /user API exposes confirmed_at as a non-empty ISO timestamp when the email is
          // confirmed, or null otherwise (it is not a boolean). Treat a present, non-empty string as
          // verified rather than coercing with Boolean(), so no non-string truthy value can slip in.
          // eslint-disable-next-line no-underscore-dangle
          const confirmedAt = profile?._json?.confirmed_at as unknown;
          const isEmailVerifiedByProvider = typeof confirmedAt === "string" && confirmedAt.length > 0;

          try {
            const callbackPort = req.session.get("callbackPort");

            const loginResult = await server.services.login.oauth2Login({
              email,
              firstName: profile.displayName || profile.username || "",
              lastName: "",
              authMethod: AuthMethod.GITLAB,
              callbackPort,
              providerUserId: String(profile.id),
              isEmailVerifiedByProvider,
              ip: requestContext.get("ip") || "",
              userAgent: requestContext.get("userAgent") || ""
            });

            const gitlabDistinctId = loginResult.user.username ?? loginResult.user.email ?? "";
            if (gitlabDistinctId) {
              void server.services.telemetry.identifyUser(
                gitlabDistinctId,
                {
                  email: loginResult.user.email ?? undefined,
                  username: loginResult.user.username,
                  userId: loginResult.user.id,
                  firstName: loginResult.user.firstName ?? undefined,
                  lastName: loginResult.user.lastName ?? undefined
                },
                { skipDedup: true }
              );
            }

            cb(null, loginResult);

            if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
              authAttemptCounter.add(1, {
                "infisical.user.email": email,
                "infisical.user.id": loginResult.user.id,
                "infisical.organization.id": loginResult.orgId,
                "infisical.organization.name": loginResult.orgName,
                "infisical.auth.method": AuthAttemptAuthMethod.GITLAB,
                "infisical.auth.result": AuthAttemptAuthResult.SUCCESS,
                "client.address": requestContext.get(RequestContextKey.Ip),
                "user_agent.original": requestContext.get(RequestContextKey.UserAgent)
              });
            }

            recordAuthAttemptMetric({
              startTime: authMetricStartTime,
              method: AuthAttemptAuthMethod.GITLAB,
              result: AuthAttemptAuthResult.SUCCESS,
              orgId: loginResult.orgId
            });
          } catch (error) {
            if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
              authAttemptCounter.add(1, {
                "infisical.user.email": email,
                "infisical.auth.method": AuthAttemptAuthMethod.GITLAB,
                "infisical.auth.result": AuthAttemptAuthResult.FAILURE,
                "client.address": requestContext.get(RequestContextKey.Ip),
                "user_agent.original": requestContext.get(RequestContextKey.UserAgent)
              });
            }

            recordAuthAttemptMetric({
              startTime: authMetricStartTime,
              method: AuthAttemptAuthMethod.GITLAB,
              result: AuthAttemptAuthResult.FAILURE,
              error
            });

            logger.error(error);
            cb(error as Error, false);
          }
        }
      )
    );
  }
};

export const refreshOauthConfig = () => {
  if (!serverInstance) {
    logger.warn("Cannot refresh OAuth config: server instance not available");
    return;
  }

  logger.info("Refreshing OAuth configuration...");
  registerOauthMiddlewares(serverInstance);
};

export const initializeOauthConfigSync = async () => {
  logger.info("Setting up background sync process for oauth configuration");

  // sync every 5 minutes
  const job = new CronJob("*/5 * * * *", refreshOauthConfig);
  job.start();

  return job;
};

export const registerSsoRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();

  const redisStore = new RedisStore({
    client: server.redis,
    prefix: "oauth-session:",
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

  registerOauthMiddlewares(server);

  server.route({
    url: "/redirect/google",
    method: "GET",
    schema: {
      operationId: "redirectGoogleSSO",
      querystring: z.object({
        callback_port: z.string().optional(),
        org_slug: z.string().optional(),
        is_admin_login: z
          .string()
          .optional()
          .transform((val) => val === "true")
      })
    },
    preValidation: [
      async (req, res) => {
        const {
          callback_port: callbackPort,
          is_admin_login: isAdminLogin,
          org_slug: orgSlug
        } = req.query as {
          callback_port?: string;
          is_admin_login?: boolean;
          org_slug?: string;
        };
        // ensure fresh session state per login attempt
        await req.session.regenerate();
        if (callbackPort) {
          req.session.set("callbackPort", callbackPort);
        }
        if (orgSlug) {
          req.session.set("orgSlug", orgSlug);
        }
        if (isAdminLogin) {
          req.session.set("isAdminLogin", isAdminLogin);
        }
        return (
          passport.authenticate("google", {
            scope: ["profile", "email"],
            authInfo: false
            // this is due to zod type difference
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any
        )(req, res);
      }
    ],
    handler: () => {}
  });

  // Shared redirect logic for all OAuth provider callbacks
  const handleOAuthCallbackRedirect = async (req: any, res: any) => {
    const isAdminLogin = req.session.get("isAdminLogin");
    await req.session.destroy();
    const passportResult = req.passportUser;
    const cbPort = passportResult.callbackPort;

    if (passportResult.result === ProviderAuthResult.SESSION) {
      // This login completed the user's signup (provider-verified email), so it never goes
      // through complete-account; fire the signup telemetry that route would have sent.
      if (passportResult.didCompleteSignup) {
        const { user } = passportResult;
        // An invited user completing signup via a provider-verified email is tagged as an invite for
        // parity with the complete-account route that this provider-verified flow bypasses.
        const signupMethod = passportResult.wasInvited ? "invite" : passportResult.authMethod;
        if (user.email) {
          void server.services.telemetry.sendLoopsEvent(user.email, user.firstName || "", user.lastName || "");
          void server.services.telemetry.sendHubSpotSignupEvent(
            user.email,
            signupMethod,
            user.firstName || "",
            user.lastName || "",
            typeof req.cookies?.hubspotutk === "string" ? req.cookies.hubspotutk.slice(0, 512) : undefined
          );
        }
        void server.services.telemetry.sendPostHogEvents({
          event: PostHogEventTypes.UserSignedUp,
          distinctId: user.username ?? "",
          ...(passportResult.orgId ? { organizationId: passportResult.orgId } : {}),
          properties: {
            username: user.username,
            email: user.email ?? "",
            ...(passportResult.wasInvited ? { attributionSource: "Team Invite" } : {}),
            signupMethod
          }
        });
      }

      void res.setCookie("jid", passportResult.tokens.refresh, {
        httpOnly: true,
        path: "/api",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });
      addAuthOriginDomainCookie(res);
      const sessionUrl = new URL("/login/select-organization", appCfg.SITE_URL);
      if (isAdminLogin) sessionUrl.searchParams.set("isAdminLogin", isAdminLogin);
      if (cbPort) sessionUrl.searchParams.set("callback_port", String(cbPort));
      // Provider-verified signups never render the signup page that pushes the GTM conversion event,
      // so flag the org-selection page to fire it on arrival.
      if (passportResult.didCompleteSignup) sessionUrl.searchParams.set("signup_completed", "true");
      return res.redirect(sessionUrl.toString());
    }

    if (passportResult.result === ProviderAuthResult.SIGNUP_REQUIRED) {
      const serverCfg = await getServerCfg();
      const signupUrl = new URL("/signup/sso", appCfg.SITE_URL);
      signupUrl.searchParams.set("token", passportResult.signupToken);
      if (serverCfg.defaultAuthOrgId && !appCfg.isCloud) signupUrl.searchParams.set("defaultOrgAllowed", "true");
      if (cbPort) signupUrl.searchParams.set("callback_port", String(cbPort));
      return res.redirect(signupUrl.toString());
    }

    throw new BadRequestError({ message: "Unexpected auth result" });
  };

  server.route({
    url: "/google",
    method: "GET",
    preValidation: passport.authenticate("google", {
      session: false,
      failureRedirect: "/login/provider/error",
      authInfo: false
      // this is due to zod type difference
    }) as never,
    handler: handleOAuthCallbackRedirect
  });

  server.route({
    url: "/redirect/github",
    method: "GET",
    schema: {
      operationId: "redirectGitHubSSO",
      querystring: z.object({
        callback_port: z.string().optional(),
        is_admin_login: z
          .string()
          .optional()
          .transform((val) => val === "true")
      })
    },
    preValidation: [
      async (req, res) => {
        const { callback_port: callbackPort, is_admin_login: isAdminLogin } = req.query as {
          callback_port?: string;
          is_admin_login?: boolean;
        };
        // ensure fresh session state per login attempt
        await req.session.regenerate();
        if (callbackPort) {
          req.session.set("callbackPort", callbackPort);
        }

        if (isAdminLogin) {
          req.session.set("isAdminLogin", isAdminLogin);
        }

        return (
          passport.authenticate("github", {
            session: false,
            authInfo: false
            // this is due to zod type difference
          }) as any
        )(req, res);
      }
    ],
    handler: () => {}
  });

  server.route({
    url: "/redirect/organizations/:orgSlug",
    method: "GET",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      operationId: "redirectOrgSSO",
      params: z.object({
        orgSlug: z.string().trim()
      }),
      querystring: z.object({
        callback_port: z.string().optional()
      })
    },
    handler: async (req, res) => {
      const org = await server.services.org.findOrgBySlug(req.params.orgSlug);
      if (org.orgAuthMethod === OrgAuthMethod.SAML) {
        return res.redirect(
          `${appCfg.SITE_URL}/api/v1/sso/redirect/saml2/organizations/${org.slug}?${
            req.query.callback_port ? `callback_port=${req.query.callback_port}` : ""
          }`
        );
      }

      if (org.orgAuthMethod === OrgAuthMethod.OIDC) {
        return res.redirect(
          `${appCfg.SITE_URL}/api/v1/sso/oidc/login?orgSlug=${org.slug}${
            req.query.callback_port ? `&callbackPort=${req.query.callback_port}` : ""
          }`
        );
      }

      throw new BadRequestError({
        message: "The organization does not have any SSO configured."
      });
    }
  });

  server.route({
    url: "/github",
    method: "GET",
    preValidation: passport.authenticate("github", {
      session: false,
      failureRedirect: "/login/provider/error",
      authInfo: false
      // this is due to zod type difference
    }) as any,
    handler: async (req: any, res: any) => {
      if (req.passportUser.externalProviderAccessToken) {
        void res.cookie(INFISICAL_PROVIDER_GITHUB_ACCESS_TOKEN, req.passportUser.externalProviderAccessToken, {
          httpOnly: true,
          path: "/api",
          sameSite: "strict",
          secure: appCfg.HTTPS_ENABLED,
          expires: new Date(Date.now() + ms(appCfg.JWT_PROVIDER_AUTH_LIFETIME))
        });
      }
      return handleOAuthCallbackRedirect(req, res);
    }
  });

  server.route({
    url: "/redirect/gitlab",
    method: "GET",
    schema: {
      operationId: "redirectGitLabSSO",
      querystring: z.object({
        callback_port: z.string().optional(),
        is_admin_login: z
          .string()
          .optional()
          .transform((val) => val === "true")
      })
    },
    preValidation: [
      async (req, res) => {
        const { callback_port: callbackPort, is_admin_login: isAdminLogin } = req.query as {
          callback_port?: string;
          is_admin_login?: boolean;
        };
        // ensure fresh session state per login attempt
        await req.session.regenerate();
        if (callbackPort) {
          req.session.set("callbackPort", callbackPort);
        }

        if (isAdminLogin) {
          req.session.set("isAdminLogin", isAdminLogin);
        }

        return (
          passport.authenticate("gitlab", {
            session: false,
            authInfo: false
            // this is due to zod type difference
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any
        )(req, res);
      }
    ],
    handler: () => {}
  });

  server.route({
    url: "/gitlab",
    method: "GET",
    preValidation: passport.authenticate("gitlab", {
      session: false,
      failureRedirect: "/login/provider/error",
      authInfo: false
      // this is due to zod type difference
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
    handler: handleOAuthCallbackRedirect
  });

  // Deprecated: token-exchange is no longer needed — sessions are issued directly from callbacks.
  // Kept for backward compatibility with old clients.
  server.route({
    url: "/token-exchange",
    method: "POST",
    schema: {
      operationId: "exchangeOAuthToken",
      body: z.object({
        providerAuthToken: z.string(),
        email: z.string()
      })
    },
    handler: async () => {
      throw new BadRequestError({
        message: "Token exchange is no longer supported. Please update your client."
      });
    }
  });
};
