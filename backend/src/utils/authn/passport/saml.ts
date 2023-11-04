import passport from "passport";
import {
    getAuthSecret,
    getJwtProviderAuthLifetime,
    getSiteURL
} from "../../../config";
import {
    AuthMethod,
    MembershipOrg,
    Organization,
    User
} from "../../../models";
import {
    createToken
} from "../../../helpers/auth";
import { 
    ACCEPTED,
    AuthTokenType,
    INVITED,
    MEMBER
} from "../../../variables";
import { Types } from "mongoose";
import { getSSOConfigHelper } from "../../../ee/helpers/organizations";
import { InternalServerError, OrganizationNotFoundError } from "../../errors";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { MultiSamlStrategy } = require("@node-saml/passport-saml");

export const initializeSamlStrategy = async () => {
    passport.use("saml", new MultiSamlStrategy(
        {
          passReqToCallback: true,
          getSamlOptions: async (req: any, done: any) => {
            const { ssoIdentifier } = req.params;
            
            const ssoConfig = await getSSOConfigHelper({
              ssoConfigId: new Types.ObjectId(ssoIdentifier)
            });
            
            interface ISAMLConfig {
              callbackUrl: string;
              entryPoint: string;
              issuer: string;
              cert: string;
              audience: string;
              wantAuthnResponseSigned?: boolean;
            }
            
            const samlConfig: ISAMLConfig = ({
              callbackUrl: `${await getSiteURL()}/api/v1/sso/saml2/${ssoIdentifier}`,
              entryPoint: ssoConfig.entryPoint,
              issuer: ssoConfig.issuer,
              cert: ssoConfig.cert,
              audience: await getSiteURL()
            });
            
            if (ssoConfig.authProvider.toString() === AuthMethod.JUMPCLOUD_SAML.toString()) {
              samlConfig.wantAuthnResponseSigned = false;
            }
            
            if (ssoConfig.authProvider.toString() === AuthMethod.AZURE_SAML.toString()) {
              if (req.body.RelayState && JSON.parse(req.body.RelayState).spInitiated) {
                samlConfig.audience = `spn:${ssoConfig.issuer}`;
              }
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
              authTokenType: AuthTokenType.PROVIDER_TOKEN,
              userId: user._id.toString(),
              email: user.email,
              firstName,
              lastName,
              organizationName: organization?.name,
              authMethod: req.ssoConfig.authProvider,
              isUserCompleted,
              ...(req.body.RelayState ? {
                callbackPort: JSON.parse(req.body.RelayState).callbackPort as string
              } : {})
            },
            expiresIn: await getJwtProviderAuthLifetime(),
            secret: await getAuthSecret(),
          });
          
          req.isUserCompleted = isUserCompleted;
          req.providerAuthToken = providerAuthToken;
    
          done(null, profile);
        }
    ));
}