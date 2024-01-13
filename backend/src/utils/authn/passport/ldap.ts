import { Types } from "mongoose";
import {
    AuthMethod,
    MembershipOrg,
    Organization,
    User
} from "../../../models";
import passport from "passport";
import { OrganizationNotFoundError } from "../../errors";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LdapStrategy = require("passport-ldapauth");
import { getAuthSecret, getJwtProviderAuthLifetime } from "../../../config";
import { createToken } from "../../../helpers/auth";
import {
    ACCEPTED, 
    AuthTokenType,
    MEMBER
} from "../../../variables";
import { getLdapConfigHelper } from "../../../ee/helpers/organizations";

const getLDAPConfiguration = (req: any, callback: any) => {
    const {
        organizationId
    } = req.body as {
        organizationId: string;
    };
    
    req.organizationId = organizationId;
    
    const boot = async () => {
        const ldapConfig = await getLdapConfigHelper({
            organizationId: new Types.ObjectId(organizationId)
        });
        
        // example
        // var opts = {
        //     server: {
        //         // url: 'ldaps://openldap:636', // connection over SSL/TLS
        //         url: 'ldap://openldap:389',
        //         bindDN: 'cn=admin,dc=acme,dc=com',
        //         bindCredentials: 'admin',
        //         searchBase: 'ou=people,dc=acme,dc=com',
        //         searchFilter: '(uid={{username}})',
        //         searchAttributes: ['uid', 'givenName', 'sn'], // optional, defaults to all (get username too)
        //         // tlsOptions: {
        //         //     ca: [caCert]
        //         // }
        //     },
        //     passReqToCallback: true
        // };

        const opts = {
            server: {
                url: ldapConfig.url,
                bindDN: ldapConfig.bindDN,
                bindCredentials: ldapConfig.bindPass,
                searchBase: ldapConfig.searchBase,
                searchFilter: "(uid={{username}})",
                searchAttributes: ["uid", "givenName", "sn"],
                ...(ldapConfig.caCert !== "" ? {
                        tlsOptions: {
                            ca: [ldapConfig.caCert]
                        }
                    } : {}
                )
            },
            passReqToCallback: true
        };
        
        callback(null, opts);
    }
    
    process.nextTick(async () => {
        await boot();
    });
};

export const initializeLdapStrategy = async () => {
    passport.use(new LdapStrategy(getLDAPConfiguration,
        async (req: any, user: any, done: any) => {
            
            const organization = await Organization.findById(req.organizationId);
            if (!organization) return done(OrganizationNotFoundError());
            
            const ldapUsername = user.uid;
            const firstName = user.givenName;
            const lastName = user.sn;
            const ldapEmail = `ldap-${ldapUsername}-${organization._id.toString()}@ldap.com`;

            try {
                let user = await User.findOne({
                    email: ldapEmail
                }).select("+publicKey");
                
                if (!user) {
                    user = await new User({
                        email: ldapEmail,
                        authMethods: [AuthMethod.LDAP],
                        firstName,
                        lastName,
                        organization
                    }).save();
                    
                    await new MembershipOrg({
                        user: user._id,
                        organization: organization._id,
                        role: MEMBER,
                        status: ACCEPTED
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
                    organizationId: organization?._id,
                    authMethod: AuthMethod.LDAP,
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
                
                return done(null, user);
            } catch (err) {
                return done(null, false);
            }
        }
    ));
}