import { Request, Response } from "express";
import { Types } from "mongoose";
import { Membership, MembershipOrg, ServiceAccount, Workspace } from "../../models";
import { deleteMembershipOrg } from "../../helpers/membershipOrg";
import { updateSubscriptionOrgQuantity } from "../../helpers/organization";
import Role from "../../models/role";
import { BadRequestError } from "../../utils/errors";
import { CUSTOM } from "../../variables";

/**
 * Return memberships for organization with id [organizationId]
 * @param req
 * @param res
 */
export const getOrganizationMemberships = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Return organization memberships'
    #swagger.description = 'Return organization memberships'
    
    #swagger.security = [{
        "apiKeyAuth": []
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
  const { organizationId } = req.params;

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
    #swagger.summary = 'Update organization membership'
    #swagger.description = 'Update organization membership'
    
    #swagger.security = [{
        "apiKeyAuth": []
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
  const { membershipId } = req.params;
  const { role } = req.body;

  const isCustomRole = !["admin", "member", "owner"].includes(role);
  if (isCustomRole) {
    const orgRole = await Role.findOne({ slug: role, isOrgRole: true });
    if (!orgRole) throw BadRequestError({ message: "Role not found" });

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
      role
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
    #swagger.summary = 'Delete organization membership'
    #swagger.description = 'Delete organization membership'
    
    #swagger.security = [{
        "apiKeyAuth": []
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
  const { membershipId } = req.params;

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
        "apiKeyAuth": []
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
  const { organizationId } = req.params;

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

  const workspaces = (
    await Membership.find({
      user: req.user._id
    }).populate("workspace")
  )
    .filter((m) => workspacesSet.has(m.workspace._id.toString()))
    .map((m) => m.workspace);

  return res.status(200).send({
    workspaces
  });
};

/**
 * Return service accounts for organization with id [organizationId]
 * @param req
 * @param res
 */
export const getOrganizationServiceAccounts = async (req: Request, res: Response) => {
  const { organizationId } = req.params;

  const serviceAccounts = await ServiceAccount.find({
    organization: new Types.ObjectId(organizationId)
  });

  return res.status(200).send({
    serviceAccounts
  });
};
