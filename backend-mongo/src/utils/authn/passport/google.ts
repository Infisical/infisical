import express from "express";
import passport from "passport";
import { getClientIdGoogleLogin, getClientSecretGoogleLogin } from "../../../config";
import { AuthMethod } from "../../../models";

import { handleSSOUserTokenFlow } from "./helpers";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GoogleStrategy = require("passport-google-oauth20").Strategy;

export const initializeGoogleStrategy = async () => {
    const clientIdGoogleLogin = await getClientIdGoogleLogin();
    const clientSecretGoogleLogin = await getClientSecretGoogleLogin();

    if (clientIdGoogleLogin && clientSecretGoogleLogin) {
        passport.use(new GoogleStrategy({
          passReqToCallback: true,
          clientID: clientIdGoogleLogin,
          clientSecret: clientSecretGoogleLogin,
          callbackURL: "/api/v1/sso/google",
          scope: ["profile", " email"],
        }, async (
          req: express.Request,
          accessToken: string,
          refreshToken: string,
          profile: any,
          done: any
        ) => {
          try {
            const email = profile.emails[0].value;
            
            const { isUserCompleted, providerAuthToken } = await handleSSOUserTokenFlow({
              email,
              firstName: profile.name.givenName,
              lastName: profile.name.familyName,
              authMethod: AuthMethod.GOOGLE,
              callbackPort: req.query.state as string
            });
    
            req.isUserCompleted = isUserCompleted;
            req.providerAuthToken = providerAuthToken;
            done(null, profile);
          } catch (err) {
            done(null, false);
          }
        }));
    }
}