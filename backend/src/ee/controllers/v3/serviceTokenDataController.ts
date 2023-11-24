import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import { Types } from "mongoose";
import {
    ServiceTokenDataV3,
    ServiceTokenDataV3Key, // TODO: remove
    Organization,
    ServiceMembershipOrg,
    ServiceMembership
} from "../../../models";
import { IServiceTokenV3TrustedIp } from "../../../models/serviceTokenDataV3";
import {
    ActorType,
    EventType,
    Role
} from "../../models";
import { validateRequest } from "../../../helpers/validation";
import * as reqValidator from "../../../validation/serviceTokenDataV3";
import { createToken } from "../../../helpers/auth";


import { BadRequestError, ResourceNotFoundError, UnauthorizedRequestError } from "../../../utils/errors";
import { extractIPDetails, isValidIpOrCidr } from "../../../utils/ip";
import { EEAuditLogService, EELicenseService } from "../../services";
import { getAuthSecret } from "../../../config";
import { ADMIN, AuthTokenType, CUSTOM, MEMBER } from "../../../variables";

/**
 * Return access and refresh token as per refresh operation
 * @param req 
 * @param res 
 */
 export const refreshToken = async (req: Request, res: Response) => {
    const {
        body: {
            refresh_token
        }
    } = await validateRequest(reqValidator.RefreshTokenV3, req);

    const decodedToken = <jwt.ServiceRefreshTokenJwtPayload>(
		jwt.verify(refresh_token, await getAuthSecret())
	);
    
    if (decodedToken.authTokenType !== AuthTokenType.SERVICE_REFRESH_TOKEN) throw UnauthorizedRequestError();
    
    let serviceTokenData = await ServiceTokenDataV3.findOne({
        _id: new Types.ObjectId(decodedToken.serviceTokenDataId),
        isActive: true
    });
    
    if (!serviceTokenData) throw UnauthorizedRequestError();

    if (decodedToken.tokenVersion !== serviceTokenData.tokenVersion) {
        // raise alarm
        throw UnauthorizedRequestError();
    }
    
    const response: {
        refresh_token?: string;
        access_token: string;
        expires_in: number;
        token_type: string;
    } = {
        refresh_token,
        access_token: "",
        expires_in: 0,
        token_type: "Bearer"
    };

    if (serviceTokenData.isRefreshTokenRotationEnabled) {
        serviceTokenData = await ServiceTokenDataV3.findByIdAndUpdate(
            serviceTokenData._id,
            {
                $inc: {
                    tokenVersion: 1
                }
            },
            {
                new: true
            }
        );
        
        if (!serviceTokenData) throw BadRequestError();
        
        response.refresh_token = createToken({
            payload: {
                serviceTokenDataId: serviceTokenData._id.toString(),
                authTokenType: AuthTokenType.SERVICE_REFRESH_TOKEN,
                tokenVersion: serviceTokenData.tokenVersion
            },
            secret: await getAuthSecret()
        });
    }

    response.access_token = createToken({
        payload: {
            serviceTokenDataId: serviceTokenData._id.toString(),
            authTokenType: AuthTokenType.SERVICE_ACCESS_TOKEN,
            tokenVersion: serviceTokenData.tokenVersion
        },
        expiresIn: serviceTokenData.accessTokenTTL,
        secret: await getAuthSecret()
    });

    response.expires_in = serviceTokenData.accessTokenTTL;

    await ServiceTokenDataV3.findByIdAndUpdate(
        serviceTokenData._id,
        {
            refreshTokenLastUsed: new Date(),
            $inc: { refreshTokenUsageCount: 1 }
        },
        {
            new: true
        }
    );
    
    return res.status(200).send(response);
}

/**
 * Create service token data V3
 * @param req 
 * @param res 
 * @returns 
 */
export const createServiceTokenData = async (req: Request, res: Response) => {
    const {
        body: { 
            name, 
            organizationId, 
            role,
            trustedIps,
            expiresIn, 
            accessTokenTTL,
            isRefreshTokenRotationEnabled
        }
    } = await validateRequest(reqValidator.CreateServiceTokenV3, req);

    // const { permission } = await getAuthDataProjectPermissions({
    //     authData: req.authData,
    //     workspaceId: new Types.ObjectId(workspaceId)
    //   });

    // ForbiddenError.from(permission).throwUnlessCan(
    //     ProjectPermissionActions.Create,
    //     ProjectPermissionSub.ServiceTokens
    // );
    
    // const workspace = await Workspace.findById(workspaceId);
    // if (!workspace) throw BadRequestError({ message: "Workspace not found" });

    const organization = await Organization.findById(organizationId);
    if (!organization) throw BadRequestError({ message: "Organization not found" });

    const isCustomRole = ![ADMIN, MEMBER].includes(role);
    
    let customRole;
    if (isCustomRole) {
        customRole = await Role.findOne({
            slug: role,
            isOrgRole: true,
            organization: new Types.ObjectId(organizationId)
        });
        
        if (!customRole) throw BadRequestError({ message: "Role not found" });
    }

    const plan = await EELicenseService.getPlan(new Types.ObjectId(organizationId));
    
    // validate trusted ips
    const reformattedTrustedIps = trustedIps.map((trustedIp) => {
        if (!plan.ipAllowlisting && trustedIp.ipAddress !== "0.0.0.0/0") return res.status(400).send({
            message: "Failed to add IP access range to service token due to plan restriction. Upgrade plan to add IP access range."
        });

        const isValidIPOrCidr = isValidIpOrCidr(trustedIp.ipAddress);
        
        if (!isValidIPOrCidr) return res.status(400).send({
            message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });
        
        return extractIPDetails(trustedIp.ipAddress);
    });
    
    let expiresAt;
    if (expiresIn) {
        expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
    }
    
    let user;
    if (req.authData.actor.type === ActorType.USER) {
        user = req.authData.authPayload._id;
    }
    
    const isActive = true;
    const serviceTokenData = await new ServiceTokenDataV3({
        name,
        user,
        organization: new Types.ObjectId(organizationId),
        refreshTokenUsageCount: 0,
        accessTokenUsageCount: 0,
        tokenVersion: 1,
        trustedIps: reformattedTrustedIps,
        isActive,
        expiresAt,
        accessTokenTTL,
        isRefreshTokenRotationEnabled
    }).save();
    
    await new ServiceMembershipOrg({
        service: serviceTokenData._id,
        organization: serviceTokenData.organization,
        role: isCustomRole ? CUSTOM : role,
        customRole
    }).save();
    
    const refreshToken = createToken({
        payload: {
            serviceTokenDataId: serviceTokenData._id.toString(),
            authTokenType: AuthTokenType.SERVICE_REFRESH_TOKEN,
            tokenVersion: serviceTokenData.tokenVersion
        },
        secret: await getAuthSecret()
    });
    
    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.CREATE_SERVICE_TOKEN_V3,
            metadata: {
                name,
                isActive,
                role,
                trustedIps: reformattedTrustedIps as Array<IServiceTokenV3TrustedIp>,
                expiresAt
            }
        },
        {
            organizationId: new Types.ObjectId(organizationId)
        }
    );
    
    return res.status(200).send({
        serviceTokenData,
        refreshToken
    });
}

/**
 * Update service token V3 data with id [serviceTokenDataId]
 * @param req 
 * @param res 
 * @returns 
 */
export const updateServiceTokenData = async (req: Request, res: Response) => {
    const {
        params: { serviceTokenDataId },
        body: { 
            name, 
            isActive,
            role, // bring this somewhere else?
            trustedIps,
            expiresIn,
            accessTokenTTL,
            isRefreshTokenRotationEnabled
        }
    } = await validateRequest(reqValidator.UpdateServiceTokenV3, req);

    let serviceTokenData = await ServiceTokenDataV3.findById(serviceTokenDataId);
    if (!serviceTokenData) throw ResourceNotFoundError({ 
        message: "Service token not found" 
    });
    
    // const { permission } = await getAuthDataProjectPermissions({
    //     authData: req.authData,
    //     workspaceId: serviceTokenData.workspace
    // });
    
    // ForbiddenError.from(permission).throwUnlessCan(
    //     ProjectPermissionActions.Edit,
    //     ProjectPermissionSub.ServiceTokens
    // );

    // const workspace = await Workspace.findById(serviceTokenData.workspace);
    // if (!workspace) throw BadRequestError({ message: "Workspace not found" });

    let customRole;
    if (role) {
        const isCustomRole = ![ADMIN, MEMBER].includes(role);
        if (isCustomRole) {
            customRole = await Role.findOne({
                slug: role,
                isOrgRole: true,
                organization: serviceTokenData.organization
            });
            
            if (!customRole) throw BadRequestError({ message: "Role not found" });
        }
    }

    const plan = await EELicenseService.getPlan(serviceTokenData.organization);

    // validate trusted ips
    let reformattedTrustedIps;
    if (trustedIps) {
        reformattedTrustedIps = trustedIps.map((trustedIp) => {
            if (!plan.ipAllowlisting && trustedIp.ipAddress !== "0.0.0.0/0") return res.status(400).send({
                message: "Failed to update IP access range to service token due to plan restriction. Upgrade plan to update IP access range."
            });

            const isValidIPOrCidr = isValidIpOrCidr(trustedIp.ipAddress);
            
            if (!isValidIPOrCidr) return res.status(400).send({
                message: "The IP is not a valid IPv4, IPv6, or CIDR block"
            });
            
            return extractIPDetails(trustedIp.ipAddress);
        });
    }

    let expiresAt;
    if (expiresIn) {
        expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
    }
    
    serviceTokenData = await ServiceTokenDataV3.findByIdAndUpdate(
        serviceTokenDataId,
        {
            name,
            isActive,
            
            trustedIps: reformattedTrustedIps,
            expiresAt,
            accessTokenTTL,
            isRefreshTokenRotationEnabled
        },
        {
            new: true
        }
    );

    if (!serviceTokenData) throw BadRequestError({
        message: "Failed to update service token"
    });
    
    await ServiceMembershipOrg.findOneAndUpdate(
        {
            service: serviceTokenData._id
        },
        {
            role: customRole ? CUSTOM : role,
            ...(customRole ? {
                customRole 
            } : {}),
            ...(role && !customRole ? { // non-custom role
                $unset: {
                    customRole: 1
                }
            } : {})
        },
        {
            new: true
        }
    );

    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.UPDATE_SERVICE_TOKEN_V3,
            metadata: {
                name: serviceTokenData.name,
                isActive,
                role,
                trustedIps: reformattedTrustedIps as Array<IServiceTokenV3TrustedIp>,
                expiresAt
            }
        },
        {
            organizationId: serviceTokenData.organization
        }
    );

    return res.status(200).send({
        serviceTokenData
    }); 
}

/**
 * Delete service token data with id [serviceTokenDataId]
 * @param req 
 * @param res 
 * @returns 
 */
export const deleteServiceTokenData = async (req: Request, res: Response) => {
    const {
        params: { serviceTokenDataId }
    } = await validateRequest(reqValidator.DeleteServiceTokenV3, req);
    
    let serviceTokenData = await ServiceTokenDataV3.findById(serviceTokenDataId);
    if (!serviceTokenData) throw ResourceNotFoundError({ 
        message: "Service token not found" 
    });
    
    // const { permission } = await getAuthDataProjectPermissions({
    //     authData: req.authData,
    //     workspaceId: serviceTokenData.workspace
    // });
    
    // ForbiddenError.from(permission).throwUnlessCan(
    //     ProjectPermissionActions.Delete,
    //     ProjectPermissionSub.ServiceTokens
    // );
    
    serviceTokenData = await ServiceTokenDataV3.findByIdAndDelete(serviceTokenDataId);
    
    if (!serviceTokenData) throw BadRequestError({
        message: "Failed to delete service token"
    });

    const serviceMembershipOrg = await ServiceMembershipOrg.findOneAndDelete({
        service: serviceTokenData._id,
    });
    
    if (!serviceMembershipOrg) throw BadRequestError({
        message: "Failed to delete service token"
    });

    await ServiceTokenDataV3Key.findOneAndDelete({
        serviceTokenData: serviceTokenData._id
    });
    
    await ServiceMembership.deleteMany({
        service: serviceTokenData._id,
    });
    
    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.DELETE_SERVICE_TOKEN_V3,
            metadata: {
                name: serviceTokenData.name,
                isActive: serviceTokenData.isActive,
                role: serviceMembershipOrg.role,
                trustedIps: serviceTokenData.trustedIps as Array<IServiceTokenV3TrustedIp>,
                expiresAt: serviceTokenData.expiresAt
            }
        },
        {
            organizationId: serviceTokenData.organization
        }
    );

    return res.status(200).send({
        serviceTokenData
    }); 
}