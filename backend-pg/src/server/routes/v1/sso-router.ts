import { Authenticator } from "@fastify/passport";
import fastifySession from "@fastify/session";
import { Strategy as GitHubStrategy } from "passport-github";
import { Strategy as GitLabStrategy } from "passport-gitlab2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { fetchGithubEmails } from "@app/lib/requests/github";
import { AuthMethod } from "@app/services/auth/auth-type";

export const registerSsoRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();
  const passport = new Authenticator({ key: "sso", userProperty: "passportUser" });
  await server.register(fastifySession, { secret: appCfg.COOKIE_SECRET_SIGN_KEY });
  await server.register(passport.initialize());
  await server.register(passport.secureSession());
  // passport oauth strategy for Google
  const isGoogleOauthActive = Boolean(
    appCfg.CLIENT_ID_GOOGLE_LOGIN && appCfg.CLIENT_SECRET_GOOGLE_LOGIN
  );
  if (isGoogleOauthActive) {
    passport.use(
      new GoogleStrategy(
        {
          passReqToCallback: true,
          clientID: appCfg.CLIENT_ID_GOOGLE_LOGIN as string,
          clientSecret: appCfg.CLIENT_SECRET_GOOGLE_LOGIN as string,
          callbackURL: "/api/v1/sso/google",
          scope: ["profile", " email"]
        },
        async (req, _accessToken, _refreshToken, profile, cb) => {
          try {
            const email = profile?.emails?.[0]?.value;
            const serverCfg = server.services.superAdmin.getServerCfg();
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
              callbackPort: req.query.state as string,
              isSignupAllowed: Boolean(serverCfg.allowSignUp)
            });
            cb(null, { isUserCompleted, providerAuthToken });
          } catch (error) {
            cb(null, false);
          }
        }
      )
    );
  }

  // Passport strategy for Github
  const isGithubOauthActive = Boolean(
    appCfg.CLIENT_SECRET_GITHUB_LOGIN && appCfg.CLIENT_ID_GITLAB_LOGIN
  );
  if (isGithubOauthActive) {
    passport.use(
      new GitHubStrategy(
        {
          passReqToCallback: true,
          clientID: appCfg.CLIENT_ID_GITHUB_LOGIN as string,
          clientSecret: appCfg.CLIENT_SECRET_GITHUB_LOGIN as string,
          callbackURL: "/api/v1/sso/github",
          scope: ["user:email"]
        },
        async (req, accessToken, _refreshToken, profile, cb) => {
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
        }
      )
    );
  }

  // passport strategy for gitlab
  const isGitlabOauthActive = Boolean(
    appCfg.CLIENT_ID_GITLAB_LOGIN &&
      appCfg.CLIENT_SECRET_GITLAB_LOGIN &&
      appCfg.CLIENT_GITLAB_LOGIN_URL
  );
  if (isGitlabOauthActive) {
    passport.use(
      new GitLabStrategy(
        {
          passReqToCallback: true,
          clientID: appCfg.CLIENT_ID_GITLAB_LOGIN,
          clientSecret: appCfg.CLIENT_SECRET_GITLAB_LOGIN,
          callbackURL: "/api/v1/sso/gitlab",
          baseURL: appCfg.CLIENT_GITLAB_LOGIN_URL
        },
        async (req: any, _accessToken: string, _refreshToken: string, profile: any, cb: any) => {
          const email = profile.emails[0].value;
          const { isUserCompleted, providerAuthToken } = await server.services.login.oauth2Login({
            email,
            firstName: profile.displayName,
            lastName: "",
            authMethod: AuthMethod.GITLAB,
            callbackPort: req.query.state as string
          });
          console.log({ isUserCompleted, providerAuthToken });

          return cb(null, { isUserCompleted, providerAuthToken });
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
};
