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
import { 
    getOrgRolePermissions, 
    getUserOrgPermissions, 
    isAtLeastAsPrivilegedOrg 
} from "../../services/RoleService";
import { BadRequestError, ForbiddenRequestError, ResourceNotFoundError, UnauthorizedRequestError } from "../../../utils/errors";
import { extractIPDetails, isValidIpOrCidr } from "../../../utils/ip";
import { EEAuditLogService, EELicenseService } from "../../services";
import { getAuthSecret } from "../../../config";
import { ADMIN, AuthTokenType, CUSTOM, MEMBER } from "../../../variables";
import {
    OrgPermissionActions,
    OrgPermissionSubjects
} from "../../services/RoleService";
import { ForbiddenError } from "@casl/ability";

/**
 * Return machine identity access and refresh token as per refresh operation
 * @param req 
 * @param res 
 */
 export const refreshToken = async (req: Request, res: Response) => {
    const {
        body: {
            refreshToken
        }
    } = await validateRequest(reqValidator.RefreshTokenV3, req);

    const decodedToken = <jwt.ServiceRefreshTokenJwtPayload>(
		jwt.verify(refreshToken, await getAuthSecret())
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
        refreshToken?: string;
        accessToken: string;
        expiresIn: number;
        tokenType: string;
    } = {
        refreshToken,
        accessToken: "",
        expiresIn: 0,
        tokenType: "Bearer"
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
        
        response.refreshToken = createToken({
            payload: {
                serviceTokenDataId: machineIdentity._id.toString(),
                authTokenType: AuthTokenType.SERVICE_REFRESH_TOKEN,
                tokenVersion: machineIdentity.tokenVersion
            },
            secret: await getAuthSecret()
        });
    }

    response.accessToken = createToken({
        payload: {
            serviceTokenDataId: machineIdentity._id.toString(), // TODO: fix this
            authTokenType: AuthTokenType.SERVICE_ACCESS_TOKEN,
            tokenVersion: machineIdentity.tokenVersion
        },
        expiresIn: machineIdentity.accessTokenTTL,
        secret: await getAuthSecret()
    });

    response.expiresIn = machineIdentity.accessTokenTTL;

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
    
    const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
    
    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Create,
        OrgPermissionSubjects.MachineIdentity
    );

    const rolePermission = await getOrgRolePermissions(role, organizationId);
    const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, rolePermission);
    
    if (!hasRequiredPrivileges) throw ForbiddenRequestError({
        message: "Failed to create a more privileged MI"
    });

    const organization = await Organization.findById(organizationId);
    if (!organization) throw BadRequestError({ message: `Organization with id ${organizationId} not found` });

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
            serviceTokenDataId: machineIdentity._id.toString(), // TODO: update
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
 * Update machine identity with id [machineId]
 * @param req 
 * @param res 
 * @returns 
 */
export const updateMachineIdentity = async (req: Request, res: Response) => {
    const {
        params: { machineId },
        body: { 
            name, 
            role,
            trustedIps,
            expiresIn,
            accessTokenTTL,
            isRefreshTokenRotationEnabled
        }
    } = await validateRequest(reqValidator.UpdateMachineIdentityV3, req);

    let machineIdentity = await MachineIdentity.findById(machineId);
    if (!machineIdentity) throw ResourceNotFoundError({ 
        message: `Machine identity with id ${machineId} not found`
    });

    const { permission } = await getUserOrgPermissions(req.user._id, machineIdentity.organization.toString());
    
    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Edit,
        OrgPermissionSubjects.MachineIdentity
    );

    if (role) {
        const rolePermission = await getOrgRolePermissions(role, machineIdentity.organization.toString());
        const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, rolePermission);
        
        if (!hasRequiredPrivileges) throw ForbiddenRequestError({
            message: "Failed to update MI to a more privileged role"
        });
    }

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
        message: `Failed to update machine identity with id ${machineId}`
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
 * Delete machine identity with id [machineId]
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
        message: `Machine identity with id ${machineId} not found`
    });

    const { permission } = await getUserOrgPermissions(req.user._id, machineIdentity.organization.toString());
    
    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Delete,
        OrgPermissionSubjects.MachineIdentity
    );
    
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