import bcrypt from "bcrypt";
import crypto from "crypto";
import { Request, Response } from "express";
import { Types } from "mongoose";
import {
    IMachineIdentityClientSecretData,
    IMachineIdentityTrustedIp,
    MachineIdentity,
    MachineIdentityClientSecretData,
    MachineMembership,
    MachineMembershipOrg,
    Organization,
} from "../../../models";
import {
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
import { getAuthSecret, getSaltRounds } from "../../../config";
import { ADMIN, AuthTokenType, CUSTOM, MEMBER, NO_ACCESS } from "../../../variables";
import {
    OrgPermissionActions,
    OrgPermissionSubjects
} from "../../services/RoleService";
import { ForbiddenError } from "@casl/ability";
import { checkIPAgainstBlocklist } from "../../../utils/ip";

const packageClientSecretData = (clientSecretData: IMachineIdentityClientSecretData) => ({
    _id: clientSecretData._id,
    machineIdentity: clientSecretData.machineIdentity,
    isActive: clientSecretData.isActive,
    description: clientSecretData.description,
    clientSecretPrefix: clientSecretData.clientSecretPrefix,
    clientSecretUsageCount: clientSecretData.clientSecretUsageCount,
    clientSecretUsageLimit: clientSecretData.clientSecretUsageLimit,
    expiresAt: clientSecretData.expiresAt
});

/**
 * Return client secrets for machine with id [machineId]
 * @param req 
 * @param res 
 */
export const getMIClientSecrets = async (req: Request, res: Response) => {
    const {
        params: {
            machineId
        }
    } = await validateRequest(reqValidator.GetClientSecretsV3, req);

    const machineMembershipOrg = await MachineMembershipOrg.findOne({
        machineIdentity: new Types.ObjectId(machineId)
    });
    
    if (!machineMembershipOrg) throw ResourceNotFoundError();

    const { permission } = await getUserOrgPermissions(req.user._id, machineMembershipOrg.organization.toString());
    
    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Read,
        OrgPermissionSubjects.MachineIdentity
    );

    const rolePermission = await getOrgRolePermissions(machineMembershipOrg.role, machineMembershipOrg.organization.toString());
    const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, rolePermission);
    
    if (!hasRequiredPrivileges) throw ForbiddenRequestError({
        message: "Failed to get client secrets for more privileged MI"
    });

    const clientSecretData = await MachineIdentityClientSecretData
        .find({
            machineIdentity: machineMembershipOrg.machineIdentity,
            isActive: true
        })
        .sort({ createdAt: -1 })
        .limit(5);

    return res.status(200).send({
        clientSecretData: clientSecretData.map((clientSecretDatum) => packageClientSecretData(clientSecretDatum))
    });
}

/**
 * Create a new client secret for machine with id [machineId]
 * @param req 
 * @param res 
 */
export const createMIClientSecret = async (req: Request, res: Response) => {
    const {
        params: {
            machineId
        },
        body: {
            description,
            ttl,
            usageLimit
        }
    } = await validateRequest(reqValidator.CreateClientSecretV3, req);
    
    const machineMembershipOrg = await MachineMembershipOrg.findOne({
        machineIdentity: new Types.ObjectId(machineId)
    });
    
    if (!machineMembershipOrg) throw ResourceNotFoundError();

    const { permission } = await getUserOrgPermissions(req.user._id, machineMembershipOrg.organization.toString());
    
    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Create,
        OrgPermissionSubjects.MachineIdentity
    );

    const rolePermission = await getOrgRolePermissions(machineMembershipOrg.role, machineMembershipOrg.organization.toString());
    const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, rolePermission);
    
    if (!hasRequiredPrivileges) throw ForbiddenRequestError({
        message: "Failed to create client secret for more privileged MI"
    });
    
    let expiresAt;
    if (ttl > 0) {
        expiresAt = new Date(new Date().getTime() + ttl * 1000);
    }

    const clientSecret = crypto.randomBytes(32).toString("hex");
    const clientSecretHash = await bcrypt.hash(clientSecret, await getSaltRounds());
    
    const machineIdentityClientSecretData = await new MachineIdentityClientSecretData({
        machineIdentity: machineMembershipOrg.machineIdentity,
        isActive: true,
        description,
        clientSecretPrefix: clientSecret.slice(0, 4),
        clientSecretHash,
        clientSecretUsageCount: 0,
        clientSecretUsageLimit: usageLimit,
        accessTokenVersion: 1,
        expiresAt
    }).save();
    
    return res.status(200).send({
        clientSecret,
        clientSecretData: packageClientSecretData(machineIdentityClientSecretData)
    });
}

/**
 * Delete client secret with id [clientSecretId]
 * @param req 
 * @param res 
 */
export const deleteMIClientSecret = async (req: Request, res: Response) => {
    const {
        params: {
            machineId,
            clientSecretId
        }
    } = await validateRequest(reqValidator.DeleteClientSecretV3, req);

    const machineMembershipOrg = await MachineMembershipOrg.findOne({
        machineIdentity: new Types.ObjectId(machineId)
    });
    
    if (!machineMembershipOrg) throw ResourceNotFoundError();

    const { permission } = await getUserOrgPermissions(req.user._id, machineMembershipOrg.organization.toString());
    
    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Delete,
        OrgPermissionSubjects.MachineIdentity
    );

    const rolePermission = await getOrgRolePermissions(machineMembershipOrg.role, machineMembershipOrg.organization.toString());
    const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, rolePermission);
    
    if (!hasRequiredPrivileges) throw ForbiddenRequestError({
        message: "Failed to delete client secrets for more privileged MI"
    });
    
    const clientSecretData = await MachineIdentityClientSecretData.findOneAndDelete({
        _id: clientSecretId,
        machineIdentity: machineId
    });
    
    if (!clientSecretData) throw ResourceNotFoundError();

    return res.status(200).send({
        clientSecretData: packageClientSecretData(clientSecretData)
    })
}

/**
 * Return access token for machine identity with client id [clientId]
 * and client secret [clientSecret]
 * @param req 
 * @param res 
 */
export const loginMI = async (req: Request, res: Response) => {
    const {
        body: {
            clientId,
            clientSecret
        }
    } = await validateRequest(reqValidator.LoginMachineIdentityV3, req);
    
    const machineIdentity = await MachineIdentity.findOne({
        clientId,
        isActive: true
    });
    
    if (!machineIdentity) throw UnauthorizedRequestError();
    
    checkIPAgainstBlocklist({
        ipAddress: req.realIP,
        trustedIps: machineIdentity.clientSecretTrustedIps
    });

    const clientSecretData = await MachineIdentityClientSecretData.find({
        machineIdentity: machineIdentity._id,
        isActive: true
    });
    
    let validatedClientSecretDatum: IMachineIdentityClientSecretData | undefined;
    
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
        expiresAt,
        clientSecretUsageCount,
        clientSecretUsageLimit
    } = validatedClientSecretDatum;
    
    if (expiresAt && new Date(expiresAt) < new Date()) {
        // client secret expired
        await MachineIdentityClientSecretData.findByIdAndUpdate(
            validatedClientSecretDatum._id,
            {
                isActive: false
            },
            {
                new: true
            }
        );

        throw UnauthorizedRequestError();
    }
    
    if (clientSecretUsageLimit > 0 && clientSecretUsageCount === clientSecretUsageLimit) {
        // number of times client secret can be used for 
        // a login operation reached
        await MachineIdentityClientSecretData.findByIdAndUpdate(
            validatedClientSecretDatum._id,
            {
                isActive: false
            },
            {
                new: true
            }
        );

        throw UnauthorizedRequestError();
    }

    // increment usage count by 1
    await MachineIdentityClientSecretData.findByIdAndUpdate(
        validatedClientSecretDatum._id,
        {
            $inc: { clientSecretUsageCount: 1 }
        },
        {
            new: true
        }
    );

    // token version
    const accessToken = createToken({
        payload: {
            machineId: machineIdentity._id.toString(), // consider changing to clientId and making it more extensible
            clientSecretDataId: validatedClientSecretDatum._id.toString(),
            authTokenType: AuthTokenType.MACHINE_ACCESS_TOKEN,
            tokenVersion: validatedClientSecretDatum.accessTokenVersion
        },
        expiresIn: machineIdentity.accessTokenTTL,
        secret: await getAuthSecret()
    });

    return res.status(200).send({
        accessToken,
        expiresIn: machineIdentity.accessTokenTTL,
        tokenType: "Bearer"
    });
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
            clientSecretTrustedIps,
            accessTokenTrustedIps,
            accessTokenTTL,
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

    const isCustomRole = ![ADMIN, MEMBER, NO_ACCESS].includes(role);
    
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
    
    const isActive = true;
    const machineIdentity = await new MachineIdentity({
        clientId: crypto.randomUUID(),
        name,
        organization: new Types.ObjectId(organizationId),
        isActive,
        accessTokenTTL,
        accessTokenUsageCount: 0,
        clientSecretTrustedIps: reformattedClientSecretTrustedIps,
        accessTokenTrustedIps: reformattedAccessTokenTrustedIps,
    }).save();
    
    await new MachineMembershipOrg({
        machineIdentity: machineIdentity._id,
        organization: machineIdentity.organization,
        role: isCustomRole ? CUSTOM : role,
        customRole
    }).save();
    
    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.CREATE_MACHINE_IDENTITY,
            metadata: {
                name,
                isActive,
                role,
                clientSecretTrustedIps: reformattedClientSecretTrustedIps as Array<IMachineIdentityTrustedIp>,
                accessTokenTrustedIps: reformattedAccessTokenTrustedIps as Array<IMachineIdentityTrustedIp>
            }
        },
        {
            organizationId: new Types.ObjectId(organizationId)
        }
    );
    
    return res.status(200).send({
        machineIdentity
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
            clientSecretTrustedIps,
            accessTokenTrustedIps,
            accessTokenTTL
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
        const isCustomRole = ![ADMIN, MEMBER, NO_ACCESS].includes(role);
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

    // validate client secret trusted ips
    let reformattedClientSecretTrustedIps;
    if (clientSecretTrustedIps) {
        reformattedClientSecretTrustedIps = clientSecretTrustedIps.map((clientSecretTrustedIp) => {
            if (!plan.ipAllowlisting && clientSecretTrustedIp.ipAddress !== "0.0.0.0/0") return res.status(400).send({
                message: "Failed to update IP access range to service token due to plan restriction. Upgrade plan to update IP access range."
            });

            const isValidIPOrCidr = isValidIpOrCidr(clientSecretTrustedIp.ipAddress);
            
            if (!isValidIPOrCidr) return res.status(400).send({
                message: "The IP is not a valid IPv4, IPv6, or CIDR block"
            });
            
            return extractIPDetails(clientSecretTrustedIp.ipAddress);
        });
    }

    // validate access token trusted ips
    let reformattedAccessTokenTrustedIps;
    if (accessTokenTrustedIps) {
        reformattedAccessTokenTrustedIps = accessTokenTrustedIps.map((accessTokenTrustedIp) => {
            if (!plan.ipAllowlisting && accessTokenTrustedIp.ipAddress !== "0.0.0.0/0") return res.status(400).send({
                message: "Failed to update IP access range to service token due to plan restriction. Upgrade plan to update IP access range."
            });

            const isValidIPOrCidr = isValidIpOrCidr(accessTokenTrustedIp.ipAddress);
            
            if (!isValidIPOrCidr) return res.status(400).send({
                message: "The IP is not a valid IPv4, IPv6, or CIDR block"
            });
            
            return extractIPDetails(accessTokenTrustedIp.ipAddress);
        });
    }
    
    machineIdentity = await MachineIdentity.findByIdAndUpdate(
        machineId,
        {
            name,
            clientSecretTrustedIps: reformattedClientSecretTrustedIps,
            accessTokenTrustedIps: reformattedAccessTokenTrustedIps,
            accessTokenTTL
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
                clientSecretTrustedIps: reformattedClientSecretTrustedIps as Array<IMachineIdentityTrustedIp>,
                accessTokenTrustedIps: reformattedAccessTokenTrustedIps as Array<IMachineIdentityTrustedIp>
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
    
    await MachineIdentityClientSecretData.deleteMany({
        machineIdentity: machineIdentity._id
    });
    
    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.DELETE_MACHINE_IDENTITY,
            metadata: {
                name: machineIdentity.name,
                isActive: machineIdentity.isActive,
                role: machineMembershipOrg.role,
                clientSecretTrustedIps: machineIdentity.clientSecretTrustedIps as Array<IMachineIdentityTrustedIp>,
                accessTokenTrustedIps: machineIdentity.accessTokenTrustedIps as Array<IMachineIdentityTrustedIp>,
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