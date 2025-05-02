/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// All the any rules are disabled because passport typesense with fastify is really poor

import { Authenticator } from "@fastify/passport";
import fastifySession from "@fastify/session";
import RedisStore from "connect-redis";
import { Strategy as GitLabStrategy } from "passport-gitlab2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as OAuth2Strategy } from "passport-oauth2";
import { z } from "zod";

import { INFISICAL_PROVIDER_GITHUB_ACCESS_TOKEN } from "@app/lib/config/const";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { fetchGithubEmails, fetchGithubUser } from "@app/lib/requests/github";
import { authRateLimit } from "@app/server/config/rateLimiter";
import { AuthMethod } from "@app/services/auth/auth-type";
import { OrgAuthMethod } from "@app/services/org/org-types";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";

export const registerSsoRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();

  const passport = new Authenticator({ key: "sso", userProperty: "passportUser" });
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
          try {
            // @ts-expect-error this is because this is express type and not fastify
            const callbackPort = req.session.get("callbackPort");

            const email = profile?.emails?.[0]?.value;
            if (!email)
              throw new NotFoundError({
                message: "Email not found",
                name: "OauthGoogleRegister"
              });

            const { isUserCompleted, providerAuthToken } = await server.services.login.oauth2Login({
              email,
              firstName: profile?.name?.givenName || "",
              lastName: profile?.name?.familyName || "",
              authMethod: AuthMethod.GOOGLE,
              callbackPort
            });
            cb(null, { isUserCompleted, providerAuthToken });
          } catch (error) {
            logger.error(error);
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
          try {
            const ghEmails = await fetchGithubEmails(accessToken);
            const { email } = ghEmails.filter((gitHubEmail) => gitHubEmail.primary)[0];

            if (!email) throw new Error("No primary email found");

            // profile does not get automatically populated so we need to manually fetch user info
            const user = await fetchGithubUser(accessToken);

            const callbackPort = req.session.get("callbackPort");

            const { isUserCompleted, providerAuthToken } = await server.services.login.oauth2Login({
              email,
              firstName: user.name || user.login,
              lastName: "",
              authMethod: AuthMethod.GITHUB,
              callbackPort
            });

            done(null, { isUserCompleted, providerAuthToken, externalProviderAccessToken: accessToken });
          } catch (err) {
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
          try {
            const callbackPort = req.session.get("callbackPort");

            const email = profile.emails[0].value;
            const { isUserCompleted, providerAuthToken } = await server.services.login.oauth2Login({
              email,
              firstName: profile.displayName || profile.username || "",
              lastName: "",
              authMethod: AuthMethod.GITLAB,
              callbackPort
            });

            return cb(null, { isUserCompleted, providerAuthToken });
          } catch (error) {
            logger.error(error);
            cb(error as Error, false);
          }
        }
      )
    );
  }

  server.route({
    url: "/redirect/google",
    method: "GET",
    schema: {
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
        const { callback_port: callbackPort, is_admin_login: isAdminLogin } = req.query;
        // ensure fresh session state per login attempt
        await req.session.regenerate();
        if (callbackPort) {
          req.session.set("callbackPort", callbackPort);
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

  server.route({
    url: "/google",
    method: "GET",
    preValidation: passport.authenticate("google", {
      session: false,
      failureRedirect: "/login/provider/error",
      authInfo: false
      // this is due to zod type difference
    }) as never,
    handler: async (req, res) => {
      const isAdminLogin = req.session.get("isAdminLogin");
      await req.session.destroy();
      if (req.passportUser.isUserCompleted) {
        return res.redirect(
          `${appCfg.SITE_URL}/login/sso?token=${encodeURIComponent(req.passportUser.providerAuthToken)}${
            isAdminLogin ? `&isAdminLogin=${isAdminLogin}` : ""
          }`
        );
      }
      return res.redirect(
        `${appCfg.SITE_URL}/signup/sso?token=${encodeURIComponent(req.passportUser.providerAuthToken)}`
      );
    }
  });

  server.route({
    url: "/redirect/github",
    method: "GET",
    schema: {
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
        const { callback_port: callbackPort, is_admin_login: isAdminLogin } = req.query;
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
    handler: async (req, res) => {
      const isAdminLogin = req.session.get("isAdminLogin");
      await req.session.destroy();

      if (req.passportUser.externalProviderAccessToken) {
        void res.cookie(INFISICAL_PROVIDER_GITHUB_ACCESS_TOKEN, req.passportUser.externalProviderAccessToken, {
          httpOnly: true,
          path: "/",
          sameSite: "strict",
          secure: appCfg.HTTPS_ENABLED,
          expires: new Date(Date.now() + ms(appCfg.JWT_PROVIDER_AUTH_LIFETIME))
        });
      }

      if (req.passportUser.isUserCompleted) {
        return res.redirect(
          `${appCfg.SITE_URL}/login/sso?token=${encodeURIComponent(req.passportUser.providerAuthToken)}${
            isAdminLogin ? `&isAdminLogin=${isAdminLogin}` : ""
          }`
        );
      }

      const serverCfg = await getServerCfg();
      return res.redirect(
        `${appCfg.SITE_URL}/signup/sso?token=${encodeURIComponent(req.passportUser.providerAuthToken)}${
          serverCfg.defaultAuthOrgId && !appCfg.isCloud ? `&defaultOrgAllowed=true` : ""
        }`
      );
    }
  });

  server.route({
    url: "/redirect/gitlab",
    method: "GET",
    schema: {
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
        const { callback_port: callbackPort, is_admin_login: isAdminLogin } = req.query;
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
    handler: async (req, res) => {
      const isAdminLogin = req.session.get("isAdminLogin");
      await req.session.destroy();
      if (req.passportUser.isUserCompleted) {
        return res.redirect(
          `${appCfg.SITE_URL}/login/sso?token=${encodeURIComponent(req.passportUser.providerAuthToken)}${
            isAdminLogin ? `&isAdminLogin=${isAdminLogin}` : ""
          }`
        );
      }
      return res.redirect(
        `${appCfg.SITE_URL}/signup/sso?token=${encodeURIComponent(req.passportUser.providerAuthToken)}`
      );
    }
  });

  server.route({
    url: "/token-exchange",
    method: "POST",
    schema: {
      body: z.object({
        providerAuthToken: z.string(),
        email: z.string()
      })
    },
    handler: async (req, res) => {
      const userAgent = req.headers["user-agent"];
      if (!userAgent) throw new Error("user agent header is required");

      const data = await server.services.login.oauth2TokenExchange({
        email: req.body.email,
        ip: req.realIp,
        userAgent,
        providerAuthToken: req.body.providerAuthToken
      });

      void res.setCookie("jid", data.token.refresh, {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });

      return {
        encryptionVersion: data.user.encryptionVersion,
        token: data.token.access,
        publicKey: data.user.publicKey,
        encryptedPrivateKey: data.user.encryptedPrivateKey,
        iv: data.user.iv,
        tag: data.user.tag,
        protectedKey: data.user.protectedKey || null,
        protectedKeyIV: data.user.protectedKeyIV || null,
        protectedKeyTag: data.user.protectedKeyTag || null
      } as const;
    }
  });
};
