/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// All the any rules are disabled because passport typesense with fastify is really poor

import { Authenticator } from "@fastify/passport";
import fastifySession from "@fastify/session";
// import { FastifyRequest } from "fastify";
import { Strategy as GitHubStrategy } from "passport-github";
import { Strategy as GitLabStrategy } from "passport-gitlab2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as OpenIDConnectStrategy } from "passport-openidconnect";
// const OpenIDConnectStrategy = require('passport-openidconnect');
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
            cb(null, false);
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
            cb(null, false);
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
            cb(null, false);
          }
        }
      )
    );
  }

  /**
   * TODO:
   * 1. Test w static config
   * 2. Fetch config from db
   */

  // const getOIDCConfiguration = (req: FastifyRequest, callback: any) => {
  //   // Fetching things from database or whatever
  //   const { username } = req.body as { username: string };

  //   process.nextTick(() => {
  //     const opts = {
  //       issuer: "",
  //       authorizationURL: "",
  //       tokenURL: "",
  //       userInfoURL: "",
  //       clientID: "",
  //       clientSecret: "",
  //       callbackURL: `${'test'}/api/sso/oidc`,
  //       // issuer: ISSUER_URL_OIDC_LOGIN,
  //       // authorizationURL: AUTHORIZATION_URL_OIDC_LOGIN,
  //       // tokenURL: TOKEN_URL_OIDC_LOGIN,
  //       // userInfoURL: USER_INFO_URL_OIDC_LOGIN,
  //       // clientID: CLIENT_ID_OIDC_LOGIN,
  //       // clientSecret: CLIENT_SECRET_OIDC_LOGIN,
  //       // callbackURL: `${SITE_URL}/api/sso/oidc`,
  //       scope: ['profile', 'email'],
  //       passReqToCallback: true
  //     }

  //     callback(null, opts);
  //   });
  // };

  const ISSUER_URL_OIDC_LOGIN = "https://oauth.id.jumpcloud.com/";
  const AUTHORIZATION_URL_OIDC_LOGIN = "https://oauth.id.jumpcloud.com/oauth2/auth";
  const TOKEN_URL_OIDC_LOGIN = "https://oauth.id.jumpcloud.com/oauth2/token";
  const USER_INFO_URL_OIDC_LOGIN = "https://oauth.id.jumpcloud.com/userinfo";
  const CLIENT_ID_OIDC_LOGIN = "";
  const CLIENT_SECRET_OIDC_LOGIN = "";
  const SITE_URL = "";

  const config = {
    issuer: ISSUER_URL_OIDC_LOGIN,
    authorizationURL: AUTHORIZATION_URL_OIDC_LOGIN,
    tokenURL: TOKEN_URL_OIDC_LOGIN,
    userInfoURL: USER_INFO_URL_OIDC_LOGIN,
    clientID: CLIENT_ID_OIDC_LOGIN,
    clientSecret: CLIENT_SECRET_OIDC_LOGIN,
    callbackURL: `${SITE_URL}/api/v1/sso/oidc`,
    scope: ["profile", "email"],
    passReqToCallback: true
  };

  if (config) {
    passport.use(
      new OpenIDConnectStrategy(config, (req: any, issuer: any, profile: any, done: any) => {
        try {
          console.log("oidc");
          console.log("oidc issuer: ", issuer);
          console.log("oidc profile: ", profile);
          // const { name: { familyName, givenName }, emails } = profile;
          done(null, profile);
        } catch (err) {
          console.log("oidc err: ", err);
          done(null, false);
        }
      })
    );
  }

  server.route({
    url: "/login/oidc",
    method: "GET",
    preValidation: (req, res) => {
      console.log("oidc login");
      return (
        passport.authenticate("openidconnect", {
          session: false,
          scope: ["profile", "email"]
        }) as any
      )(req, res);
    },
    handler: async (req, res) => {
      console.log("oidc login 2");
      if (req.passportUser) {
        return res.code(200).send({ message: "Authentication successful", user: req.passportUser });
      }
      return res.code(401).send({ error: "Authentication failed" });
    }
  });

  server.route({
    url: "/oidc",
    method: "GET",
    preValidation: (req, res) => {
      console.log("oidcx req: ", req); // code, state
      return (
        passport.authenticate("openidconnect", {
          session: false,
          failureRedirect: "/api/v1/sso/login/provider/error",
          failureMessage: true
        }) as any
      )(req, res);
    },
    handler: (req, res) => {
      console.log("oidc 3");
      if (req.passportUser.isUserCompleted) {
        // login
        return res.redirect(`${SITE_URL}/login/sso?token=${encodeURIComponent(req.passportUser.providerAuthToken)}`);
      }

      // signup
      return res.redirect(`${SITE_URL}/signup/sso?token=${encodeURIComponent(req.passportUser.providerAuthToken)}`);
    }
  });

  server.route({
    url: "/login/provider/error",
    method: "GET",
    handler: (req, res) => {
      console.log("reqyx: ", req);
      console.log("resyx: ", res);
      return res.status(500).send({
        error: "Authentication error",
        details: req.query
      });
    }
  });

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
};
