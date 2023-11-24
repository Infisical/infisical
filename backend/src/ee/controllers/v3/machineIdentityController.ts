import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import { Types } from "mongoose";
import {
    IMachineIdentityTrustedIp,
    MachineIdentity,
    MachineMembership,
    MachineMembershipOrg,
    Organization,
} from "../../../models";
import {
    ActorType,
    EventType,
    Role
} from "../../models";
import { validateRequest } from "../../../helpers/validation";
import * as reqValidator from "../../../validation/machineIdentity";
import { createToken } from "../../../helpers/auth";


import { BadRequestError, ResourceNotFoundError, UnauthorizedRequestError } from "../../../utils/errors";
import { extractIPDetails, isValidIpOrCidr } from "../../../utils/ip";
import { EEAuditLogService, EELicenseService } from "../../services";
import { getAuthSecret } from "../../../config";
import { ADMIN, AuthTokenType, CUSTOM, MEMBER } from "../../../variables";

/**
 * Return machine identity access and refresh token as per refresh operation
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
    
    let machineIdentity = await MachineIdentity.findOne({
        _id: new Types.ObjectId(decodedToken.serviceTokenDataId),
        isActive: true
    });
    
    if (!machineIdentity) throw UnauthorizedRequestError();

    if (decodedToken.tokenVersion !== machineIdentity.tokenVersion) {
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

    if (machineIdentity.isRefreshTokenRotationEnabled) {
        machineIdentity = await MachineIdentity.findByIdAndUpdate(
            machineIdentity._id,
            {
                $inc: {
                    tokenVersion: 1
                }
            },
            {
                new: true
            }
        );
        
        if (!machineIdentity) throw BadRequestError();
        
        response.refresh_token = createToken({
            payload: {
                serviceTokenDataId: machineIdentity._id.toString(),
                authTokenType: AuthTokenType.SERVICE_REFRESH_TOKEN,
                tokenVersion: machineIdentity.tokenVersion
            },
            secret: await getAuthSecret()
        });
    }

    response.access_token = createToken({
        payload: {
            serviceTokenDataId: machineIdentity._id.toString(),
            authTokenType: AuthTokenType.SERVICE_ACCESS_TOKEN,
            tokenVersion: machineIdentity.tokenVersion
        },
        expiresIn: machineIdentity.accessTokenTTL,
        secret: await getAuthSecret()
    });

    response.expires_in = machineIdentity.accessTokenTTL;

    await MachineIdentity.findByIdAndUpdate(
        machineIdentity._id,
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
 * Create machine identity
 * @param req 
 * @param res 
 * @returns 
 */
export const createMachineIdentity = async (req: Request, res: Response) => {
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
    } = await validateRequest(reqValidator.CreateMachineIdentityV3, req);

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
    const machineIdentity = await new MachineIdentity({
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
    
    await new MachineMembershipOrg({
        machineIdentity: machineIdentity._id,
        organization: machineIdentity.organization,
        role: isCustomRole ? CUSTOM : role,
        customRole
    }).save();
    
    const refreshToken = createToken({
        payload: {
            serviceTokenDataId: machineIdentity._id.toString(),
            authTokenType: AuthTokenType.SERVICE_REFRESH_TOKEN,
            tokenVersion: machineIdentity.tokenVersion
        },
        secret: await getAuthSecret()
    });
    
    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.CREATE_MACHINE_IDENTITY,
            metadata: {
                name,
                isActive,
                role,
                trustedIps: reformattedTrustedIps as Array<IMachineIdentityTrustedIp>,
                expiresAt
            }
        },
        {
            organizationId: new Types.ObjectId(organizationId)
        }
    );
    
    return res.status(200).send({
        machineIdentity,
        refreshToken
    });
}

/**
 * Update service token V3 data with id [serviceTokenDataId]
 * @param req 
 * @param res 
 * @returns 
 */
export const updateMachineIdentity = async (req: Request, res: Response) => {
    const {
        params: { machineId },
        body: { 
            name, 
            isActive,
            role,
            trustedIps,
            expiresIn,
            accessTokenTTL,
            isRefreshTokenRotationEnabled
        }
    } = await validateRequest(reqValidator.UpdateMachineIdentityV3, req);

    let machineIdentity = await MachineIdentity.findById(machineId);
    if (!machineIdentity) throw ResourceNotFoundError({ 
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
                organization: machineIdentity.organization
            });
            
            if (!customRole) throw BadRequestError({ message: "Role not found" });
        }
    }

    const plan = await EELicenseService.getPlan(machineIdentity.organization);

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
    
    machineIdentity = await MachineIdentity.findByIdAndUpdate(
        machineId,
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

    if (!machineIdentity) throw BadRequestError({
        message: "Failed to update service token"
    });
    
    await MachineMembershipOrg.findOneAndUpdate(
        {
            machineIdentity: machineIdentity._id
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
            type: EventType.UPDATE_MACHINE_IDENTITY,
            metadata: {
                name: machineIdentity.name,
                isActive,
                role,
                trustedIps: reformattedTrustedIps as Array<IMachineIdentityTrustedIp>,
                expiresAt
            }
        },
        {
            organizationId: machineIdentity.organization
        }
    );

    return res.status(200).send({
        machineIdentity
    }); 
}

/**
 * Delete service token data with id [serviceTokenDataId]
 * @param req 
 * @param res 
 * @returns 
 */
export const deleteMachineIdentity = async (req: Request, res: Response) => {
    const {
        params: { machineId }
    } = await validateRequest(reqValidator.DeleteMachineIdentityV3, req);
    
    let machineIdentity = await MachineIdentity.findById(machineId);
    if (!machineIdentity) throw ResourceNotFoundError({ 
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
    
    machineIdentity = await MachineIdentity.findByIdAndDelete(machineId);
    
    if (!machineIdentity) throw BadRequestError({
        message: "Failed to delete service token"
    });

    const machineMembershipOrg = await MachineMembershipOrg.findOneAndDelete({
        machineIdentity: machineIdentity._id,
    });
    
    if (!machineMembershipOrg) throw BadRequestError({
        message: "Failed to delete service token"
    });
    
    await MachineMembership.deleteMany({
        machineIdentity: machineIdentity._id,
    });
    
    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.DELETE_MACHINE_IDENTITY,
            metadata: {
                name: machineIdentity.name,
                isActive: machineIdentity.isActive,
                role: machineMembershipOrg.role,
                trustedIps: machineIdentity.trustedIps as Array<IMachineIdentityTrustedIp>,
                expiresAt: machineIdentity.expiresAt
            }
        },
        {
            organizationId: machineIdentity.organization
        }
    );

    return res.status(200).send({
        machineIdentity
    }); 
}