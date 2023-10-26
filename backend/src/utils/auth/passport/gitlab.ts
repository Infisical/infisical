import express from "express";
import passport from "passport";
import {
    getClientIdGitLabLogin,
    getClientSecretGitLabLogin,
    getUrlGitLabLogin
} from "../../../config";
import { AuthMethod } from "../../../models";
import { handleSSOUserTokenFlow } from "./helpers";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GitLabStrategy = require("passport-gitlab2").Strategy;

export const initializeGitLabStrategy = async () => {
    const urlGitLab = await getUrlGitLabLogin();
    const clientIdGitLabLogin = await getClientIdGitLabLogin();
    const clientSecretGitLabLogin = await getClientSecretGitLabLogin();

    if (urlGitLab && clientIdGitLabLogin && clientSecretGitLabLogin) {
        passport.use(
            new GitLabStrategy({
                passReqToCallback: true,
                clientID: clientIdGitLabLogin,
                clientSecret: clientSecretGitLabLogin,
                callbackURL: "/api/v1/sso/gitlab",
                baseURL: urlGitLab
            }, async (req : express.Request, accessToken : any, refreshToken : any, profile : any, done : any) => {
                const email = profile.emails[0].value;

                const { isUserCompleted, providerAuthToken } = await handleSSOUserTokenFlow({
                    email,
                    firstName: profile.displayName,
                    lastName: "",
                    authMethod: AuthMethod.GITLAB,
                    callbackPort: req.query.state as string
                });

                req.isUserCompleted = isUserCompleted;
                req.providerAuthToken = providerAuthToken;
                return done(null, profile);
            })
        );
    }
}