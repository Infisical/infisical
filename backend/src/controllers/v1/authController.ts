import { Request, Response } from "express";
import { Types } from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcrypt";
import * as bigintConversion from "bigint-conversion";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsrp = require("jsrp");
import { 
  IIdentity, 
  IIdentityTrustedIp, 
  IIdentityUniversalAuthClientSecret,
  Identity,
  IdentityAccessToken,
  IdentityAuthMethod,
  IdentityMembershipOrg,
  IdentityUniversalAuth,
  IdentityUniversalAuthClientSecret,
  LoginSRPDetail,
  TokenVersion,
  User
} from "../../models";
import { clearTokens, createToken, issueAuthTokens } from "../../helpers/auth";
import { checkUserDevice } from "../../helpers/user";
import { AuthTokenType } from "../../variables";
import { 
  BadRequestError, 
  ForbiddenRequestError, 
  ResourceNotFoundError,
  UnauthorizedRequestError
} from "../../utils/errors";
import {
  getAuthSecret,
  getHttpsEnabled,
  getJwtAuthLifetime,
  getSaltRounds
} from "../../config";
import { ActorType, EventType, IRole } from "../../ee/models";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/auth";
import { checkIPAgainstBlocklist, extractIPDetails, isValidIpOrCidr } from "../../utils/ip";
import { getUserAgentType } from "../../utils/posthog";
import { EEAuditLogService, EELicenseService } from "../../ee/services";
import { 
  OrgPermissionActions, 
  OrgPermissionSubjects, 
  getAuthDataOrgPermissions, 
  getOrgRolePermissions, 
  isAtLeastAsPrivilegedOrg 
} from "../../ee/services/RoleService";
import { ForbiddenError } from "@casl/ability";

declare module "jsonwebtoken" {
  export interface AuthnJwtPayload extends jwt.JwtPayload {
    authTokenType: AuthTokenType;
  }
  export interface UserIDJwtPayload extends jwt.JwtPayload {
    userId: string;
    refreshVersion?: number;
  }
  export interface IdentityAccessTokenJwtPayload extends jwt.JwtPayload {
    _id: string;
    clientSecretId: string;
    identityAccessTokenId: string;
    authTokenType: string;
  }
}

/**
 * Log in user step 1: Return [salt] and [serverPublicKey] as part of step 1 of SRP protocol
 * @param req
 * @param res
 * @returns
 */
export const login1 = async (req: Request, res: Response) => {
  const {
    body: { email, clientPublicKey }
  } = await validateRequest(reqValidator.Login1V1, req);

  const user = await User.findOne({
    email
  }).select("+salt +verifier");

  if (!user) throw new Error("Failed to find user");

  const server = new jsrp.server();
  server.init(
    {
      salt: user.salt,
      verifier: user.verifier
    },
    async () => {
      // generate server-side public key
      const serverPublicKey = server.getPublicKey();

      await LoginSRPDetail.findOneAndReplace(
        { email: email },
        {
          email: email,
          clientPublicKey: clientPublicKey,
          serverBInt: bigintConversion.bigintToBuf(server.bInt)
        },
        { upsert: true, returnNewDocument: false }
      );

      return res.status(200).send({
        serverPublicKey,
        salt: user.salt
      });
    }
  );
};

/**
 * Log in user step 2: complete step 2 of SRP protocol and return token and their (encrypted)
 * private key
 * @param req
 * @param res
 * @returns
 */
export const login2 = async (req: Request, res: Response) => {
  const {
    body: { email, clientProof }
  } = await validateRequest(reqValidator.Login2V1, req);

  const user = await User.findOne({
    email
  }).select("+salt +verifier +publicKey +encryptedPrivateKey +iv +tag");

  if (!user) throw new Error("Failed to find user");

  const loginSRPDetailFromDB = await LoginSRPDetail.findOneAndDelete({ email: email });

  if (!loginSRPDetailFromDB) {
    return BadRequestError(
      Error(
        "It looks like some details from the first login are not found. Please try login one again"
      )
    );
  }

  const server = new jsrp.server();
  server.init(
    {
      salt: user.salt,
      verifier: user.verifier,
      b: loginSRPDetailFromDB.serverBInt
    },
    async () => {
      server.setClientPublicKey(loginSRPDetailFromDB.clientPublicKey);

      // compare server and client shared keys
      if (server.checkClientProof(clientProof)) {
        // issue tokens

        await checkUserDevice({
          user,
          ip: req.realIP,
          userAgent: req.headers["user-agent"] ?? ""
        });

        const tokens = await issueAuthTokens({
          userId: user._id,
          ip: req.realIP,
          userAgent: req.headers["user-agent"] ?? ""
        });

        // store (refresh) token in httpOnly cookie
        res.cookie("jid", tokens.refreshToken, {
          httpOnly: true,
          path: "/",
          sameSite: "strict",
          secure: await getHttpsEnabled()
        });

        // return (access) token in response
        return res.status(200).send({
          token: tokens.token,
          publicKey: user.publicKey,
          encryptedPrivateKey: user.encryptedPrivateKey,
          iv: user.iv,
          tag: user.tag
        });
      }

      return res.status(400).send({
        message: "Failed to authenticate. Try again?"
      });
    }
  );
};

/**
 * Log out user
 * @param req
 * @param res
 * @returns
 */
export const logout = async (req: Request, res: Response) => {
  if (req.authData.actor.type === ActorType.USER && req.authData.tokenVersionId) {
    await clearTokens(req.authData.tokenVersionId);
  }

  // clear httpOnly cookie
  res.cookie("jid", "", {
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: (await getHttpsEnabled()) as boolean
  });

  return res.status(200).send({
    message: "Successfully logged out."
  });
};

export const revokeAllSessions = async (req: Request, res: Response) => {
  await TokenVersion.updateMany(
    {
      user: req.user._id
    },
    {
      $inc: {
        refreshVersion: 1,
        accessVersion: 1
      }
    }
  );

  return res.status(200).send({
    message: "Successfully revoked all sessions."
  });
};

/**
 * Return user is authenticated
 * @param req
 * @param res
 * @returns
 */
export const checkAuth = async (req: Request, res: Response) => {
  return res.status(200).send({
    message: "Authenticated"
  });
};

/**
 * Return new JWT access token by first validating the refresh token
 * @param req
 * @param res
 * @returns
 */
export const getNewToken = async (req: Request, res: Response) => {

  const refreshToken = req.cookies.jid;

  if (!refreshToken)
    throw BadRequestError({
      message: "Failed to find refresh token in request cookies"
    });

  const decodedToken = <jwt.UserIDJwtPayload>jwt.verify(refreshToken, await getAuthSecret());
  
  if (decodedToken.authTokenType !== AuthTokenType.REFRESH_TOKEN) throw UnauthorizedRequestError();

  const user = await User.findOne({
    _id: decodedToken.userId
  }).select("+publicKey +refreshVersion +accessVersion");

  if (!user) throw new Error("Failed to authenticate unfound user");
  if (!user?.publicKey) throw new Error("Failed to authenticate not fully set up account");

  const tokenVersion = await TokenVersion.findById(decodedToken.tokenVersionId);

  if (!tokenVersion)
    throw UnauthorizedRequestError({
      message: "Failed to validate refresh token"
    });

  if (decodedToken.refreshVersion !== tokenVersion.refreshVersion)
    throw BadRequestError({
      message: "Failed to validate refresh token"
    });

  const token = createToken({
    payload: {
      authTokenType: AuthTokenType.ACCESS_TOKEN,
      userId: decodedToken.userId,
      tokenVersionId: tokenVersion._id.toString(),
      accessVersion: tokenVersion.refreshVersion
    },
    expiresIn: await getJwtAuthLifetime(),
    secret: await getAuthSecret()
  });

  return res.status(200).send({
    token
  });
};

export const handleAuthProviderCallback = (req: Request, res: Response) => {
  res.redirect(`/login/provider/success?token=${encodeURIComponent(req.providerAuthToken)}`);
};

// ---- new IDENTITY logic

const packageUniversalAuthClientSecretData = (identityUniversalAuthClientSecret: IIdentityUniversalAuthClientSecret) => ({
  _id: identityUniversalAuthClientSecret._id,
  identityUniversalAuth: identityUniversalAuthClientSecret.identityUniversalAuth,
  isClientSecretRevoked: identityUniversalAuthClientSecret.isClientSecretRevoked,
  description: identityUniversalAuthClientSecret.description,
  clientSecretPrefix: identityUniversalAuthClientSecret.clientSecretPrefix,
  clientSecretNumUses: identityUniversalAuthClientSecret.clientSecretNumUses,
  clientSecretNumUsesLimit: identityUniversalAuthClientSecret.clientSecretNumUsesLimit,
  clientSecretTTL: identityUniversalAuthClientSecret.clientSecretTTL,
  createdAt: identityUniversalAuthClientSecret.createdAt,
  updatedAt: identityUniversalAuthClientSecret.updatedAt
});

/**
 * Renews an access token by its TTL
 * @param req 
 * @param res 
 */
 export const renewAccessToken = async (req: Request, res: Response) => {
    const {
        body: {
            accessToken
        }
    } = await validateRequest(reqValidator.RenewAccessTokenV1, req);

    const decodedToken = <jwt.IdentityAccessTokenJwtPayload>(
        jwt.verify(accessToken, await getAuthSecret())
    );

    if (decodedToken.authTokenType !== AuthTokenType.IDENTITY_ACCESS_TOKEN) throw UnauthorizedRequestError();

    const identityAccessToken = await IdentityAccessToken.findOne({
        _id: decodedToken.identityAccessTokenId,
        isAccessTokenRevoked: false
    });

    if (!identityAccessToken) throw UnauthorizedRequestError();

    const {
        accessTokenTTL,
        accessTokenLastRenewedAt,
        accessTokenMaxTTL,
        createdAt: accessTokenCreatedAt
    } = identityAccessToken;

    if (accessTokenTTL === accessTokenMaxTTL) throw UnauthorizedRequestError({
        message: "Failed to renew non-renewable access token"
    });

    // ttl check
    if (accessTokenTTL > 0) {
        const currentDate = new Date();
        if (accessTokenLastRenewedAt) {
            // access token has been renewed
            const accessTokenRenewed = new Date(accessTokenLastRenewedAt);
            const ttlInMilliseconds = accessTokenTTL * 1000;
            const expirationDate = new Date(accessTokenRenewed.getTime() + ttlInMilliseconds);

            if (currentDate > expirationDate) throw UnauthorizedRequestError({
                message: "Failed to renew MI access token due to TTL expiration"
            });
        } else {
            // access token has never been renewed
            const accessTokenCreated = new Date(accessTokenCreatedAt);
            const ttlInMilliseconds = accessTokenTTL * 1000;
            const expirationDate = new Date(accessTokenCreated.getTime() + ttlInMilliseconds);

            if (currentDate > expirationDate) throw UnauthorizedRequestError({
                message: "Failed to renew MI access token due to TTL expiration"
            });
        }
    }

    // max ttl checks
    if (accessTokenMaxTTL > 0) {
        const accessTokenCreated = new Date(accessTokenCreatedAt);
        const ttlInMilliseconds = accessTokenMaxTTL * 1000;
        const currentDate = new Date();
        const expirationDate = new Date(accessTokenCreated.getTime() + ttlInMilliseconds);

        if (currentDate > expirationDate) throw UnauthorizedRequestError({
            message: "Failed to renew MI access token due to Max TTL expiration"
        });

        const extendToDate = new Date(currentDate.getTime() + accessTokenTTL);
        if (extendToDate > expirationDate) throw UnauthorizedRequestError({
            message: "Failed to renew MI access token past its Max TTL expiration"
        });
    }

    await IdentityAccessToken.findByIdAndUpdate(
        identityAccessToken._id,
        {
            accessTokenLastRenewedAt: new Date()
        }
    );

    return res.status(200).send({
        accessToken,
        expiresIn: identityAccessToken.accessTokenTTL,
        tokenType: "Bearer"
    });
}

/**
 * Return access token for identity with client id [clientId]
 * and client secret [clientSecret]
 * @param req 
 * @param res 
 */
 export const loginIdentityUniversalAuth = async (req: Request, res: Response) => {
    const {
        body: {
            clientId,
            clientSecret
        }
    } = await validateRequest(reqValidator.LoginUniversalAuthV1, req);

    const identityUniversalAuth = await IdentityUniversalAuth.findOne({
        clientId
    }).populate<{ identity: IIdentity }>("identity");
    
    if (!identityUniversalAuth) throw UnauthorizedRequestError();

    checkIPAgainstBlocklist({
        ipAddress: req.realIP,
        trustedIps: identityUniversalAuth.clientSecretTrustedIps
    });

    const clientSecretData = await IdentityUniversalAuthClientSecret.find({
        identity: identityUniversalAuth.identity,
        isClientSecretRevoked: false
    });

    let validatedClientSecretDatum: IIdentityUniversalAuthClientSecret | undefined;

    for (const clientSecretDatum of clientSecretData) {
        const isSecretValid = await bcrypt.compare(
            clientSecret,
            clientSecretDatum.clientSecretHash
        );

        if (isSecretValid) {
            validatedClientSecretDatum = clientSecretDatum;
            break;
        }
    }

    if (!validatedClientSecretDatum) throw UnauthorizedRequestError();

    const {
        clientSecretTTL,
        clientSecretNumUses,
        clientSecretNumUsesLimit,
    } = validatedClientSecretDatum;

    if (clientSecretTTL > 0) {
        const clientSecretCreated = new Date(validatedClientSecretDatum.createdAt)
        const ttlInMilliseconds = clientSecretTTL * 1000;
        const currentDate = new Date();
        const expirationTime = new Date(clientSecretCreated.getTime() + ttlInMilliseconds);

        if (currentDate > expirationTime) {
            await IdentityUniversalAuthClientSecret.findByIdAndUpdate(
                validatedClientSecretDatum._id,
                {
                    isClientSecretRevoked: true
                }
            );

            throw UnauthorizedRequestError({
                message: "Failed to authenticate identity credentials due to expired client secret"
            });
        }
    }

    if (clientSecretNumUsesLimit > 0 && clientSecretNumUses === clientSecretNumUsesLimit) {
        // number of times client secret can be used for 
        // a login operation reached
        await IdentityUniversalAuthClientSecret.findByIdAndUpdate(
            validatedClientSecretDatum._id,
            {
                isClientSecretRevoked: true
            },
            {
                new: true
            }
        );

        throw UnauthorizedRequestError({
            message: "Failed to authenticate identity credentials due to client secret number of uses limit reached"
        });
    }

    // increment usage count by 1
    await IdentityUniversalAuthClientSecret
    .findByIdAndUpdate(
        validatedClientSecretDatum._id,
        {
            clientSecretLastUsedAt: new Date(),
            $inc: { clientSecretNumUses: 1 }
        },
        {
            new: true
        }
    );

    const identityAccessToken = await new IdentityAccessToken({
        identity: identityUniversalAuth.identity,
        identityUniversalAuthClientSecret: validatedClientSecretDatum._id,
        accessTokenNumUses: 0,
        accessTokenNumUsesLimit: identityUniversalAuth.accessTokenNumUsesLimit,
        accessTokenTTL: identityUniversalAuth.accessTokenTTL,
        accessTokenMaxTTL: identityUniversalAuth.accessTokenMaxTTL,
        accessTokenTrustedIps: identityUniversalAuth.accessTokenTrustedIps,
        isAccessTokenRevoked: false
    }).save();

    // token version
    const accessToken = createToken({
        payload: {
            identityId: identityUniversalAuth.identity.toString(),
            clientSecretId: validatedClientSecretDatum._id.toString(),
            identityAccessTokenId: identityAccessToken._id.toString(),
            authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN
        },
        secret: await getAuthSecret()
    });

    const userAgent = req.headers["user-agent"] ?? "";

    await EEAuditLogService.createAuditLog(
        {
            actor: {
                type: ActorType.IDENTITY,
                metadata: {
                    identityId: identityUniversalAuth.identity._id.toString(),
                    name: identityUniversalAuth.identity.name
                }
            },
            authPayload: identityUniversalAuth.identity,
            ipAddress: req.realIP,
            userAgent,
            userAgentType: getUserAgentType(userAgent)
        },
        {
            type: EventType.LOGIN_IDENTITY_UNIVERSAL_AUTH,
            metadata: {
                identityId: identityUniversalAuth.identity._id.toString(),
                clientSecretId: validatedClientSecretDatum._id.toString(),
                identityAccessTokenId: identityAccessToken._id.toString()
            }
        }
    );

    return res.status(200).send({
        accessToken,
        expiresIn: identityUniversalAuth.accessTokenTTL,
        tokenType: "Bearer"
    });
}

export const addIdentityUniversalAuth = async (req: Request, res: Response) => {
    const {
        params: { identityId },
        body: {
            clientSecretTrustedIps,
            accessTokenTTL,
            accessTokenMaxTTL,
            accessTokenNumUsesLimit,
            accessTokenTrustedIps,
        }
    } = await validateRequest(reqValidator.AddUniversalAuthToIdentityV1, req);

    const identityMembershipOrg = await IdentityMembershipOrg
        .findOne({
            identity: new Types.ObjectId(identityId)
        })
        .populate<{
            identity: IIdentity,
            customRole: IRole
        }>("identity customRole");

    if (!identityMembershipOrg) throw ResourceNotFoundError({
        message: `Failed to find identity with id ${identityId}`
    });
    
    if (identityMembershipOrg.identity?.authMethod) throw BadRequestError({
        message: "Failed to add universal auth to already-configured identity"
    });

    if (accessTokenMaxTTL > 0 && accessTokenTTL > accessTokenMaxTTL) {
        throw BadRequestError({ message: "Access token TTL cannot be greater than max TTL" })
    }

    const { permission } = await getAuthDataOrgPermissions({
        authData: req.authData,
        organizationId: identityMembershipOrg.organization
    });

    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Create,
        OrgPermissionSubjects.Identity
    );

    const plan = await EELicenseService.getPlan(identityMembershipOrg.organization);

    // validate trusted ips
    const reformattedClientSecretTrustedIps = clientSecretTrustedIps.map((clientSecretTrustedIp) => {
        if (!plan.ipAllowlisting && clientSecretTrustedIp.ipAddress !== "0.0.0.0/0") return res.status(400).send({
            message: "Failed to add IP access range to service token due to plan restriction. Upgrade plan to add IP access range."
        });

        const isValidIPOrCidr = isValidIpOrCidr(clientSecretTrustedIp.ipAddress);

        if (!isValidIPOrCidr) return res.status(400).send({
            message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });

        return extractIPDetails(clientSecretTrustedIp.ipAddress);
    });

    const reformattedAccessTokenTrustedIps = accessTokenTrustedIps.map((accessTokenTrustedIp) => {
        if (!plan.ipAllowlisting && accessTokenTrustedIp.ipAddress !== "0.0.0.0/0") return res.status(400).send({
            message: "Failed to add IP access range to service token due to plan restriction. Upgrade plan to add IP access range."
        });

        const isValidIPOrCidr = isValidIpOrCidr(accessTokenTrustedIp.ipAddress);

        if (!isValidIPOrCidr) return res.status(400).send({
            message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });

        return extractIPDetails(accessTokenTrustedIp.ipAddress);
    });
    
    const identityUniversalAuth = await new IdentityUniversalAuth({
        identity: identityMembershipOrg.identity._id,
        clientId: crypto.randomUUID(),
        clientSecretTrustedIps: reformattedClientSecretTrustedIps,
        accessTokenTTL,
        accessTokenMaxTTL,
        accessTokenNumUsesLimit,
        accessTokenTrustedIps: reformattedAccessTokenTrustedIps,
    }).save();
    
    await Identity.findByIdAndUpdate(
        identityMembershipOrg.identity._id,
        {
            authMethod: IdentityAuthMethod.UNIVERSAL_AUTH
        }
    );

    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.ADD_IDENTITY_UNIVERSAL_AUTH,
            metadata: {
                identityId: identityMembershipOrg.identity._id.toString(),
                clientSecretTrustedIps: reformattedClientSecretTrustedIps as Array<IIdentityTrustedIp>,
                accessTokenTTL,
                accessTokenMaxTTL,
                accessTokenNumUsesLimit,
                accessTokenTrustedIps: reformattedAccessTokenTrustedIps as Array<IIdentityTrustedIp>
            }
        }
    );

    return res.status(200).send({
        identityUniversalAuth
    });
}

export const updateIdentityUniversalAuth = async (req: Request, res: Response) => {
    const {
        params: { identityId },
        body: {
            clientSecretTrustedIps,
            accessTokenTTL, // TODO: validate this and max TTL
            accessTokenMaxTTL,
            accessTokenNumUsesLimit,
            accessTokenTrustedIps,
        }
    } = await validateRequest(reqValidator.UpdateUniversalAuthToIdentityV1, req);

    const identityMembershipOrg = await IdentityMembershipOrg
        .findOne({
            identity: new Types.ObjectId(identityId)
        })
        .populate<{
            identity: IIdentity,
            customRole: IRole
        }>("identity customRole");

    if (!identityMembershipOrg) throw ResourceNotFoundError({
        message: `Failed to find identity with id ${identityId}`
    });
    
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.UNIVERSAL_AUTH) throw BadRequestError({
        message: "Failed to add universal auth to already-configured identity"
    });

    const { permission } = await getAuthDataOrgPermissions({
        authData: req.authData,
        organizationId: identityMembershipOrg.organization
    });

    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Edit,
        OrgPermissionSubjects.Identity
    );

    const plan = await EELicenseService.getPlan(identityMembershipOrg.organization);

    // validate trusted ips
    let reformattedClientSecretTrustedIps;
    if (clientSecretTrustedIps) {
        reformattedClientSecretTrustedIps = clientSecretTrustedIps.map((clientSecretTrustedIp) => {
            if (!plan.ipAllowlisting && clientSecretTrustedIp.ipAddress !== "0.0.0.0/0") return res.status(400).send({
                message: "Failed to add IP access range to service token due to plan restriction. Upgrade plan to add IP access range."
            });

            const isValidIPOrCidr = isValidIpOrCidr(clientSecretTrustedIp.ipAddress);

            if (!isValidIPOrCidr) return res.status(400).send({
                message: "The IP is not a valid IPv4, IPv6, or CIDR block"
            });

            return extractIPDetails(clientSecretTrustedIp.ipAddress);
        });
    }

    let reformattedAccessTokenTrustedIps;
    if (accessTokenTrustedIps) {
        reformattedAccessTokenTrustedIps = accessTokenTrustedIps.map((accessTokenTrustedIp) => {
            if (!plan.ipAllowlisting && accessTokenTrustedIp.ipAddress !== "0.0.0.0/0") return res.status(400).send({
                message: "Failed to add IP access range to service token due to plan restriction. Upgrade plan to add IP access range."
            });

            const isValidIPOrCidr = isValidIpOrCidr(accessTokenTrustedIp.ipAddress);

            if (!isValidIPOrCidr) return res.status(400).send({
                message: "The IP is not a valid IPv4, IPv6, or CIDR block"
            });

            return extractIPDetails(accessTokenTrustedIp.ipAddress);
        });
    }
    
    const identityUniversalAuth = await IdentityUniversalAuth.findOneAndUpdate(
        {
            identity: identityMembershipOrg.identity._id,
        },
        {
            clientSecretTrustedIps: reformattedClientSecretTrustedIps,
            accessTokenTTL,
            accessTokenMaxTTL,
            accessTokenNumUsesLimit,
            accessTokenTrustedIps: reformattedAccessTokenTrustedIps,
        },
        {
            new: true
        }
    );

    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.UPDATE_IDENTITY_UNIVERSAL_AUTH,
            metadata: {
                identityId: identityMembershipOrg.identity._id.toString(),
                clientSecretTrustedIps: reformattedClientSecretTrustedIps as Array<IIdentityTrustedIp>,
                accessTokenTTL,
                accessTokenMaxTTL,
                accessTokenNumUsesLimit,
                accessTokenTrustedIps: reformattedAccessTokenTrustedIps as Array<IIdentityTrustedIp>
            }
        }
    );

    return res.status(200).send({
        identityUniversalAuth
    });
}

export const getIdentityUniversalAuth = async (req: Request, res: Response) => {
    const {
        params: { identityId }
    } = await validateRequest(reqValidator.GetUniversalAuthForIdentityV1, req);
    
    const identityMembershipOrg = await IdentityMembershipOrg
        .findOne({
            identity: new Types.ObjectId(identityId)
        })
        .populate<{
            identity: IIdentity,
            customRole: IRole
        }>("identity customRole");

    if (!identityMembershipOrg) throw ResourceNotFoundError({
        message: `Failed to find identity with id ${identityId}`
    });

    const { permission } = await getAuthDataOrgPermissions({
        authData: req.authData,
        organizationId: identityMembershipOrg.organization
    });

    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Read,
        OrgPermissionSubjects.Identity
    );

    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.UNIVERSAL_AUTH) throw BadRequestError({
        message: "The identity does not have universal auth configured"
    });
    
    const identityUniversalAuth = await IdentityUniversalAuth.findOne({
        identity: identityMembershipOrg.identity._id,
    });

    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.GET_IDENTITY_UNIVERSAL_AUTH,
            metadata: {
                identityId: identityMembershipOrg.identity._id.toString(),
            }
        }
    );

    return res.status(200).send({
        identityUniversalAuth
    });
}

export const createUniversalAuthClientSecret = async (req: Request, res: Response) => {
    const {
        params: { identityId },
        body: {
            description,
            numUsesLimit,
            ttl
        }
    } = await validateRequest(reqValidator.CreateUniversalAuthClientSecretV1, req);

    const identityMembershipOrg = await IdentityMembershipOrg.findOne({
        identity: new Types.ObjectId(identityId)
    }).populate<{
        identity: IIdentity,
        customRole: IRole
    }>("identity customRole");

    if (!identityMembershipOrg) throw ResourceNotFoundError({
        message: `Failed to find identity with id ${identityId}`
    });

    const { permission } = await getAuthDataOrgPermissions({
        authData: req.authData,
        organizationId: identityMembershipOrg.organization
    });

    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Create,
        OrgPermissionSubjects.Identity
    );

    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.UNIVERSAL_AUTH) throw BadRequestError({
        message: "The identity does not have universal auth configured"
    });

    const rolePermission = await getOrgRolePermissions(
        identityMembershipOrg?.customRole?.slug ?? identityMembershipOrg.role,
        identityMembershipOrg.organization.toString()
    );
    const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, rolePermission);

    if (!hasRequiredPrivileges) throw ForbiddenRequestError({
        message: "Failed to create client secret for more privileged identity"
    });

    const clientSecret = crypto.randomBytes(32).toString("hex");
    const clientSecretHash = await bcrypt.hash(clientSecret, await getSaltRounds());
    
    const identityUniversalAuth = await IdentityUniversalAuth.findOne({
        identity: identityMembershipOrg.identity._id
    });
    
    if (!identityUniversalAuth) throw ResourceNotFoundError();

    const identityUniversalAuthClientSecret = await new IdentityUniversalAuthClientSecret({
        identity: identityMembershipOrg.identity._id,
        identityUniversalAuth: identityUniversalAuth._id,
        description,
        clientSecretPrefix: clientSecret.slice(0, 4),
        clientSecretHash,
        clientSecretNumUses: 0,
        clientSecretNumUsesLimit: numUsesLimit,
        clientSecretTTL: ttl,
        isClientSecretRevoked: false
    }).save();

    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.CREATE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET,
            metadata: {
                identityId: identityMembershipOrg.identity._id.toString(),
                clientSecretId: identityUniversalAuthClientSecret._id.toString()
            }
        }
    );

    return res.status(200).send({
        clientSecret,
        clientSecretData: packageUniversalAuthClientSecretData(identityUniversalAuthClientSecret)
    });
}

export const getUniversalAuthClientSecrets = async (req: Request, res: Response) => {
    const {
        params: { identityId }
    } = await validateRequest(reqValidator.GetUniversalAuthClientSecretsV1, req);
    
    const identityMembershipOrg = await IdentityMembershipOrg.findOne({
        identity: new Types.ObjectId(identityId)
    }).populate<{
        identity: IIdentity,
        customRole: IRole
    }>("identity customRole");

    if (!identityMembershipOrg) throw ResourceNotFoundError();

    const { permission } = await getAuthDataOrgPermissions({
        authData: req.authData,
        organizationId: identityMembershipOrg.organization
    });
    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Read,
        OrgPermissionSubjects.Identity
    );

    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.UNIVERSAL_AUTH) throw BadRequestError({
        message: "The identity does not have universal auth configured"
    });

    const rolePermission = await getOrgRolePermissions(
        identityMembershipOrg?.customRole?.slug ?? identityMembershipOrg.role,
        identityMembershipOrg.organization.toString()
    );
    const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, rolePermission);

    if (!hasRequiredPrivileges) throw ForbiddenRequestError({
        message: "Failed to get client secrets for more privileged MI"
    });

    const clientSecretData = await IdentityUniversalAuthClientSecret
        .find({
            identity: identityMembershipOrg.identity,
            isClientSecretRevoked: false
        })
        .sort({ createdAt: -1 })
        .limit(5);

    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.GET_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRETS,
            metadata: {
                identityId: identityMembershipOrg.identity._id.toString()
            }
        }
    );

    return res.status(200).send({
        clientSecretData: clientSecretData.map((clientSecretDatum) => packageUniversalAuthClientSecretData(clientSecretDatum))
    });
}

export const revokeUniversalAuthClientSecret = async (req: Request, res: Response) => {
    const {
        params: { identityId, clientSecretId }
    } = await validateRequest(reqValidator.RevokeUniversalAuthClientSecretV1, req);
    
    const identityMembershipOrg = await IdentityMembershipOrg
        .findOne({
            identity: new Types.ObjectId(identityId)
        })
        .populate<{
            identity: IIdentity,
            customRole: IRole
        }>("identity customRole");

    if (!identityMembershipOrg) throw ResourceNotFoundError({
        message: `Failed to find identity with id ${identityId}`
    });

    const { permission } = await getAuthDataOrgPermissions({
        authData: req.authData,
        organizationId: identityMembershipOrg.organization
    });

    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Delete,
        OrgPermissionSubjects.Identity
    );

    const rolePermission = await getOrgRolePermissions(
        identityMembershipOrg?.customRole?.slug ?? identityMembershipOrg.role,
        identityMembershipOrg.organization.toString()
    );
    const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, rolePermission);

    if (!hasRequiredPrivileges) throw ForbiddenRequestError({
        message: "Failed to delete client secrets for more privileged identity"
    });

    const clientSecretData = await IdentityUniversalAuthClientSecret.findOneAndUpdate(
        {
            _id: new Types.ObjectId(clientSecretId),
            identity: identityMembershipOrg.identity._id
        },
        {
            isClientSecretRevoked: true
        },
        {
            new: true
        }
    );

    if (!clientSecretData) throw ResourceNotFoundError();
    
    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.REVOKE_IDENTITY_UNIVERSAL_AUTH_CLIENT_SECRET,
            metadata: {
                identityId: identityMembershipOrg.identity._id.toString(),
                clientSecretId: clientSecretId
            }
        }
    );

    return res.status(200).send({
        clientSecretData: packageUniversalAuthClientSecretData(clientSecretData)
    })
}