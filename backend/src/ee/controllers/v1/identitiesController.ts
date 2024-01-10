import { Request, Response } from "express";
import { Types } from "mongoose";
import {
    IIdentity,
    Identity,
    IdentityAccessToken,
    IdentityMembership,
    IdentityMembershipOrg,
    IdentityUniversalAuth,
    IdentityUniversalAuthClientSecret,
    Organization
} from "../../../models";
import {
    EventType,
    IRole,
    Role
} from "../../models";
import { validateRequest } from "../../../helpers/validation";
import * as reqValidator from "../../../validation/identities";
import {
    getAuthDataOrgPermissions,
    getOrgRolePermissions,
    isAtLeastAsPrivilegedOrg
} from "../../services/RoleService";
import {
    BadRequestError,
    ForbiddenRequestError,
    ResourceNotFoundError,
} from "../../../utils/errors";
import { ADMIN, CUSTOM, MEMBER, NO_ACCESS } from "../../../variables";
import {
    OrgPermissionActions,
    OrgPermissionSubjects
} from "../../services/RoleService";
import { EEAuditLogService } from "../../services";
import { ForbiddenError } from "@casl/ability";

/**
 * Create identity
 * @param req 
 * @param res 
 * @returns 
 */
export const createIdentity = async (req: Request, res: Response) => {
    /*
        #swagger.summary = 'Create identity'
        #swagger.description = 'Create identity'

        #swagger.security = [{
            "bearerAuth": []
        }]
        
        #swagger.requestBody = {
            content: {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "Name of entity to create",
                                "example": "development"
                            },
                            "organizationId": {
                                "type": "string",
                                "description": "ID of organization where to create identity",
                                "example": "dev-environment"
                            },
                            "role": {
                                "type": "string",
                                "description": "Role to assume for organization membership",
                                "example": "no-access"
                            }
                        },
                        "required": ["name", "organizationId", "role"]
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
                            "identity": {
                                $ref: '#/definitions/Identity'
                            }
                        },
                        "description": "Details of the created identity"
                    }
                }
            }
        }
    */
    const {
        body: {
            name,
            organizationId,
            role
        }
    } = await validateRequest(reqValidator.CreateIdentityV1, req);

    const { permission } = await getAuthDataOrgPermissions({
        authData: req.authData,
        organizationId: new Types.ObjectId(organizationId)
    });

    ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionActions.Create,
        OrgPermissionSubjects.Identity
    );

    const rolePermission = await getOrgRolePermissions(role, organizationId);
    const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, rolePermission);

    if (!hasRequiredPrivileges) throw ForbiddenRequestError({
        message: "Failed to create a more privileged identity"
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
    
    const identity = await new Identity({
        name
    }).save();

    await new IdentityMembershipOrg({
        identity: identity._id,
        organization: new Types.ObjectId(organizationId),
        role: isCustomRole ? CUSTOM : role,
        customRole
    }).save();

    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.CREATE_IDENTITY,
            metadata: {
                identityId: identity._id.toString(),
                name
            }
        },
        {
            organizationId: new Types.ObjectId(organizationId)
        }
    );

    return res.status(200).send({
        identity
    });
}

/**
 * Update identity with id [identityId]
 * @param req 
 * @param res 
 * @returns 
 */
 export const updateIdentity = async (req: Request, res: Response) => {
    /*
        #swagger.summary = 'Update identity'
        #swagger.description = 'Update identity'

        #swagger.security = [{
            "bearerAuth": []
        }]

        #swagger.parameters['identityId'] = {
            "description": "ID of identity to update",
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
                            "name": {
                                "type": "string",
                                "description": "Name of entity to update to",
                                "example": "development"
                            },
                            "role": {
                                "type": "string",
                                "description": "Role to update to for organization membership",
                                "example": "no-access"
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
                            "identity": {
                                $ref: '#/definitions/Identity'
                            }
                        },
                        "description": "Details of the updated identity"
                    }
                }
            }
        }
    */
    const {
        params: { identityId  },
        body: {
            name,
            role
        }
    } = await validateRequest(reqValidator.UpdateIdentityV1, req);

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
        OrgPermissionActions.Edit,
        OrgPermissionSubjects.Identity
    );

    const identityRolePermission = await getOrgRolePermissions(
        identityMembershipOrg?.customRole?.slug ?? identityMembershipOrg.role,
        identityMembershipOrg.organization.toString()
    );
    const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, identityRolePermission);
    if (!hasRequiredPrivileges) throw ForbiddenRequestError({
        message: "Failed to update more privileged identity"
    });

    if (role) {
        const rolePermission = await getOrgRolePermissions(role, identityMembershipOrg.organization.toString());
        const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, rolePermission);

        if (!hasRequiredPrivileges) throw ForbiddenRequestError({
            message: "Failed to update identity to a more privileged role"
        });
    }

    let customRole;
    if (role) {
        const isCustomRole = ![ADMIN, MEMBER, NO_ACCESS].includes(role);
        if (isCustomRole) {
            customRole = await Role.findOne({
                slug: role,
                isOrgRole: true,
                organization: identityMembershipOrg.organization
            });

            if (!customRole) throw BadRequestError({ message: "Role not found" });
        }
    }

    const identity = await Identity.findByIdAndUpdate(
        identityId,
        {
            name,
        },
        {
            new: true
        }
    );

    if (!identity) throw BadRequestError({
        message: `Failed to update identity with id ${identityId}`
    });

    await IdentityMembershipOrg.findOneAndUpdate(
        {
            identity: identity._id
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
            type: EventType.UPDATE_IDENTITY,
            metadata: {
                identityId: identity._id.toString(),
                name: identity.name,
            }
        },
        {
            organizationId: identityMembershipOrg.organization
        }
    );

    return res.status(200).send({
        identity
    });
}

/**
 * Delete identity with id [identityId]
 * @param req 
 * @param res 
 * @returns 
 */
 export const deleteIdentity = async (req: Request, res: Response) => {
     /*
        #swagger.summary = 'Delete identity'
        #swagger.description = 'Delete identity'

        #swagger.security = [{
            "bearerAuth": []
        }]

        #swagger.parameters['identityId'] = {
            "description": "ID of identity",
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
                            "identity": {
                                $ref: '#/definitions/Identity'
                            }
                        },
                        "description": "Details of the deleted identity"
                    }
                }
            }
        }
    */
    const {
        params: { identityId }
    } = await validateRequest(reqValidator.DeleteIdentityV1, req);
    
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

    const identityRolePermission = await getOrgRolePermissions(
        identityMembershipOrg?.customRole?.slug ?? identityMembershipOrg.role,
        identityMembershipOrg.organization.toString()
    );
    const hasRequiredPrivileges = isAtLeastAsPrivilegedOrg(permission, identityRolePermission);
    if (!hasRequiredPrivileges) throw ForbiddenRequestError({
        message: "Failed to delete more privileged identity"
    });

    const identity = await Identity.findByIdAndDelete(identityMembershipOrg.identity);
    if (!identity) throw ResourceNotFoundError({
        message: `Identity with id ${identityId} not found`
    });

    await IdentityMembershipOrg.findByIdAndDelete(identityMembershipOrg._id);

    await IdentityMembership.deleteMany({
        identity: identityMembershipOrg.identity
    });
    
    await IdentityUniversalAuth.deleteMany({
        identity: identityMembershipOrg.identity
    });
    
    await IdentityUniversalAuthClientSecret.deleteMany({
        identity: identityMembershipOrg.identity
    });
    
    await IdentityAccessToken.deleteMany({
        identity: identityMembershipOrg.identity
    });

    await EEAuditLogService.createAuditLog(
        req.authData,
        {
            type: EventType.DELETE_IDENTITY,
            metadata: {
                identityId: identity._id.toString()
            }
        },
        {
            organizationId: identityMembershipOrg.organization
        }
    );

    return res.status(200).send({
        identity
    });
}





