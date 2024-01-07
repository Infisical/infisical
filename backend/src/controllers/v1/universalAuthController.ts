import { Request, Response } from "express";
import { Types } from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcrypt";
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
} from "../../models";
import { createToken } from "../../helpers/auth";
import { AuthTokenType } from "../../variables";
import {
    BadRequestError,
    ForbiddenRequestError,
    ResourceNotFoundError,
    UnauthorizedRequestError
} from "../../utils/errors";
import {
    getAuthSecret,
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
    /*
        #swagger.summary = 'Renew access token'
        #swagger.description = 'Renew access token'
        
        #swagger.requestBody = {
            content: {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "accessToken": {
                                "type": "string",
                                "description": "Access token to renew",
                                "example": "..."
                            }
                        }
                    }
                }
            }
        }

        #swagger.responses[200] = {
            content: {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "accessToken": {
                                "type": "string",
                                "description": "(Same) Access token after successful renewal"
                            },
                            "expiresIn": {
                                "type": "number",
                                "description": "TTL of access token in seconds"
                            },
                            "tokenType": {
                                "type": "string",
                                "description": "Type of access token (e.g. Bearer)"
                            }
                        },
                        "description": "Access token and its details"
                    }
                }
            }
        }
    */
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
        createdAt: accessTokenCreatedAt,
        accessTokenNumUses,
        accessTokenNumUsesLimit
    } = identityAccessToken;

    if (accessTokenNumUses >= accessTokenNumUsesLimit) {
        throw BadRequestError({ message: "Unable to renew because access token number of uses limit reached" })
    }

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
        accessTokenMaxTTL: identityAccessToken.accessTokenMaxTTL,
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
    /*
        #swagger.summary = 'Login with Universal Auth'
        #swagger.description = 'Login with Universal Auth'
        
        #swagger.requestBody = {
            content: {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "clientId": {
                                "type": "string",
                                "description": "Client ID for identity to login with Universal Auth",
                                "example": "..."
                            },
                            "clientSecret": {
                                "type": "string",
                                "description": "Client Secret for identity to login with Universal Auth",
                                "example": "..."
                            }
                        }
                    }
                }
            }
        }

        #swagger.responses[200] = {
            content: {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "accessToken": {
                                "type": "string",
                                "description": "Access token issued after successful login"
                            },
                            "expiresIn": {
                                "type": "number",
                                "description": "TTL of access token in seconds"
                            },
                            "tokenType": {
                                "type": "string",
                                "description": "Type of access token (e.g. Bearer)"
                            }
                        },
                        "description": "Access token and its details"
                    }
                }
            }
        }
    */
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
                identityUniversalAuthId: identityUniversalAuth._id.toString(),
                clientSecretId: validatedClientSecretDatum._id.toString(),
                identityAccessTokenId: identityAccessToken._id.toString()
            }
        }
    );

    return res.status(200).send({
        accessToken,
        expiresIn: identityUniversalAuth.accessTokenTTL,
        accessTokenMaxTTL: identityUniversalAuth.accessTokenMaxTTL,
        tokenType: "Bearer",
    });
}

/**
 * Attach identity universal auth method onto identity with id [identityId]
 * @param req 
 * @param res 
 */
export const attachIdentityUniversalAuth = async (req: Request, res: Response) => {
    /*
        #swagger.summary = 'Attach Universal Auth configuration onto identity'
        #swagger.description = 'Attach Universal Auth configuration onto identity'

        #swagger.security = [{
            "bearerAuth": []
        }]
        
        #swagger.parameters['identityId'] = {
            "description": "ID of identity to attach Universal Auth onto",
            "required": true,
            "type": "string",
            "in": "path"
        }
        
        #swagger.requestBody = {
            content: {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "clientSecretTrustedIps": {
                                type: "array",
                                items: {
                                    type: "object",
                                    "properties": {
                                        "ipAddress": {
                                            type: "string",
                                            description: "IP address to trust",
                                            default: "0.0.0.0/0"
                                        }
                                    }
                                },
                                "description": "List of IPs or CIDR ranges that the Client Secret can be used from together with the Client ID to get back an access token. By default, Client Secrets are given the 0.0.0.0/0 entry representing all possible IPv4 addresses.",
                                "example": "...",
                                "default": [{ ipAddress: "0.0.0.0/0" }]
                            },
                            "accessTokenTTL": {
                                "type": "number",
                                "description": "The incremental lifetime for an acccess token in seconds; a value of 0 implies an infinite incremental lifetime.",
                                "example": "...",
                                "default": 100
                            },
                            "accessTokenMaxTTL": {
                                "type": "number",
                                "description": "The maximum lifetime for an acccess token in seconds; a value of 0 implies an infinite maximum lifetime.",
                                "example": "...",
                                "default": 2592000
                            },
                            "accessTokenNumUsesLimit": {
                                "type": "number",
                                "description": "The maximum number of times that an access token can be used; a value of 0 implies infinite number of uses.",
                                "example": "...",
                                "default": 0
                            },
                            "accessTokenTrustedIps": {
                                type: "array",
                                items: {
                                    type: "object",
                                    "properties": {
                                        "ipAddress": {
                                            type: "string",
                                            description: "IP address to trust",
                                            default: "0.0.0.0/0"
                                        }
                                    }
                                },
                                "description": "List of IPs or CIDR ranges that access tokens can be used from. By default, each token is given the 0.0.0.0/0 entry representing all possible IPv4 addresses.",
                                "example": "...",
                                "default": [{ ipAddress: "0.0.0.0/0" }]
                            }
                        }
                    }
                }
            }
        }

        #swagger.responses[200] = {
            content: {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "identityUniversalAuth": {
                                $ref: '#/definitions/IdentityUniversalAuth'
                            }
                        },
                        "description": "Details of attached Universal Auth"
                    }
                }
            }
        }
    */
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
        if (!plan.ipAllowlisting && (clientSecretTrustedIp.ipAddress !== "0.0.0.0/0" && clientSecretTrustedIp.ipAddress !== "::/0")) return res.status(400).send({
            message: "Failed to add IP access range to service token due to plan restriction. Upgrade plan to add IP access range."
        });

        const isValidIPOrCidr = isValidIpOrCidr(clientSecretTrustedIp.ipAddress);

        if (!isValidIPOrCidr) return res.status(400).send({
            message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });

        return extractIPDetails(clientSecretTrustedIp.ipAddress);
    });

    const reformattedAccessTokenTrustedIps = accessTokenTrustedIps.map((accessTokenTrustedIp) => {
        if (!plan.ipAllowlisting && (accessTokenTrustedIp.ipAddress !== "0.0.0.0/0" && accessTokenTrustedIp.ipAddress !== "::/0")) return res.status(400).send({
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

/**
 * Update identity universal auth method on identity with id [identityId]
 * @param req 
 * @param res 
 */
export const updateIdentityUniversalAuth = async (req: Request, res: Response) => {
    /*
        #swagger.summary = 'Update Universal Auth configuration on identity'
        #swagger.description = 'Update Universal Auth configuration on identity'

        #swagger.security = [{
            "bearerAuth": []
        }]
        
        #swagger.parameters['identityId'] = {
            "description": "ID of identity to update Universal Auth on",
            "required": true,
            "type": "string",
            "in": "path"
        }
        
        #swagger.requestBody = {
            content: {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "clientSecretTrustedIps": {
                                type: "array",
                                items: {
                                    type: "object",
                                    "properties": {
                                        "ipAddress": {
                                            type: "string",
                                            description: "IP address to trust"
                                        }
                                    }
                                },
                                "description": "List of IPs or CIDR ranges that the Client Secret can be used from together with the Client ID to get back an access token. By default, Client Secrets are given the 0.0.0.0/0 entry representing all possible IPv4 addresses.",
                                "example": "...",
                            },
                            "accessTokenTTL": {
                                "type": "number",
                                "description": "The incremental lifetime for an acccess token in seconds; a value of 0 implies an infinite incremental lifetime.",
                                "example": "...",
                            },
                            "accessTokenMaxTTL": {
                                "type": "number",
                                "description": "The maximum lifetime for an acccess token in seconds; a value of 0 implies an infinite maximum lifetime.",
                                "example": "...",
                            },
                            "accessTokenNumUsesLimit": {
                                "type": "number",
                                "description": "The maximum number of times that an access token can be used; a value of 0 implies infinite number of uses.",
                                "example": "...",
                            },
                            "accessTokenTrustedIps": {
                                type: "array",
                                items: {
                                    type: "object",
                                    "properties": {
                                        "ipAddress": {
                                            type: "string",
                                            description: "IP address to trust"
                                        }
                                    }
                                },
                                "description": "List of IPs or CIDR ranges that access tokens can be used from. By default, each token is given the 0.0.0.0/0 entry representing all possible IPv4 addresses.",
                                "example": "...",
                            }
                        }
                    }
                }
            }
        }

        #swagger.responses[200] = {
            content: {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "identityUniversalAuth": {
                                $ref: '#/definitions/IdentityUniversalAuth'
                            }
                        },
                        "description": "Details of updated Universal Auth"
                    }
                }
            }
        }
    */
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
            if (!plan.ipAllowlisting && (clientSecretTrustedIp.ipAddress !== "0.0.0.0/0" && clientSecretTrustedIp.ipAddress !== "::/0")) return res.status(400).send({
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
            if (!plan.ipAllowlisting && (accessTokenTrustedIp.ipAddress !== "0.0.0.0/0" && accessTokenTrustedIp.ipAddress !== "::/0")) return res.status(400).send({
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

/**
 * Return identity universal auth method on identity with id [identityId]
 * @param req 
 * @param res 
 */
export const getIdentityUniversalAuth = async (req: Request, res: Response) => {
    /*
        #swagger.summary = 'Retrieve Universal Auth configuration on identity'
        #swagger.description = 'Retrieve Universal Auth configuration on identity'

        #swagger.security = [{
            "bearerAuth": []
        }]
        
        #swagger.parameters['identityId'] = {
            "description": "ID of identity to retrieve Universal Auth on",
            "required": true,
            "type": "string",
            "in": "path"
        }

        #swagger.responses[200] = {
            content: {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "identityUniversalAuth": {
                                $ref: '#/definitions/IdentityUniversalAuth'
                            }
                        },
                        "description": "Details of retrieved Universal Auth"
                    }
                }
            }
        }
    */
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


/**
 * Create client secret for identity universal auth method on identity with id [identityId]
 * @param req 
 * @param res 
 */
export const createUniversalAuthClientSecret = async (req: Request, res: Response) => {
    /*
        #swagger.summary = 'Create Universal Auth Client Secret for identity'
        #swagger.description = 'Create Universal Auth Client Secret for identity'

        #swagger.security = [{
            "bearerAuth": []
        }]
        
        #swagger.parameters['identityId'] = {
            "description": "ID of identity to create Universal Auth Client Secret for",
            "required": true,
            "type": "string",
            "in": "path"
        }
        
        #swagger.requestBody = {
            content: {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "description": {
                                "type": "string",
                                "description": "A description for the Client Secret to create.",
                                "example": "..."
                            },
                            "ttl": {
                                "type": "number",
                                "description": "The time-to-live for the Client Secret to create. By default, the TTL will be set to 0 which implies that the Client Secret will never expire; a value of 0 implies an infinite lifetime.",
                                "example": "...",
                                "default": 0
                            },
                            "numUsesLimit": {
                                "type": "number",
                                "description": "The maximum number of times that the Client Secret can be used together with the Client ID to get back an access token; a value of 0 implies infinite number of uses.",
                                "example": "...",
                                "default": 0
                            }
                        }
                    }
                }
            }
        }

        #swagger.responses[200] = {
            content: {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "clientSecret": {
                                "type": "string",
                                "description": "The created Client Secret"
                            },
                            "clientSecretData": {
                                $ref: '#/definitions/IdentityUniversalAuthClientSecretData'
                            }
                        },
                        "description": "Details of the created Client Secret"
                    }
                }
            }
        }
    */
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

/**
 * Return list of client secret details for identity universal auth method on identity with id [identityId]
 * @param req 
 * @param res 
 */
export const getUniversalAuthClientSecretsDetails = async (req: Request, res: Response) => {
    /*
        #swagger.summary = 'List Universal Auth Client Secrets for identity'
        #swagger.description = 'List Universal Auth Client Secrets for identity'

        #swagger.security = [{
            "bearerAuth": []
        }]
        
        #swagger.parameters['identityId'] = {
            "description": "ID of identity for which to get Client Secrets for",
            "required": true,
            "type": "string",
            "in": "path"
        }

        #swagger.responses[200] = {
            content: {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "clientSecretData": {
                                type: "array",
                                items: {
                                    $ref: '#/definitions/IdentityUniversalAuthClientSecretData'
                                }
                            }
                        },
                        "description": "Details of the Client Secrets"
                    }
                }
            }
        }
    */
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

/**
 * Revoke client secret for identity universal auth method on identity with id [identityId]
 * @param req 
 * @param res 
 */
export const revokeUniversalAuthClientSecret = async (req: Request, res: Response) => {
    /*
        #swagger.summary = 'Revoke Universal Auth Client Secret for identity'
        #swagger.description = 'Revoke Universal Auth Client Secret for identity'

        #swagger.security = [{
            "bearerAuth": []
        }]
        
        #swagger.parameters['identityId'] = {
            "description": "ID of identity under which Client Secret was issued for",
            "required": true,
            "type": "string",
            "in": "path"
        }

        #swagger.parameters['clientSecretId'] = {
            "description": "ID of Client Secret to revoke",
            "required": true,
            "type": "string",
            "in": "path"
        }

        #swagger.responses[200] = {
            content: {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "clientSecretData": {
                                $ref: '#/definitions/IdentityUniversalAuthClientSecretData'
                            }
                        },
                        "description": "Details of the revoked Client Secret"
                    }
                }
            }
        }
    */
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