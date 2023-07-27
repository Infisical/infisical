import express from "express";
import passport from "passport";
import { Types } from "mongoose";
import { AuthData } from "../interfaces/middleware";
import {
  AuthProvider,
  MembershipOrg,
  Organization,
  ServiceAccount,
  ServiceTokenData,
  User
} from "../models";
import { createToken } from "../helpers/auth";
import {
  getClientIdGoogle,
  getClientSecretGoogle,
  getJwtProviderAuthLifetime,
  getJwtProviderAuthSecret,
} from "../config";
import { getSSOConfigHelper } from "../ee/helpers/organizations";
import { InternalServerError, OrganizationNotFoundError } from "./errors";
import { INVITED, MEMBER } from "../variables";
import { getSiteURL } from "../config";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GoogleStrategy = require("passport-google-oauth20").Strategy;
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
    return { user: authData.authPayload.user };0
  }
}

const initializePassport = async () => {
  const googleClientSecret = await getClientSecretGoogle();
  const googleClientId = await getClientIdGoogle();

  passport.use(new GoogleStrategy({
    passReqToCallback: true,
    clientID: googleClientId,
    clientSecret: googleClientSecret,
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
      const firstName = profile.name.givenName;
      const lastName = profile.name.familyName;
      
      let user = await User.findOne({
        email
      }).select("+publicKey");
      
      if (user && user.authProvider !== AuthProvider.GOOGLE) {
        done(InternalServerError());
      }

      if (!user) {
        user = await new User({
          email,
          authProvider: AuthProvider.GOOGLE,
          authId: profile.id,
          firstName,
          lastName
        }).save();
      }

      const isUserCompleted = !!user.publicKey;
      const providerAuthToken = createToken({
        payload: {
          userId: user._id.toString(),
          email: user.email,
          firstName,
          lastName,
          authProvider: user.authProvider,
          isUserCompleted,
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
  
  passport.use("saml", new MultiSamlStrategy(
    {
      passReqToCallback: true,
      getSamlOptions: async (req: any, done: any) => {
          const { ssoIdentifier } = req.params;
          
          const ssoConfig = await getSSOConfigHelper({
            ssoConfigId: new Types.ObjectId(ssoIdentifier)
          });
          
          const samlConfig = ({
            path: "/api/v1/auth/callback/saml",
            callbackURL: `${await getSiteURL()}/api/v1/auth/callback/saml`,
            entryPoint: ssoConfig.entryPoint,
            issuer: ssoConfig.issuer,
            cert: ssoConfig.cert,
            audience: ssoConfig.audience
          });
          
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
      
      if (user && user.authProvider !== AuthProvider.OKTA_SAML) {
        done(InternalServerError());
      }

      if (!user) {
        user = await new User({
          email,
          authProvider: AuthProvider.OKTA_SAML,
          authId: profile.id,
          firstName,
          lastName
        }).save();
        
        await new MembershipOrg({
          inviteEmail: email,
          user: user._id,
          organization: organization?._id,
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
          authProvider: user.authProvider,
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
