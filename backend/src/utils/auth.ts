import express from "express";
import passport from "passport";
import { Types } from "mongoose";
import { AuthData } from "../interfaces/middleware";
import {
  AuthMethod,
  MembershipOrg,
  Organization,
  ServiceAccount,
  ServiceTokenData,
  ServiceTokenDataV3,
  User
} from "../models";
import { createToken } from "../helpers/auth";
import {
  getClientIdGitHubLogin,
  getClientIdGitLabLogin,
  getClientIdGoogleLogin,
  getClientSecretGitHubLogin,
  getClientSecretGitLabLogin,
  getClientSecretGoogleLogin,
  getJwtProviderAuthLifetime,
  getJwtProviderAuthSecret,
  getSiteURL,
  getUrlGitLabLogin
} from "../config";
import { getSSOConfigHelper } from "../ee/helpers/organizations";
import { InternalServerError, OrganizationNotFoundError } from "./errors";
import { ACCEPTED, INTEGRATION_GITHUB_API_URL, INVITED, MEMBER } from "../variables";
import { standardRequest } from "../config/request";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GoogleStrategy = require("passport-google-oauth20").Strategy;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GitHubStrategy = require("passport-github").Strategy;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GitLabStrategy = require("passport-gitlab2").Strategy;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MultiSamlStrategy } = require("@node-saml/passport-saml");

/**
 * Returns an object containing the id of the authentication data payload
 * @param {AuthData} authData - authentication data object
 * @returns 
 */
const getAuthDataPayloadIdObj = (authData: AuthData) => {
  if (authData.authPayload instanceof User) {
    return { userId: authData.authPayload._id };
  }

  if (authData.authPayload instanceof ServiceAccount) {
    return { serviceAccountId: authData.authPayload._id };
  }

  if (authData.authPayload instanceof ServiceTokenData) {
    return { serviceTokenDataId: authData.authPayload._id };
  }

  if (authData.authPayload instanceof ServiceTokenDataV3) {
    return { serviceTokenDataId: authData.authPayload._id };
  }
};

/**
 * Returns an object containing the user associated with the authentication data payload
 * @param {AuthData} authData - authentication data object
 * @returns 
 */
const getAuthDataPayloadUserObj = (authData: AuthData) => {
  if (authData.authPayload instanceof User) {
    return { user: authData.authPayload._id };
  }

  if (authData.authPayload instanceof ServiceAccount) {
    return { user: authData.authPayload.user };
  }

  if (authData.authPayload instanceof ServiceTokenData) {
    return { user: authData.authPayload.user };
  }
  
  if (authData.authPayload instanceof ServiceTokenDataV3) {
    return { user: authData.authPayload.user };
  }
}

const initializePassport = async () => {
  const clientIdGoogleLogin = await getClientIdGoogleLogin();
  const clientSecretGoogleLogin = await getClientSecretGoogleLogin();
  const clientIdGitHubLogin = await getClientIdGitHubLogin();
  const clientSecretGitHubLogin = await getClientSecretGitHubLogin();
  const urlGitLab = await getUrlGitLabLogin();
  const clientIdGitLabLogin = await getClientIdGitLabLogin();
  const clientSecretGitLabLogin = await getClientSecretGitLabLogin();

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
        
        let user = await User.findOne({
          email
        }).select("+publicKey");
        
        if (!user) {
          user = await new User({
            email,
            authMethods: [AuthMethod.GOOGLE],
            firstName: profile.name.givenName,
            lastName: profile.name.familyName
          }).save();
        }

        let isLinkingRequired = false;
        if (!user.authMethods.includes(AuthMethod.GOOGLE)) {
          isLinkingRequired = true;
        }

        const isUserCompleted = !!user.publicKey;
        const providerAuthToken = createToken({
          payload: {
            userId: user._id.toString(),
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            authMethod: AuthMethod.GOOGLE,
            isUserCompleted,
            isLinkingRequired,
            ...(req.query.state ? {
              callbackPort: req.query.state as string
            } : {})
          },
          expiresIn: await getJwtProviderAuthLifetime(),
          secret: await getJwtProviderAuthSecret(),
        });

        req.isUserCompleted = isUserCompleted;
        req.providerAuthToken = providerAuthToken;
        done(null, profile);
      } catch (err) {
        done(null, false);
      }
    }));
  }

  if (clientIdGitHubLogin && clientSecretGitHubLogin) {
    passport.use(new GitHubStrategy({
      passReqToCallback: true,
      clientID: clientIdGitHubLogin,
      clientSecret: clientSecretGitHubLogin,
      callbackURL: "/api/v1/sso/github",
      scope: ["user:email"]
    },
    async (req : express.Request, accessToken : any, refreshToken : any, profile : any, done : any) => {
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
      
      let user = await User.findOne({
        email
      }).select("+publicKey");

      if (!user) {
        user = await new User({
          email: email,
          authMethods: [AuthMethod.GITHUB],
          firstName: profile.displayName,
          lastName: ""
        }).save();
      }
      
      let isLinkingRequired = false;
      if (!user.authMethods.includes(AuthMethod.GITHUB)) {
        isLinkingRequired = true;
      }

      const isUserCompleted = !!user.publicKey;
      const providerAuthToken = createToken({
        payload: {
          userId: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          authMethod: AuthMethod.GITHUB,
          isUserCompleted,
          isLinkingRequired,
          ...(req.query.state ? {
            callbackPort: req.query.state as string
          } : {})
        },
        expiresIn: await getJwtProviderAuthLifetime(),
        secret: await getJwtProviderAuthSecret(),
      });

      req.isUserCompleted = isUserCompleted;
      req.providerAuthToken = providerAuthToken;
      return done(null, profile);
    }
    ));
  }

  if (urlGitLab && clientIdGitLabLogin && clientSecretGitLabLogin) {
    passport.use(new GitLabStrategy({
      passReqToCallback: true,
      clientID: clientIdGitLabLogin,
      clientSecret: clientSecretGitLabLogin,
      callbackURL: "/api/v1/sso/gitlab",
      baseURL: urlGitLab
    },
    async (req : express.Request, accessToken : any, refreshToken : any, profile : any, done : any) => {
      const email = profile.emails[0].value;
      
      let user = await User.findOne({
        email
      }).select("+publicKey");

      if (!user) {
        user = await new User({
          email: email,
          authMethods: [AuthMethod.GITLAB],
          firstName: profile.displayName,
          lastName: ""
        }).save();
      }
      
      let isLinkingRequired = false;
      if (!user.authMethods.includes(AuthMethod.GITLAB)) {
        isLinkingRequired = true;
      }

      const isUserCompleted = !!user.publicKey;
      const providerAuthToken = createToken({
        payload: {
          userId: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          authMethod: AuthMethod.GITLAB,
          isUserCompleted,
          isLinkingRequired,
          ...(req.query.state ? {
            callbackPort: req.query.state as string
          } : {})
        },
        expiresIn: await getJwtProviderAuthLifetime(),
        secret: await getJwtProviderAuthSecret(),
      });

      req.isUserCompleted = isUserCompleted;
      req.providerAuthToken = providerAuthToken;
      return done(null, profile);
    }
    ));
  }
  
  passport.use("saml", new MultiSamlStrategy(
    {
      passReqToCallback: true,
      getSamlOptions: async (req: any, done: any) => {
        const { ssoIdentifier } = req.params;
        
        const ssoConfig = await getSSOConfigHelper({
          ssoConfigId: new Types.ObjectId(ssoIdentifier)
        });
        
        interface ISAMLConfig {
          path: string;
          callbackURL: string;
          entryPoint: string;
          issuer: string;
          cert: string;
          audience: string;
          wantAuthnResponseSigned?: boolean;
        }
        
        const samlConfig: ISAMLConfig = ({
          path: `${await getSiteURL()}/api/v1/sso/saml2/${ssoIdentifier}`,
          callbackURL: `${await getSiteURL()}/api/v1/sso/saml2${ssoIdentifier}`,
          entryPoint: ssoConfig.entryPoint,
          issuer: ssoConfig.issuer,
          cert: ssoConfig.cert,
          audience: await getSiteURL()
        });
        
        if (ssoConfig.authProvider.toString() === AuthMethod.JUMPCLOUD_SAML.toString()) {
          samlConfig.wantAuthnResponseSigned = false;
        }
        
        req.ssoConfig = ssoConfig;
        
        done(null, samlConfig);
      },
    },
    async (req: any, profile: any, done: any) => {
      if (!req.ssoConfig.isActive) return done(InternalServerError());

      const organization = await Organization.findById(req.ssoConfig.organization);
      
      if (!organization) return done(OrganizationNotFoundError());

      const email = profile.email;
      const firstName = profile.firstName;
      const lastName = profile.lastName;

      let user = await User.findOne({
        email
      }).select("+publicKey");
      
      if (user) {
        // if user does not have SAML enabled then update 
        const hasSamlEnabled = user.authMethods
          .some(
            (authMethod: AuthMethod) => [
                AuthMethod.OKTA_SAML,
                AuthMethod.AZURE_SAML,
                AuthMethod.JUMPCLOUD_SAML
            ].includes(authMethod)
          );
        
        if (!hasSamlEnabled) {
          await User.findByIdAndUpdate(
            user._id, 
            {
              authMethods: [req.ssoConfig.authProvider]
            },
            {
              new: true
            }
          );
        }
        
        let membershipOrg = await MembershipOrg.findOne(
          {
            user: user._id,
            organization: organization._id
          }
        );
        
        if (!membershipOrg) {
          membershipOrg = await new MembershipOrg({
            inviteEmail: email,
            user: user._id,
            organization: organization._id,
            role: MEMBER,
            status: ACCEPTED
          }).save();
        }
        
        if (membershipOrg.status === INVITED) {
          membershipOrg.status = ACCEPTED;
          await membershipOrg.save();
        }
      } else {
        user = await new User({
          email,
          authMethods: [req.ssoConfig.authProvider],
          firstName,
          lastName
        }).save();
        
        await new MembershipOrg({
          inviteEmail: email,
          user: user._id,
          organization: organization._id,
          role: MEMBER,
          status: INVITED
        }).save();
      }
      
      const isUserCompleted = !!user.publicKey;
      const providerAuthToken = createToken({
        payload: {
          userId: user._id.toString(),
          email: user.email,
          firstName,
          lastName,
          organizationName: organization?.name,
          authMethod: req.ssoConfig.authProvider,
          isUserCompleted,
          ...(req.body.RelayState ? {
            callbackPort: req.body.RelayState as string
          } : {})
        },
        expiresIn: await getJwtProviderAuthLifetime(),
        secret: await getJwtProviderAuthSecret(),
      });
      
      req.isUserCompleted = isUserCompleted;
      req.providerAuthToken = providerAuthToken;

      done(null, profile);
    }
  ));
}

export {
  getAuthDataPayloadIdObj,
  getAuthDataPayloadUserObj,
  initializePassport,
}
