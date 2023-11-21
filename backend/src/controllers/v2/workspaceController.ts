import { Request, Response } from "express";
import { Types } from "mongoose";
import { Key, Membership, ServiceTokenData, Workspace } from "../../models";
import {
  pullSecrets as pull,
  v2PushSecrets as push,
  reformatPullSecrets
} from "../../helpers/secret";
import { pushKeys } from "../../helpers/key";
import { EventService, TelemetryService } from "../../services";
import { eventPushSecrets } from "../../events";
import { EEAuditLogService } from "../../ee/services";
import { EventType } from "../../ee/models";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { ForbiddenError } from "@casl/ability";

interface V2PushSecret {
  type: string; // personal or shared
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretKeyHash: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  secretValueHash: string;
  secretCommentCiphertext?: string;
  secretCommentIV?: string;
  secretCommentTag?: string;
  secretCommentHash?: string;
}

/**
 * Upload (encrypted) secrets to workspace with id [workspaceId]
 * for environment [environment]
 * @param req
 * @param res
 * @returns
 */
export const pushWorkspaceSecrets = async (req: Request, res: Response) => {
  // upload (encrypted) secrets to workspace with id [workspaceId]
  const postHogClient = await TelemetryService.getPostHogClient();
  let { secrets }: { secrets: V2PushSecret[] } = req.body;
  const { keys, environment, channel } = req.body;
  const { workspaceId } = req.params;

  // validate environment
  const workspaceEnvs = req.membership.workspace.environments;
  if (!workspaceEnvs.find(({ slug }: { slug: string }) => slug === environment)) {
    throw new Error("Failed to validate environment");
  }

  // sanitize secrets
  secrets = secrets.filter(
    (s: V2PushSecret) => s.secretKeyCiphertext !== "" && s.secretValueCiphertext !== ""
  );

  await push({
    userId: req.user._id,
    workspaceId,
    environment,
    secrets,
    channel: channel ? channel : "cli",
    ipAddress: req.realIP
  });

  await pushKeys({
    userId: req.user._id,
    workspaceId,
    keys
  });

  if (postHogClient) {
    postHogClient.capture({
      event: "secrets pushed",
      distinctId: req.user.email,
      properties: {
        numberOfSecrets: secrets.length,
        environment,
        workspaceId,
        channel: channel ? channel : "cli"
      }
    });
  }

  // trigger event - push secrets
  EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath: "/"
    })
  });

  return res.status(200).send({
    message: "Successfully uploaded workspace secrets"
  });
};

/**
 * Return (encrypted) secrets for workspace with id [workspaceId]
 * for environment [environment]
 * @param req
 * @param res
 * @returns
 */
export const pullSecrets = async (req: Request, res: Response) => {
  let secrets;
  const postHogClient = await TelemetryService.getPostHogClient();
  const environment: string = req.query.environment as string;
  const channel: string = req.query.channel as string;
  const { workspaceId } = req.params;

  let userId;
  if (req.user) {
    userId = req.user._id.toString();
  } else if (req.serviceTokenData) {
    userId = req.serviceTokenData.user.toString();
  }
  // validate environment
  const workspaceEnvs = req.membership.workspace.environments;
  if (!workspaceEnvs.find(({ slug }: { slug: string }) => slug === environment)) {
    throw new Error("Failed to validate environment");
  }

  secrets = await pull({
    userId,
    workspaceId,
    environment,
    channel: channel ? channel : "cli",
    ipAddress: req.realIP
  });

  if (channel !== "cli") {
    secrets = reformatPullSecrets({ secrets });
  }

  if (postHogClient) {
    // capture secrets pushed event in production
    postHogClient.capture({
      distinctId: req.user.email,
      event: "secrets pulled",
      properties: {
        numberOfSecrets: secrets.length,
        environment,
        workspaceId,
        channel: channel ? channel : "cli"
      }
    });
  }

  return res.status(200).send({
    secrets
  });
};

export const getWorkspaceKey = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Return encrypted project key'
    #swagger.description = 'Return encrypted project key'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

	#swagger.parameters['workspaceId'] = {
		"description": "ID of project",
		"required": true,
		"type": "string"
	} 

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
                    "type": "array",
                    "items": {
                        $ref: "#/components/schemas/ProjectKey" 
                    },
                    "description": "Encrypted project key for the given project"
                }
            }           
        }
    }   
    */
  const {
    params: { workspaceId }
  } = await validateRequest(reqValidator.GetWorkspaceKeyV2, req);

  const key = await Key.findOne({
    workspace: workspaceId,
    receiver: req.user._id
  }).populate("sender", "+publicKey");

  if (!key) throw new Error("Failed to find workspace key");

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.GET_WORKSPACE_KEY,
      metadata: {
        keyId: key._id.toString()
      }
    },
    {
      workspaceId: new Types.ObjectId(workspaceId)
    }
  );

  return res.status(200).json(key);
};

export const getWorkspaceServiceTokenData = async (req: Request, res: Response) => {
  const { workspaceId } = req.params;

  const serviceTokenData = await ServiceTokenData.find({
    workspace: workspaceId
  }).select("+encryptedKey +iv +tag");

  return res.status(200).send({
    serviceTokenData
  });
};

/**
 * Return memberships for workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const getWorkspaceMemberships = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Return project memberships'
    #swagger.description = 'Return project memberships'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

	#swagger.parameters['workspaceId'] = {
		"description": "ID of project",
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
								$ref: "#/components/schemas/Membership" 
							},
							"description": "Memberships of project"
						}
					}
                }
            }           
        }
    }   
    */
  const {
    params: { workspaceId }
  } = await validateRequest(reqValidator.GetWorkspaceMembershipsV2, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Member
  );

  const memberships = await Membership.find({
    workspace: workspaceId
  }).populate("user", "+publicKey");

  return res.status(200).send({
    memberships
  });
};

/**
 * Update role of membership with id [membershipId] to role [role]
 * @param req
 * @param res
 * @returns
 */
export const updateWorkspaceMembership = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Update project membership'
    #swagger.description = 'Update project membership'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

	#swagger.parameters['workspaceId'] = {
		"description": "ID of project",
		"required": true,
		"type": "string"
	} 

	#swagger.parameters['membershipId'] = {
		"description": "ID of project membership to update",
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
                    "description": "Role of membership - either admin or member",
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
							$ref: "#/components/schemas/Membership",
							"description": "Updated membership"
						}
					}
                }
            }           
        }
    }   
    */
  const {
    params: { workspaceId, membershipId },
    body: { role }
  } = await validateRequest(reqValidator.UpdateWorkspaceMembershipsV2, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.Member
  );

  const membership = await Membership.findByIdAndUpdate(
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
 * Delete workspace membership with id [membershipId]
 * @param req
 * @param res
 * @returns
 */
export const deleteWorkspaceMembership = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Delete project membership'
    #swagger.description = 'Delete project membership'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

	#swagger.parameters['workspaceId'] = {
		"description": "ID of project",
		"required": true,
		"type": "string"
	} 

	#swagger.parameters['membershipId'] = {
		"description": "ID of project membership to delete",
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
							$ref: "#/components/schemas/Membership",
							"description": "Deleted membership"
						}
					}
                }
            }           
        }
    }   
    */
  const {
    params: { workspaceId, membershipId }
  } = await validateRequest(reqValidator.DeleteWorkspaceMembershipsV2, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.Member
  );

  const membership = await Membership.findByIdAndDelete(membershipId);

  if (!membership) throw new Error("Failed to delete workspace membership");

  await Key.deleteMany({
    receiver: membership.user,
    workspace: membership.workspace
  });

  return res.status(200).send({
    membership
  });
};

/**
 * Change autoCapitilzation Rule of workspace
 * @param req
 * @param res
 * @returns
 */
export const toggleAutoCapitalization = async (req: Request, res: Response) => {
  const {
    params: { workspaceId },
    body: { autoCapitalization }
  } = await validateRequest(reqValidator.ToggleAutoCapitalizationV2, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.Settings
  );

  const workspace = await Workspace.findOneAndUpdate(
    {
      _id: workspaceId
    },
    {
      autoCapitalization
    },
    {
      new: true
    }
  );

  return res.status(200).send({
    message: "Successfully changed autoCapitalization setting",
    workspace
  });
};
