import express from "express";
import passport from "passport";
import {
    getClientIdGitHubLogin,
    getClientSecretGitHubLogin,
} from "../../../config";
import { standardRequest } from "../../../config/request";
import { AuthMethod } from "../../../models";
import { INTEGRATION_GITHUB_API_URL } from "../../../variables";
import { handleSSOUserTokenFlow } from "./helpers";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GitHubStrategy = require("passport-github").Strategy;

export const initializeGitHubStrategy = async () => {
    const clientIdGitHubLogin = await getClientIdGitHubLogin();
    const clientSecretGitHubLogin = await getClientSecretGitHubLogin();
    if (clientIdGitHubLogin && clientSecretGitHubLogin) {
        passport.use(
            new GitHubStrategy({
                passReqToCallback: true,
                clientID: clientIdGitHubLogin,
                clientSecret: clientSecretGitHubLogin,
                callbackURL: "/api/v1/sso/github",
                scope: ["user:email"]
            }, async (req : express.Request, accessToken : any, refreshToken : any, profile : any, done : any) => {
                interface GitHubEmail {
                    email: string;
                    primary: boolean;
                    verified: boolean;
                    visibility: null | string;
                }
                
                const { data }: { data: GitHubEmail[] } = await standardRequest.get(
                    `${INTEGRATION_GITHUB_API_URL}/user/emails`,
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`
                        }
                    }
                );
                
                const primaryEmail = data.filter((gitHubEmail: GitHubEmail) => gitHubEmail.primary)[0];
                const email = primaryEmail.email;
                    
                const { isUserCompleted, providerAuthToken } = await handleSSOUserTokenFlow({
                    email,
                    firstName: profile.displayName,
                    lastName: "",
                    authMethod: AuthMethod.GITHUB,
                    callbackPort: req.query.state as string
                });

                req.isUserCompleted = isUserCompleted;
                req.providerAuthToken = providerAuthToken;
                return done(null, profile);
            })
        );
    }
}