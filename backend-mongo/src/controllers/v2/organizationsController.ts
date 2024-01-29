import { Request, Response } from "express";
import { Types } from "mongoose";
import { 
  IWorkspace,
  Identity,
  IdentityMembership,
  IdentityMembershipOrg, 
  Membership,
  MembershipOrg,
  User,
  Workspace
} from "../../models";
import { Role } from "../../ee/models";
import { deleteMembershipOrg } from "../../helpers/membershipOrg";
import {
  createOrganization as create,
  deleteOrganization,
  updateSubscriptionOrgQuantity
} from "../../helpers/organization";
import { addMembershipsOrg } from "../../helpers/membershipOrg";
import { BadRequestError, ResourceNotFoundError, UnauthorizedRequestError } from "../../utils/errors";
import { ACCEPTED, ADMIN, CUSTOM, MEMBER, NO_ACCESS } from "../../variables";
import * as reqValidator from "../../validation/organization";
import { validateRequest } from "../../helpers/validation";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  getAuthDataOrgPermissions
} from "../../ee/services/RoleService";
import { EELicenseService } from "../../ee/services";
import { ForbiddenError } from "@casl/ability";

/**
 * Return memberships for organization with id [organizationId]
 * @param req
 * @param res
 */
export const getOrganizationMemberships = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Return organization user memberships'
    #swagger.description = 'Return organization user memberships'
    
    #swagger.security = [{
        "apiKeyAuth": [],
        "bearerAuth": []
    }]

	#swagger.parameters['organizationId'] = {
		"description": "ID of organization",
		"required": true,
		"type": "string"
	} 

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
                    "type": "object",
					"properties": {
						"memberships": {
							"type": "array",
							"items": {
								$ref: "#/components/schemas/MembershipOrg" 
							},
							"description": "Memberships of organization"
						}
					}
                }
            }           
        }
    }   
    */
  const {
    params: { organizationId }
  } = await validateRequest(reqValidator.GetOrgMembersv2, req);

  const { permission } = await getAuthDataOrgPermissions({
    authData: req.authData,
    organizationId: new Types.ObjectId(organizationId)
  });
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.Member
  );

  const memberships = await MembershipOrg.find({
    organization: organizationId
  }).populate("user", "+publicKey");

  return res.status(200).send({
    memberships
  });
};

/**
 * Update role of membership with id [membershipId] to role [role]
 * @param req
 * @param res
 */
export const updateOrganizationMembership = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Update organization user membership'
    #swagger.description = 'Update organization user membership'
    
    #swagger.security = [{
        "apiKeyAuth": [],
        "bearerAuth": []
    }]

	#swagger.parameters['organizationId'] = {
		"description": "ID of organization",
		"required": true,
		"type": "string"
	} 

	#swagger.parameters['membershipId'] = {
		"description": "ID of organization membership to update",
		"required": true,
		"type": "string"
	} 

	#swagger.requestBody = {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
                "role": {
                    "type": "string",
                    "description": "Role of organization membership - either owner, admin, or member",
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
						"membership": {
							$ref: "#/components/schemas/MembershipOrg",
							"description": "Updated organization membership"
						}
					}
                }
            }           
        }
    }   
    */
  const {
    params: { organizationId, membershipId },
    body: { role }
  } = await validateRequest(reqValidator.UpdateOrgMemberv2, req);

  const { permission } = await getAuthDataOrgPermissions({
    authData: req.authData,
    organizationId: new Types.ObjectId(organizationId)
  });
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Edit,
    OrgPermissionSubjects.Member
  );

  const isCustomRole = ![ADMIN, MEMBER, NO_ACCESS].includes(role);
  if (isCustomRole) {
    const orgRole = await Role.findOne({ 
      slug: role, 
      isOrgRole: true,
      organization: new Types.ObjectId(organizationId)
    });

    if (!orgRole) throw BadRequestError({ message: "Role not found" });
    
    const plan = await EELicenseService.getPlan(new Types.ObjectId(organizationId));
    
    if (!plan.rbac) return res.status(400).send({
      message:
        "Failed to assign custom role due to RBAC restriction. Upgrade plan to assign custom role to member."
    });

    const membership = await MembershipOrg.findByIdAndUpdate(membershipId, {
      role: CUSTOM,
      customRole: orgRole
    });
    return res.status(200).send({
      membership
    });
  }

  const membership = await MembershipOrg.findByIdAndUpdate(
    membershipId,
    {
      $set: {
        role
      },
      $unset: {
        customRole: 1
      }
    },
    {
      new: true
    }
  );

  return res.status(200).send({
    membership
  });
};

/**
 * Delete organization membership with id [membershipId]
 * @param req
 * @param res
 * @returns
 */
export const deleteOrganizationMembership = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Delete organization user membership'
    #swagger.description = 'Delete organization user membership'
    
    #swagger.security = [{
        "apiKeyAuth": [],
        "bearerAuth": []
    }]

	#swagger.parameters['organizationId'] = {
		"description": "ID of organization",
		"required": true,
		"type": "string"
	} 

	#swagger.parameters['membershipId'] = {
		"description": "ID of organization membership to delete",
		"required": true,
		"type": "string"
	} 

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
					"type": "object",
					"properties": {
						"membership": {
							$ref: "#/components/schemas/MembershipOrg",
							"description": "Deleted organization membership"
						}
					}
                }
            }           
        }
    }   
    */
  const {
    params: { organizationId, membershipId }
  } = await validateRequest(reqValidator.DeleteOrgMemberv2, req);
  
  const membershipOrg = await MembershipOrg.findOne({
    _id: new Types.ObjectId(membershipId),
    organization: new Types.ObjectId(organizationId)
  });
  
  if (!membershipOrg) throw ResourceNotFoundError();
  
  const { permission } = await getAuthDataOrgPermissions({
    authData: req.authData,
    organizationId: membershipOrg.organization
  });
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Delete,
    OrgPermissionSubjects.Member
  );

  // delete organization membership
  const membership = await deleteMembershipOrg({
    membershipOrgId: membershipId
  });

  await updateSubscriptionOrgQuantity({
    organizationId: membership.organization.toString()
  });

  return res.status(200).send({
    membership
  });
};

/**
 * Return workspaces for organization with id [organizationId] that user has
 * access to
 * @param req
 * @param res
 */
export const getOrganizationWorkspaces = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Return projects in organization that user is part of'
    #swagger.description = 'Return projects in organization that user is part of'
    
    #swagger.security = [{
        "apiKeyAuth": [],
        "bearerAuth": []
    }]

	#swagger.parameters['organizationId'] = {
		"description": "ID of organization",
		"required": true,
		"type": "string"
	} 

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
                    "type": "object",
					"properties": {
						"workspaces": {
							"type": "array",
							"items": {
								$ref: "#/components/schemas/Project" 
							},
							"description": "Projects of organization"
						}
					}
                }
            }           
        }
    }   
    */
  
  const {
    params: { organizationId }
  } = await validateRequest(reqValidator.GetOrgWorkspacesv2, req);

  const { permission } = await getAuthDataOrgPermissions({
    authData: req.authData,
    organizationId: new Types.ObjectId(organizationId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.Workspace
  );

  const workspacesSet = new Set(
    (
      await Workspace.find(
        {
          organization: organizationId
        },
        "_id"
      )
    ).map((w) => w._id.toString())
  );

  let workspaces: IWorkspace[] = [];
  
  if (req.authData.authPayload instanceof Identity) {
    workspaces = (
      await IdentityMembership.find({
        identity: req.authData.authPayload._id
      }).populate<{ workspace: IWorkspace }>("workspace")
    )
      .filter((m) => workspacesSet.has(m.workspace._id.toString()))
      .map((m) => m.workspace);
  }
  
  if (req.authData.authPayload instanceof User) {
    workspaces = (
      await Membership.find({
        user: req.authData.authPayload._id
      }).populate<{ workspace: IWorkspace }>("workspace")
    )
      .filter((m) => workspacesSet.has(m.workspace._id.toString()))
      .map((m) => m.workspace);
  }

  return res.status(200).send({
    workspaces
  });
};

/**
 * Create new organization named [organizationName]
 * and add user as owner
 * @param req
 * @param res
 * @returns
 */
export const createOrganization = async (req: Request, res: Response) => {
  const {
    body: { name }
  } = await validateRequest(reqValidator.CreateOrgv2, req);

  // create organization and add user as member
  const organization = await create({
    email: req.user.email,
    name
  });

  await addMembershipsOrg({
    userIds: [req.user._id.toString()],
    organizationId: organization._id.toString(),
    roles: [ADMIN],
    statuses: [ACCEPTED]
  });

  return res.status(200).send({
    organization
  });
};

/**
 * Delete organization with id [organizationId]
 * @param req
 * @param res
 */
export const deleteOrganizationById = async (req: Request, res: Response) => {
  const {
    params: { organizationId }
  } = await validateRequest(reqValidator.DeleteOrgv2, req);

  const membershipOrg = await MembershipOrg.findOne({
    user: req.user._id,
    organization: new Types.ObjectId(organizationId),
    role: ADMIN
  });

  if (!membershipOrg) throw UnauthorizedRequestError();

  const organization = await deleteOrganization({
    organizationId: new Types.ObjectId(organizationId)
  });

  return res.status(200).send({
    organization
  });
};

/**
 * Return list of identity memberships for organization with id [organizationId]
 * @param req
 * @param res 
 * @returns 
 */
 export const getOrganizationIdentityMemberships = async (req: Request, res: Response) => {
   /*
    #swagger.summary = 'Return organization identity memberships'
    #swagger.description = 'Return organization identity memberships'

    #swagger.security = [{
        "bearerAuth": []
    }]
    
    #swagger.parameters['organizationId'] = {
        "description": "ID of organization",
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
                  "identityMemberships": {
                    "type": "array",
                    "items": {
                      $ref: "#/components/schemas/IdentityMembershipOrg" 
                    },
                    "description": "Identity memberships of organization"
                  }
                }
              }
            }           
        }
    }
  */
  const {
    params: { organizationId }
  } = await validateRequest(reqValidator.GetOrgIdentityMembershipsV2, req);

  const { permission } = await getAuthDataOrgPermissions({
    authData: req.authData,
    organizationId: new Types.ObjectId(organizationId)
  });
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.Identity
  );
 
  const identityMemberships = await IdentityMembershipOrg.find({
    organization: new Types.ObjectId(organizationId)
  }).populate("identity customRole");
  
  return res.status(200).send({
    identityMemberships
  });
}