import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { Types } from 'mongoose';
import {
    MembershipOrg,
    Membership,
    Workspace,
    ServiceAccount
} from '../../models';
import { deleteMembershipOrg } from '../../helpers/membershipOrg';
import {
    updateSubscriptionOrgQuantity,
    deleteOrganization as deleteOrg
} from '../../helpers/organization';

/**
 * Return memberships for organization with id [organizationId]
 * @param req
 * @param res
 */
export const getOrganizationMemberships = async (
    req: Request,
    res: Response
) => {
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
    let memberships;
    try {
        const { organizationId } = req.params;

        memberships = await MembershipOrg.find({
            organization: organizationId
        }).populate('user', '+publicKey');
    } catch (err) {
        Sentry.setUser({ email: req.user.email });
        Sentry.captureException(err);
        return res.status(400).send({
            message: 'Failed to get organization memberships'
        });
    }

    return res.status(200).send({
        memberships
    });
};

/**
 * Update role of membership with id [membershipId] to role [role]
 * @param req
 * @param res
 */
export const updateOrganizationMembership = async (
    req: Request,
    res: Response
) => {
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
    let membership;
    try {
        const { membershipId } = req.params;
        const { role } = req.body;

        membership = await MembershipOrg.findByIdAndUpdate(
            membershipId,
            {
                role
            },
            {
                new: true
            }
        );
    } catch (err) {
        Sentry.setUser({ email: req.user.email });
        Sentry.captureException(err);
        return res.status(400).send({
            message: 'Failed to update organization membership'
        });
    }

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
export const deleteOrganizationMembership = async (
    req: Request,
    res: Response
) => {
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
    let membership;
    try {
        const { membershipId } = req.params;

        // delete organization membership
        membership = await deleteMembershipOrg({
            membershipOrgId: membershipId
        });

        await updateSubscriptionOrgQuantity({
            organizationId: membership.organization.toString()
        });
    } catch (err) {
        Sentry.setUser({ email: req.user.email });
        Sentry.captureException(err);
        return res.status(400).send({
            message: 'Failed to delete organization membership'
        });
    }

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
export const getOrganizationWorkspaces = async (
    req: Request,
    res: Response
) => {
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
                '_id'
            )
        ).map((w) => w._id.toString())
    );

    const workspaces = (
        await Membership.find({
            user: req.user._id
        }).populate('workspace')
    )
        .filter((m) => workspacesSet.has(m.workspace._id.toString()))
        .map((m) => m.workspace);

    return res.status(200).send({
        workspaces
    });
};

/**
 * Delete organization with id [organizationId]
 * @param req
 * @param res
 * @returns
 */
export const deleteOrganization = async (req: Request, res: Response) => {
    let organization;
    try {
        const { organizationId } = req.params;

        organization = await deleteOrg({
            email: req.user.email,
            orgId: organizationId
        });
    } catch (err) {
        Sentry.setUser({ email: req.user.email });
        Sentry.captureException(err);
        return res.status(400).send({
            message: 'Failed to delete organization'
        });
    }

    return res.status(200).send({
        organization
    });
};

/**
 * Return service accounts for organization with id [organizationId]
 * @param req
 * @param res
 */
export const getOrganizationServiceAccounts = async (
    req: Request,
    res: Response
) => {
    const { organizationId } = req.params;

    const serviceAccounts = await ServiceAccount.find({
        organization: new Types.ObjectId(organizationId)
    });

    return res.status(200).send({
        serviceAccounts
    });
};
