/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// All the any rules are disabled because passport typesense with fastify is really poor

import { Authenticator } from "@fastify/passport";
import fastifySession from "@fastify/session";
import { Strategy as GitHubStrategy } from "passport-github";
import { Strategy as GitLabStrategy } from "passport-gitlab2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { fetchGithubEmails } from "@app/lib/requests/github";
import { AuthMethod } from "@app/services/auth/auth-type";

export const registerSsoRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();
  const passport = new Authenticator({ key: "sso", userProperty: "passportUser" });
  await server.register(fastifySession, { secret: appCfg.COOKIE_SECRET_SIGN_KEY });
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
          scope: ["profile", " email"]
        },
        // eslint-disable-next-line
        async (req, _accessToken, _refreshToken, profile, cb) => {
          try {
            const email = profile?.emails?.[0]?.value;
            if (!email)
              throw new BadRequestError({
                message: "Email not found",
                name: "Oauth Google Register"
              });

            const { isUserCompleted, providerAuthToken } = await server.services.login.oauth2Login({
              email,
              firstName: profile?.name?.givenName || "",
              lastName: profile?.name?.familyName || "",
              authMethod: AuthMethod.GOOGLE,
              callbackPort: req.query.state as string
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
      new GitHubStrategy(
        {
          passReqToCallback: true,
          clientID: appCfg.CLIENT_ID_GITHUB_LOGIN as string,
          clientSecret: appCfg.CLIENT_SECRET_GITHUB_LOGIN as string,
          callbackURL: `${appCfg.SITE_URL}/api/v1/sso/github`,
          scope: ["user:email"]
        },
        // eslint-disable-next-line
        async (req, accessToken, _refreshToken, profile, cb) => {
          try {
            const ghEmails = await fetchGithubEmails(accessToken);
            const { email } = ghEmails.filter((gitHubEmail) => gitHubEmail.primary)[0];
            const { isUserCompleted, providerAuthToken } = await server.services.login.oauth2Login({
              email,
              firstName: profile.displayName,
              lastName: "",
              authMethod: AuthMethod.GITHUB,
              callbackPort: req.query.state as string
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
          baseURL: appCfg.CLIENT_GITLAB_LOGIN_URL
        },
        async (req: any, _accessToken: string, _refreshToken: string, profile: any, cb: any) => {
          try {
            const email = profile.emails[0].value;
            const { isUserCompleted, providerAuthToken } = await server.services.login.oauth2Login({
              email,
              firstName: profile.displayName,
              lastName: "",
              authMethod: AuthMethod.GITLAB,
              callbackPort: req.query.state as string
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
        callback_port: z.string().optional()
      })
    },
    preValidation: (req, res) =>
      (
        passport.authenticate("google", {
          scope: ["profile", "email"],
          session: false,
          state: req.query.callback_port,
          authInfo: false
          // this is due to zod type difference
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any
      )(req, res),
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
    url: "/redirect/github",
    method: "GET",
    schema: {
      querystring: z.object({
        callback_port: z.string().optional()
      })
    },
    preValidation: (req, res) =>
      (
        passport.authenticate("github", {
          session: false,
          state: req.query.callback_port,
          authInfo: false
          // this is due to zod type difference
        }) as any
      )(req, res),
    handler: () => {}
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
    url: "/redirect/gitlab",
    method: "GET",
    schema: {
      querystring: z.object({
        callback_port: z.string().optional()
      })
    },
    preValidation: (req, res) =>
      (
        passport.authenticate("gitlab", {
          session: false,
          state: req.query.callback_port,
          authInfo: false
          // this is due to zod type difference
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any
      )(req, res),
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

      if (data.isMfaEnabled) {
        return { mfaEnabled: true, token: data.token } as const; // for discriminated union
      }

      void res.setCookie("jid", data.token.refresh, {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });

      return {
        mfaEnabled: false,
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
