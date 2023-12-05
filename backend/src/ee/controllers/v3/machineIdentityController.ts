import bcrypt from "bcrypt";
import crypto from "crypto";
import { Request, Response } from "express";
import { Types } from "mongoose";
import {
    IMachineIdentity,
    IMachineIdentityClientSecret,
    IMachineIdentityTrustedIp,
    MachineIdentity,
    MachineIdentityClientSecret,
    MachineMembership,
    MachineMembershipOrg,
    Organization,
} from "../../../models";
import {
    ActorType,
    EventType,
    IRole,
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
import { 
    BadRequestError, 
    ForbiddenRequestError, 
    ResourceNotFoundError, 
    UnauthorizedRequestError 
} from "../../../utils/errors";
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
import { getUserAgentType } from "../../../utils/posthog";

const packageClientSecretData = (machineIdentityClientSecret: IMachineIdentityClientSecret) => ({
    _id: machineIdentityClientSecret._id,
    machineIdentity: machineIdentityClientSecret.machineIdentity,
    isActive: machineIdentityClientSecret.isActive,
    description: machineIdentityClientSecret.description,
    clientSecretPrefix: machineIdentityClientSecret.clientSecretPrefix,
    clientSecretNumUses: machineIdentityClientSecret.clientSecretNumUses,
    clientSecretNumUsesLimit: machineIdentityClientSecret.clientSecretNumUsesLimit,
    clientSecretTTL: machineIdentityClientSecret.clientSecretTTL
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
    }).populate<{ 
        machineIdentity: IMachineIdentity,
        customRole: IRole 
    }>("machineIdentity customRole");
    
    if (!machineMembershipOrg) throw ResourceNotFoundError();

    const { permission } = await getUserOrgPermissions(req.user._id, machineMembershipOrg.organization.toString());
    
    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Read,
        OrgPermissionSubjects.MachineIdentity
    );

    const rolePermission = await getOrgRolePermissions(
        machineMembershipOrg?.customRole?.slug ?? machineMembershipOrg.role, 
        machineMembershipOrg.organization.toString()
    );
    const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, rolePermission);
    
    if (!hasRequiredPrivileges) throw ForbiddenRequestError({
        message: "Failed to get client secrets for more privileged MI"
    });

    const clientSecretData = await MachineIdentityClientSecret
        .find({
            machineIdentity: machineMembershipOrg.machineIdentity,
            isActive: true
        })
        .sort({ createdAt: -1 })
        .limit(5);
    
    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.GET_MACHINE_IDENTITY_CLIENT_SECRETS,
            metadata: {
                machineId: machineMembershipOrg.machineIdentity._id.toString(),
                clientId: machineMembershipOrg.machineIdentity.clientId,
            }
        },
        {
            organizationId: machineMembershipOrg.organization
        }
    );

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
            numUsesLimit
        }
    } = await validateRequest(reqValidator.CreateClientSecretV3, req);
    
    const machineMembershipOrg = await MachineMembershipOrg.findOne({
        machineIdentity: new Types.ObjectId(machineId)
    }).populate<{ 
        machineIdentity: IMachineIdentity,
        customRole: IRole
    }>("machineIdentity customRole");
    
    if (!machineMembershipOrg) throw ResourceNotFoundError();

    const { permission } = await getUserOrgPermissions(req.user._id, machineMembershipOrg.organization.toString());
    
    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Create,
        OrgPermissionSubjects.MachineIdentity
    );

    const rolePermission = await getOrgRolePermissions(
        machineMembershipOrg?.customRole?.slug ?? machineMembershipOrg.role, 
        machineMembershipOrg.organization.toString()
    );
    const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, rolePermission);
    
    if (!hasRequiredPrivileges) throw ForbiddenRequestError({
        message: "Failed to create client secret for more privileged MI"
    });

    const clientSecret = crypto.randomBytes(32).toString("hex");
    const clientSecretHash = await bcrypt.hash(clientSecret, await getSaltRounds());
    
    const machineIdentityClientSecret = await new MachineIdentityClientSecret({
        machineIdentity: machineMembershipOrg.machineIdentity,
        isActive: true,
        description,
        clientSecretPrefix: clientSecret.slice(0, 4),
        clientSecretHash,
        clientSecretNumUses: 0,
        clientSecretNumUsesLimit: numUsesLimit,
        clientSecretTTL: ttl,
        accessTokenVersion: 1,
    }).save();

    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.CREATE_MACHINE_IDENTITY_CLIENT_SECRET,
            metadata: {
                machineId: machineMembershipOrg.machineIdentity._id.toString(),
                clientId: machineMembershipOrg.machineIdentity.clientId,
                clientSecretId: machineIdentityClientSecret._id.toString()
            }
        },
        {
            organizationId: machineMembershipOrg.organization
        }
    );
    
    return res.status(200).send({
        clientSecret,
        clientSecretData: packageClientSecretData(machineIdentityClientSecret)
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

    const machineMembershipOrg = await MachineMembershipOrg
        .findOne({
            machineIdentity: new Types.ObjectId(machineId)
        })
        .populate<{ 
            machineIdentity: IMachineIdentity,
            customRole: IRole
        }>("machineIdentity customRole");
    
    if (!machineMembershipOrg) throw ResourceNotFoundError({
        message: `Failed to find machine identity with id ${machineId}`
    });

    const { permission } = await getUserOrgPermissions(req.user._id, machineMembershipOrg.organization.toString());
    
    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Delete,
        OrgPermissionSubjects.MachineIdentity
    );

    const rolePermission = await getOrgRolePermissions(
        machineMembershipOrg?.customRole?.slug ?? machineMembershipOrg.role, 
        machineMembershipOrg.organization.toString()
    );
    const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, rolePermission);
    
    if (!hasRequiredPrivileges) throw ForbiddenRequestError({
        message: "Failed to delete client secrets for more privileged MI"
    });
    
    const machineIdentityClientSecret = await MachineIdentityClientSecret.findOneAndDelete({
        _id: clientSecretId,
        machineIdentity: machineId
    });
    
    if (!machineIdentityClientSecret) throw ResourceNotFoundError();

    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.DELETE_MACHINE_IDENTITY_CLIENT_SECRET,
            metadata: {
                machineId: machineMembershipOrg.machineIdentity._id.toString(),
                clientId: machineMembershipOrg.machineIdentity.clientId,
                clientSecretId: clientSecretId
            }
        },
        {
            organizationId: machineMembershipOrg.organization
        }
    );

    return res.status(200).send({
        clientSecretData: packageClientSecretData(machineIdentityClientSecret)
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

    const clientSecretData = await MachineIdentityClientSecret.find({
        machineIdentity: machineIdentity._id,
        isActive: true
    });
    
    let validatedClientSecretDatum: IMachineIdentityClientSecret | undefined;
    
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
        const expiresAt = new Date(new Date().getTime() + clientSecretTTL * 1000);
        
        if (expiresAt < new Date()) {
            await MachineIdentityClientSecret.findByIdAndUpdate(
                validatedClientSecretDatum._id,
                {
                    isActive: false
                }
            );
    
            throw UnauthorizedRequestError({
                message: "Failed to authenticate MI credentials due to expired client secret"
            });
        }
    }
    
    if (clientSecretNumUses > 0 && clientSecretNumUses === clientSecretNumUsesLimit) {
        // number of times client secret can be used for 
        // a login operation reached
        await MachineIdentityClientSecret.findByIdAndUpdate(
            validatedClientSecretDatum._id,
            {
                isActive: false
            },
            {
                new: true
            }
        );

        throw UnauthorizedRequestError({
            message: "Failed to authenticate MI credentials due to client secret number of uses limit reached"
        });
    }

    // increment usage count by 1
    await MachineIdentityClientSecret.findByIdAndUpdate(
        validatedClientSecretDatum._id,
        {
            $inc: { clientSecretNumUses: 1 }
        },
        {
            new: true
        }
    );

    // token version
    const accessToken = createToken({
        payload: {
            machineId: machineIdentity._id.toString(),
            clientSecretDataId: validatedClientSecretDatum._id.toString(),
            authTokenType: AuthTokenType.MACHINE_ACCESS_TOKEN,
            tokenVersion: validatedClientSecretDatum.accessTokenVersion
        },
        expiresIn: machineIdentity.accessTokenTTL,
        secret: await getAuthSecret()
    });

    const userAgent = req.headers["user-agent"] ?? "";

    await EEAuditLogService.createAuditLog(
        {
            actor: {
                type: ActorType.MACHINE,
                metadata: {
                    machineId: machineIdentity._id.toString(),
                    name: machineIdentity.name
                }
            },
            authPayload: machineIdentity,
            ipAddress: req.realIP,
            userAgent,
            userAgentType: getUserAgentType(userAgent)
        },
        {
            type: EventType.LOGIN_MACHINE_IDENTITY,
            metadata: {
                machineId: machineIdentity._id.toString(),
                clientId,
                clientSecretId: validatedClientSecretDatum._id.toString()
            }
        },
        {
            organizationId: machineIdentity.organization
        }
    );

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

    const machineMembershipOrg = await MachineMembershipOrg
        .findOne({
            machineIdentity: new Types.ObjectId(machineId)
        })
        .populate<{ 
            machineIdentity: IMachineIdentity, 
            customRole: IRole 
        }>("machineIdentity customRole");
    
    if (!machineMembershipOrg) throw ResourceNotFoundError({
        message: `Failed to find machine identity with id ${machineId}`
    });

    const { permission } = await getUserOrgPermissions(req.user._id, machineMembershipOrg.organization.toString());
    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Edit,
        OrgPermissionSubjects.MachineIdentity
    );

    const machineIdentityRolePermission = await getOrgRolePermissions(
        machineMembershipOrg?.customRole?.slug ?? machineMembershipOrg.role, 
        machineMembershipOrg.organization.toString()
    );
    const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, machineIdentityRolePermission);
    if (!hasRequiredPrivileges) throw ForbiddenRequestError({
        message: "Failed to update more privileged MI"
    });
    
    if (role) {
        const rolePermission = await getOrgRolePermissions(role, machineMembershipOrg.organization.toString());
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
                organization: machineMembershipOrg.organization
            });
            
            if (!customRole) throw BadRequestError({ message: "Role not found" });
        }
    }

    const plan = await EELicenseService.getPlan(machineMembershipOrg.organization);

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
    
    const machineIdentity = await MachineIdentity.findByIdAndUpdate(
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
    
    const machineMembershipOrg = await MachineMembershipOrg
        .findOne({
            machineIdentity: new Types.ObjectId(machineId)
        })
        .populate<{ 
            machineIdentity: IMachineIdentity, 
            customRole: IRole 
        }>("machineIdentity customRole");
    
    if (!machineMembershipOrg) throw ResourceNotFoundError({
        message: `Failed to find machine identity with id ${machineId}`
    });
    
    const { permission } = await getUserOrgPermissions(req.user._id, machineMembershipOrg.organization.toString());
    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Delete,
        OrgPermissionSubjects.MachineIdentity
    );

    const machineIdentityRolePermission = await getOrgRolePermissions(
        machineMembershipOrg?.customRole?.slug ?? machineMembershipOrg.role, 
        machineMembershipOrg.organization.toString()
    );
    const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, machineIdentityRolePermission);
    if (!hasRequiredPrivileges) throw ForbiddenRequestError({
        message: "Failed to delete more privileged MI"
    });
    
    const machineIdentity = await MachineIdentity.findByIdAndDelete(machineMembershipOrg.machineIdentity);
    if (!machineIdentity) throw ResourceNotFoundError({
        message: `Machine identity with id ${machineId} not found`
    });

    await MachineMembershipOrg.findByIdAndDelete(machineMembershipOrg._id);
    
    if (!machineMembershipOrg) throw BadRequestError({
        message: `Failed to delete machine identity with id ${machineId}`
    });
    
    await MachineMembership.deleteMany({
        machineIdentity: machineMembershipOrg.machineIdentity
    });
    
    await MachineIdentityClientSecret.deleteMany({
        machineIdentity: machineMembershipOrg.machineIdentity
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