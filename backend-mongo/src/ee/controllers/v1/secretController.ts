import { ForbiddenError, subject } from "@casl/ability";
import { Request, Response } from "express";
import { validateRequest } from "../../../helpers/validation";
import { Folder, Secret } from "../../../models";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../services/ProjectRoleService";
import { BadRequestError } from "../../../utils/errors";
import * as reqValidator from "../../../validation";
import { SecretVersion } from "../../models";
import { EESecretService } from "../../services";
import { getFolderWithPathFromId } from "../../../services/FolderService";

/**
 * Return secret versions for secret with id [secretId]
 * @param req
 * @param res
 */
export const getSecretVersions = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Return secret versions'
    #swagger.description = 'Return secret versions'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

	#swagger.parameters['secretId'] = {
		"description": "ID of secret",
		"required": true,
		"type": "string"
	} 

	#swagger.parameters['offset'] = {
		"description": "Number of versions to skip",
		"required": false,
		"type": "string"
	}

	#swagger.parameters['limit'] = {
		"description": "Maximum number of versions to return",
		"required": false,
		"type": "string"
	}

    #swagger.responses[200] = {
        content: {
            "application/json": {
                schema: { 
                    "type": "object",
					"properties": {
						"secretVersions": {
							"type": "array",
							"items": {
								$ref: "#/components/schemas/SecretVersion" 
							},
							"description": "Secret versions"
						}
					}
                }
            }           
        }
    }   
    */
  const {
    params: { secretId },
    query: { offset, limit }
  } = await validateRequest(reqValidator.GetSecretVersionsV1, req);

  const secret = await Secret.findById(secretId);
  if (!secret) {
    throw BadRequestError({ message: "Failed to find secret" });
  }

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: secret.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.SecretRollback
  );

  const secretVersions = await SecretVersion.find({
    secret: secretId
  })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit);

  return res.status(200).send({
    secretVersions
  });
};

/**
 * Roll back secret with id [secretId] to version [version]
 * @param req
 * @param res
 * @returns
 */
export const rollbackSecretVersion = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Roll back secret to a version.'
    #swagger.description = 'Roll back secret to a version.'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

	#swagger.parameters['secretId'] = {
		"description": "ID of secret",
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
                "version": {
                    "type": "integer",
                    "description": "Version of secret to roll back to"
                }
            }
          }
        }
      }
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                schema: { 
                    "type": "object",
					"properties": {
						"secret": {
							"type": "object",
							$ref: "#/components/schemas/Secret",
							"description": "Secret rolled back to"
						}
					}
                }
            }           
        }
    }   
    */

  const {
    params: { secretId },
    body: { version }
  } = await validateRequest(reqValidator.RollbackSecretVersionV1, req);

  const toBeUpdatedSec = await Secret.findById(secretId);
  if (!toBeUpdatedSec) {
    throw BadRequestError({ message: "Failed to find secret" });
  }

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: toBeUpdatedSec.workspace
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.SecretRollback
  );

  // validate secret version
  const oldSecretVersion = await SecretVersion.findOne({
    secret: secretId,
    version
  }).select("+secretBlindIndex");

  if (!oldSecretVersion) throw new Error("Failed to find secret version");

  const {
    workspace,
    type,
    user,
    environment,
    secretBlindIndex,
    secretKeyCiphertext,
    secretKeyIV,
    secretKeyTag,
    secretValueCiphertext,
    secretValueIV,
    secretValueTag,
    algorithm,
    folder,
    keyEncoding
  } = oldSecretVersion;

  let secretPath = "/";
  const folders = await Folder.findOne({ workspace, environment });
  if (folders)
    secretPath = getFolderWithPathFromId(folders.nodes, folder || "root")?.folderPath || "/";
  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Edit,
    subject(ProjectPermissionSub.Secrets, { environment: toBeUpdatedSec.environment, secretPath })
  );

  // update secret
  const secret = await Secret.findByIdAndUpdate(
    secretId,
    {
      $inc: {
        version: 1
      },
      workspace,
      type,
      user,
      environment,
      ...(secretBlindIndex ? { secretBlindIndex } : {}),
      secretKeyCiphertext,
      secretKeyIV,
      secretKeyTag,
      secretValueCiphertext,
      secretValueIV,
      secretValueTag,
      folderId: folder,
      algorithm,
      keyEncoding
    },
    {
      new: true
    }
  );

  if (!secret) throw new Error("Failed to find and update secret");

  // add new secret version
  await new SecretVersion({
    secret: secretId,
    version: secret.version,
    workspace,
    type,
    user,
    environment,
    isDeleted: false,
    ...(secretBlindIndex ? { secretBlindIndex } : {}),
    secretKeyCiphertext,
    secretKeyIV,
    secretKeyTag,
    secretValueCiphertext,
    secretValueIV,
    secretValueTag,
    folder,
    algorithm,
    keyEncoding
  }).save();

  // take secret snapshot
  await EESecretService.takeSecretSnapshot({
    workspaceId: secret.workspace,
    environment,
    folderId: folder
  });

  return res.status(200).send({
    secret
  });
};
