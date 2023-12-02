import { Request, Response } from "express";
import { Types } from "mongoose";
import { EventService, SecretService } from "../../services";
import { eventPushSecrets } from "../../events";
import { BotService } from "../../services";
import { containsGlobPatterns, repackageSecretToRaw } from "../../helpers/secrets";
import { encryptSymmetric128BitHexKeyUTF8 } from "../../utils/crypto";
import { getAllImportedSecrets } from "../../services/SecretImportService";
import { Folder, IServiceTokenData, Membership, ServiceTokenData, User } from "../../models";
import { getFolderByPath } from "../../services/FolderService";
import { BadRequestError } from "../../utils/errors";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/secrets";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { ForbiddenError, subject } from "@casl/ability";
import { validateServiceTokenDataClientForWorkspace } from "../../validation";
import { PERMISSION_READ_SECRETS, PERMISSION_WRITE_SECRETS } from "../../variables";
import { ActorType } from "../../ee/models";
import { UnauthorizedRequestError } from "../../utils/errors";
import { AuthData } from "../../interfaces/middleware";
import {
  generateSecretApprovalRequest,
  getSecretPolicyOfBoard
} from "../../ee/services/SecretApprovalService";
import { CommitType } from "../../ee/models/secretApprovalRequest";
import { logger } from "../../utils/logging";
import { createReminder, deleteReminder } from "../../helpers/reminder";

const checkSecretsPermission = async ({
  authData,
  workspaceId,
  environment,
  secretPath,
  secretAction
}: {
  authData: AuthData;
  workspaceId: string;
  environment: string;
  secretPath: string;
  secretAction: ProjectPermissionActions; // CRUD
}): Promise<{
  authVerifier: (env: string, secPath: string) => boolean;
}> => {
  let STV2RequiredPermissions = [];

  switch (secretAction) {
    case ProjectPermissionActions.Create:
      STV2RequiredPermissions = [PERMISSION_WRITE_SECRETS];
      break;
    case ProjectPermissionActions.Read:
      STV2RequiredPermissions = [PERMISSION_READ_SECRETS];
      break;
    case ProjectPermissionActions.Edit:
      STV2RequiredPermissions = [PERMISSION_WRITE_SECRETS];
      break;
    case ProjectPermissionActions.Delete:
      STV2RequiredPermissions = [PERMISSION_WRITE_SECRETS];
      break;
  }

  switch (authData.actor.type) {
    case ActorType.USER: {
      const { permission } = await getAuthDataProjectPermissions({
        authData,
        workspaceId: new Types.ObjectId(workspaceId)
      });

      ForbiddenError.from(permission).throwUnlessCan(
        secretAction,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath })
      );
      return {
        authVerifier: (env: string, secPath: string) =>
          permission.can(
            secretAction,
            subject(ProjectPermissionSub.Secrets, {
              environment: env,
              secretPath: secPath
            })
          )
      };
    }
    case ActorType.SERVICE: {
      await validateServiceTokenDataClientForWorkspace({
        serviceTokenData: authData.authPayload as IServiceTokenData,
        workspaceId: new Types.ObjectId(workspaceId),
        environment,
        secretPath,
        requiredPermissions: STV2RequiredPermissions
      });
      return { authVerifier: () => true };
    }
    case ActorType.SERVICE_V3: {
      const { permission } = await getAuthDataProjectPermissions({
        authData,
        workspaceId: new Types.ObjectId(workspaceId)
      });

      ForbiddenError.from(permission).throwUnlessCan(
        secretAction,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath })
      );
      return {
        authVerifier: (env: string, secPath: string) =>
          permission.can(
            secretAction,
            subject(ProjectPermissionSub.Secrets, {
              environment: env,
              secretPath: secPath
            })
          )
      };
    }
    default: {
      throw UnauthorizedRequestError();
    }
  }
};

/**
 * Return secrets for workspace with id [workspaceId] and environment
 * [environment] in plaintext
 * @param req
 * @param res
 */
export const getSecretsRaw = async (req: Request, res: Response) => {
  /*
    #swagger.summary = 'List secrets'
    #swagger.description = 'List secrets'
    
    #swagger.security = [{
      "apiKeyAuth": [],
      "bearerAuth": []
    }]

    #swagger.parameters['workspaceId'] = {
      "description": "ID of workspace where to get secrets from",
      "required": true,
      "type": "string",
      "in": "query"
    }

    #swagger.parameters['environment'] = {
      "description": "Slug of environment where to get secrets from",
      "required": true,
      "type": "string",
      "in": "query"
    }

    #swagger.parameters['secretPath'] = {
      "description": "Path where to update secret like / or /foo/bar. Default is /",
      "required": false,
      "type": "string",
      "in": "query"
    }

    #swagger.parameters['include_imports'] = {
      "description": "Whether or not to include imported secrets. Default is false",
      "required": false,
      "type": "boolean",
      "in": "query"
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "secrets": {
                            "type": "array",
                            "items": {
                              $ref: '#/definitions/RawSecret'
                            },
                            "description": "List of secrets"
                        }
                    }
                }
            }
        }
    }
  */
  const validatedData = await validateRequest(reqValidator.GetSecretsRawV3, req);
  let {
    query: { secretPath, environment, workspaceId }
  } = validatedData;
  const {
    query: { include_imports: includeImports }
  } = validatedData;

  logger.info(
    `getSecretsRaw: fetch raw secrets [environment=${environment}] [workspaceId=${workspaceId}] [secretPath=${secretPath}] [includeImports=${includeImports}]`
  );

  if (req.authData.authPayload instanceof ServiceTokenData) {
    // if the service token has single scope, it will get all secrets for that scope by default
    const serviceTokenDetails: IServiceTokenData = req?.serviceTokenData;
    if (
      serviceTokenDetails &&
      serviceTokenDetails.scopes.length == 1 &&
      !containsGlobPatterns(serviceTokenDetails.scopes[0].secretPath)
    ) {
      const scope = serviceTokenDetails.scopes[0];
      secretPath = scope.secretPath;
      environment = scope.environment;
      workspaceId = serviceTokenDetails.workspace.toString();
    }
  }

  if (!environment || !workspaceId)
    throw BadRequestError({ message: "Missing environment or workspace id" });

  const { authVerifier: permissionCheckFn } = await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Read
  });

  const secrets = await SecretService.getSecrets({
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    secretPath,
    authData: req.authData
  });

  const key = await BotService.getWorkspaceKeyWithBot({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  if (includeImports) {
    const folders = await Folder.findOne({ workspace: workspaceId, environment });
    let folderId = "root";
    // if folder exist get it and replace folderid with new one
    if (folders) {
      const folder = getFolderByPath(folders.nodes, secretPath as string);
      if (!folder) {
        throw BadRequestError({ message: "Folder not found" });
      }
      folderId = folder.id;
    }
    const importedSecrets = await getAllImportedSecrets(
      workspaceId,
      environment,
      folderId,
      permissionCheckFn
    );
    return res.status(200).send({
      secrets: secrets.map((secret) =>
        repackageSecretToRaw({
          secret,
          key
        })
      ),
      imports: importedSecrets.map((el) => ({
        ...el,
        secrets: el.secrets.map((secret) => repackageSecretToRaw({ secret, key }))
      }))
    });
  }

  return res.status(200).send({
    secrets: secrets.map((secret) => {
      const rep = repackageSecretToRaw({
        secret,
        key
      });
      return rep;
    })
  });
};

/**
 * Return secret with name [secretName] in plaintext
 * @param req
 * @param res
 */
export const getSecretByNameRaw = async (req: Request, res: Response) => {
  /*
    #swagger.summary = 'Get secret'
    #swagger.description = 'Get secret'
    
    #swagger.security = [{
      "apiKeyAuth": [],
      "bearerAuth": []
    }]

    #swagger.parameters['secretName'] = {
      "description": "Name of secret to get",
      "required": true,
      "type": "string",
      "in": "path"
    }

    #swagger.parameters['workspaceId'] = {
      "description": "ID of workspace where to get secret",
      "required": true,
      "type": "string",
      "in": "query"
    }

    #swagger.parameters['environment'] = {
      "description": "Slug of environment where to get secret",
      "required": true,
      "type": "string",
      "in": "query"
    }

    #swagger.parameters['secretPath'] = {
      "description": "Path where to update secret like / or /foo/bar. Default is /",
      "required": false,
      "type": "string",
      "in": "query"
    }

    #swagger.parameters['type'] = {
      "description": "Type of secret to get; either shared or personal. Default is shared.",
      "required": true,
      "type": "string",
      "in": "query"
    }

    #swagger.parameters['include_imports'] = {
      "description": "Whether or not to include imported secrets. Default is false",
      "required": false,
      "type": "boolean",
      "in": "query"
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "secret": {
                          $ref: '#/definitions/RawSecret'
                        }
                    }
                }
            }
        }
    }
  */
  const {
    query: { secretPath, environment, workspaceId, type, include_imports },
    params: { secretName }
  } = await validateRequest(reqValidator.GetSecretByNameRawV3, req);

  logger.info(
    `getSecretByNameRaw: fetch raw secret by name [environment=${environment}] [workspaceId=${workspaceId}] [secretPath=${secretPath}] [type=${type}] [include_imports=${include_imports}]`
  );

  await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Read
  });

  const secret = await SecretService.getSecret({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
    secretPath,
    authData: req.authData,
    include_imports
  });

  const key = await BotService.getWorkspaceKeyWithBot({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  return res.status(200).send({
    secret: repackageSecretToRaw({
      secret,
      key
    })
  });
};

/**
 * Create secret with name [secretName] in plaintext
 * @param req
 * @param res
 */
export const createSecretRaw = async (req: Request, res: Response) => {
  /*
    #swagger.summary = 'Create secret'
    #swagger.description = 'Create secret'
    
    #swagger.security = [{
        "apiKeyAuth": [],
        "bearerAuth": []
    }]

    #swagger.parameters['secretName'] = {
        "description": "Name of secret to create",
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
                        "workspaceId": {
                            "type": "string",
                            "description": "ID of the workspace where to create secret",
                            "example": "someWorkspaceId"
                        },
                        "environment": {
                            "type": "string",
                            "description": "Slug of environment where to create secret",
                            "example": "dev"
                        },
                        "secretPath": {
                            "type": "string",
                            "description": "Path where to create secret. Default is /",
                            "example": "/foo/bar"
                        },
                        "secretValue": {
                            "type": "string",
                            "description": "Value of secret to create",
                            "example": "Some value"
                        },
                        "secretComment": {
                            "type": "string",
                            "description": "Comment for secret to create",
                            "example": "Some comment"
                        },
                        "type": {
                            "type": "string",
                            "description": "Type of secret to create; either shared or personal. Default is shared.",
                            "example": "shared"
                        },
                        "skipMultilineEncoding": {
                            "type": "boolean",
                            "description": "Convert multi line secrets into one line by wrapping",
                            "example": "true"
                        },
                    },
                    "required": ["workspaceId", "environment", "secretValue"]
                }
            }
        }
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": {
                  $ref: '#/definitions/RawSecret'
                }
            }
        }
    }
  */
  const {
    params: { secretName },
    body: {
      workspaceId,
      environment,
      secretPath,
      type,
      secretValue,
      secretComment,
      skipMultilineEncoding
    }
  } = await validateRequest(reqValidator.CreateSecretRawV3, req);

  logger.info(
    `createSecretRaw: create a secret raw by name and value [environment=${environment}] [workspaceId=${workspaceId}] [secretPath=${secretPath}] [type=${type}] [skipMultilineEncoding=${skipMultilineEncoding}]`
  );

  await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Create
  });

  const key = await BotService.getWorkspaceKeyWithBot({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  const secretKeyEncrypted = encryptSymmetric128BitHexKeyUTF8({
    plaintext: secretName,
    key
  });

  const secretValueEncrypted = encryptSymmetric128BitHexKeyUTF8({
    plaintext: secretValue,
    key
  });

  const secretCommentEncrypted = encryptSymmetric128BitHexKeyUTF8({
    plaintext: secretComment,
    key
  });

  const secret = await SecretService.createSecret({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
    authData: req.authData,
    secretKeyCiphertext: secretKeyEncrypted.ciphertext,
    secretKeyIV: secretKeyEncrypted.iv,
    secretKeyTag: secretKeyEncrypted.tag,
    secretValueCiphertext: secretValueEncrypted.ciphertext,
    secretValueIV: secretValueEncrypted.iv,
    secretValueTag: secretValueEncrypted.tag,
    secretPath,
    secretCommentCiphertext: secretCommentEncrypted.ciphertext,
    secretCommentIV: secretCommentEncrypted.iv,
    secretCommentTag: secretCommentEncrypted.tag,
    skipMultilineEncoding
  });

  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath
    })
  });

  const secretWithoutBlindIndex = secret.toObject();
  delete secretWithoutBlindIndex.secretBlindIndex;

  return res.status(200).send({
    secret: repackageSecretToRaw({
      secret: secretWithoutBlindIndex,
      key
    })
  });
};

/**
 * Update secret with name [secretName]
 * @param req
 * @param res
 */
export const updateSecretByNameRaw = async (req: Request, res: Response) => {
  /*
    #swagger.summary = 'Update secret'
    #swagger.description = 'Update secret'
    
    #swagger.security = [{
        "apiKeyAuth": [],
        "bearerAuth": []
    }]

    #swagger.parameters['secretName'] = {
        "description": "Name of secret to update",
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
                        "workspaceId": {
                            "type": "string",
                            "description": "ID of the workspace where to update secret",
                            "example": "someWorkspaceId"
                        },
                        "environment": {
                            "type": "string",
                            "description": "Slug of environment where to update secret",
                            "example": "dev"
                        },
                        "secretPath": {
                            "type": "string",
                            "description": "Path where to update secret like / or /foo/bar. Default is /",
                            "example": "/foo/bar"
                        },
                        "secretValue": {
                            "type": "string",
                            "description": "Value of secret to update to",
                            "example": "Some value"
                        },
                        "type": {
                            "type": "string",
                            "description": "Type of secret to update; either shared or personal. Default is shared.",
                            "example": "shared"
                        },
                        "skipMultilineEncoding": {
                            "type": "boolean",
                            "description": "Convert multi line secrets into one line by wrapping",
                            "example": "true"
                        },
                    },
                    "required": ["workspaceId", "environment", "secretValue"]
                }
            }
        }
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": {
                  $ref: '#/definitions/RawSecret'
                }
            }
        }
    }
  */
  const {
    params: { secretName },
    body: { workspaceId, environment, secretValue, secretPath, type, skipMultilineEncoding }
  } = await validateRequest(reqValidator.UpdateSecretByNameRawV3, req);

  logger.info(
    `updateSecretByNameRaw: update raw secret by name [environment=${environment}] [workspaceId=${workspaceId}] [secretPath=${secretPath}] [type=${type}] [skipMultilineEncoding=${skipMultilineEncoding}]`
  );

  await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Edit
  });

  const key = await BotService.getWorkspaceKeyWithBot({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  const secretValueEncrypted = encryptSymmetric128BitHexKeyUTF8({
    plaintext: secretValue,
    key
  });

  const secret = await SecretService.updateSecret({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
    authData: req.authData,
    secretValueCiphertext: secretValueEncrypted.ciphertext,
    secretValueIV: secretValueEncrypted.iv,
    secretValueTag: secretValueEncrypted.tag,
    secretPath,
    skipMultilineEncoding
  });

  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath
    })
  });

  return res.status(200).send({
    secret: repackageSecretToRaw({
      secret,
      key
    })
  });
};

/**
 * Delete secret with name [secretName]
 * @param req
 * @param res
 */
export const deleteSecretByNameRaw = async (req: Request, res: Response) => {
  /*
    #swagger.summary = 'Delete secret'
    #swagger.description = 'Delete secret'
    
    #swagger.security = [{
      "apiKeyAuth": [],
      "bearerAuth": []
    }]

    #swagger.parameters['secretName'] = {
      "description": "Name of secret to delete",
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
                        "workspaceId": {
                            "type": "string",
                            "description": "ID of workspace where to delete secret",
                            "example": "someWorkspaceId"
                        },
                        "environment": {
                            "type": "string",
                            "description": "Slug of Environment where to delete secret",
                            "example": "dev"
                        },
                        "secretPath": {
                            "type": "string",
                            "description": "Path where to delete secret. Default is /",
                            "example": "/foo/bar"
                        },
                        "type": {
                            "type": "string",
                            "description": "Type of secret to delete; either shared or personal. Default is shared",
                            "example": "shared"
                        }
                    },
                    "required": ["workspaceId", "environment"]
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
                    "secret": {
                      $ref: '#/definitions/RawSecret'
                    }
                  },
                  "description": "The deleted secret"
                }
            }
        }
    }
  */
  const {
    params: { secretName },
    body: { environment, secretPath, type, workspaceId }
  } = await validateRequest(reqValidator.DeleteSecretByNameRawV3, req);

  logger.info(
    `deleteSecretByNameRaw: delete a secret by name [environment=${environment}] [workspaceId=${workspaceId}] [secretPath=${secretPath}] [type=${type}]`
  );

  await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Delete
  });

  const { secret } = await SecretService.deleteSecret({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
    authData: req.authData,
    secretPath
  });

  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath
    })
  });

  const key = await BotService.getWorkspaceKeyWithBot({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  return res.status(200).send({
    secret: repackageSecretToRaw({
      secret,
      key
    })
  });
};

/**
 * Get secrets for workspace with id [workspaceId] and environment
 * [environment]
 * @param req
 * @param res
 */
export const getSecrets = async (req: Request, res: Response) => {
  const validatedData = await validateRequest(reqValidator.GetSecretsV3, req);
  const {
    query: { environment, workspaceId, include_imports: includeImports }
  } = validatedData;

  const {
    query: { secretPath }
  } = validatedData;

  logger.info(
    `getSecrets: fetch encrypted secrets [environment=${environment}] [workspaceId=${workspaceId}] [includeImports=${includeImports}]`
  );

  const { authVerifier: permissionCheckFn } = await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Read
  });

  const secrets = await SecretService.getSecrets({
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    secretPath,
    authData: req.authData
  });

  if (includeImports) {
    const folders = await Folder.findOne({ workspace: workspaceId, environment });
    let folderId = "root";
    // if folder exist get it and replace folderid with new one
    if (folders) {
      const folder = getFolderByPath(folders.nodes, secretPath as string);
      if (!folder) {
        throw BadRequestError({ message: "Folder not found" });
      }
      folderId = folder.id;
    }
    const importedSecrets = await getAllImportedSecrets(
      workspaceId,
      environment,
      folderId,
      permissionCheckFn
    );
    return res.status(200).send({
      secrets,
      imports: importedSecrets
    });
  }

  return res.status(200).send({
    secrets
  });
};

/**
 * Return secret with name [secretName]
 * @param req
 * @param res
 */
export const getSecretByName = async (req: Request, res: Response) => {
  const {
    query: { secretPath, environment, workspaceId, type, include_imports },
    params: { secretName }
  } = await validateRequest(reqValidator.GetSecretByNameV3, req);

  logger.info(
    `getSecretByName: get a single secret by name [environment=${environment}] [workspaceId=${workspaceId}] [include_imports=${include_imports}] [type=${type}]`
  );

  await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Read
  });

  const secret = await SecretService.getSecret({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
    secretPath,
    authData: req.authData,
    include_imports
  });

  return res.status(200).send({
    secret
  });
};

/**
 * Create secret with name [secretName]
 * @param req
 * @param res
 */
export const createSecret = async (req: Request, res: Response) => {
  const {
    body: {
      workspaceId,
      secretPath,
      environment,
      metadata,
      type,
      secretKeyIV,
      secretKeyTag,
      secretValueIV,
      secretValueTag,
      secretCommentIV,
      secretCommentTag,
      secretKeyCiphertext,
      secretValueCiphertext,
      secretCommentCiphertext,
      skipMultilineEncoding
    },
    params: { secretName }
  } = await validateRequest(reqValidator.CreateSecretV3, req);

  logger.info(
    `createSecret: create an encrypted secret [environment=${environment}] [workspaceId=${workspaceId}] [skipMultilineEncoding=${skipMultilineEncoding}] [type=${type}]`
  );

  await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Create
  });

  if (req.authData.authPayload instanceof User) {
    const membership = await Membership.findOne({
      user: req.authData.authPayload._id,
      workspace: new Types.ObjectId(workspaceId)
    });

    if (membership && type !== "personal") {
      const secretApprovalPolicy = await getSecretPolicyOfBoard(
        workspaceId,
        environment,
        secretPath
      );
      if (secretApprovalPolicy) {
        const secretApprovalRequest = await generateSecretApprovalRequest({
          workspaceId,
          environment,
          secretPath,
          policy: secretApprovalPolicy,
          commiterMembershipId: membership._id.toString(),
          authData: req.authData,
          data: {
            [CommitType.CREATE]: [
              {
                secretName,
                secretValueCiphertext,
                secretValueIV,
                secretValueTag,
                secretCommentIV,
                secretCommentTag,
                secretCommentCiphertext,
                skipMultilineEncoding,
                secretKeyTag,
                secretKeyCiphertext,
                secretKeyIV
              }
            ]
          }
        });
        return res.send({ approval: secretApprovalRequest });
      }
    }
  }

  const secret = await SecretService.createSecret({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
    authData: req.authData,
    secretKeyCiphertext,
    secretKeyIV,
    secretKeyTag,
    secretValueCiphertext,
    secretValueIV,
    secretValueTag,
    secretPath,
    secretCommentCiphertext,
    secretCommentIV,
    secretCommentTag,
    metadata,
    skipMultilineEncoding
  });

  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath
    })
  });

  const secretWithoutBlindIndex = secret.toObject();
  delete secretWithoutBlindIndex.secretBlindIndex;

  return res.status(200).send({
    secret: secretWithoutBlindIndex
  });
};

/**
 * Update secret with name [secretName]
 * @param req
 * @param res
 */
export const updateSecretByName = async (req: Request, res: Response) => {
  const {
    body: {
      secretValueCiphertext,
      secretValueTag,
      secretValueIV,
      secretId,
      type,
      environment,
      secretPath,
      workspaceId,
      tags,
      secretCommentIV,
      secretCommentTag,
      secretCommentCiphertext,
      secretName: newSecretName,
      secretKeyIV,
      secretKeyTag,
      secretKeyCiphertext,
      skipMultilineEncoding,
      secretReminderRepeatDays,
      secretReminderNote
    },
    params: { secretName }
  } = await validateRequest(reqValidator.UpdateSecretByNameV3, req);

  logger.info(
    `updateSecretByName: update a encrypted secret by name [environment=${environment}] [workspaceId=${workspaceId}] [skipMultilineEncoding=${skipMultilineEncoding}] [type=${type}]`
  );

  if (newSecretName && (!secretKeyIV || !secretKeyTag || !secretKeyCiphertext)) {
    throw BadRequestError({ message: "Missing encrypted key" });
  }

  await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Edit
  });

  if (req.authData.authPayload instanceof User) {
    const membership = await Membership.findOne({
      user: req.authData.authPayload._id,
      workspace: new Types.ObjectId(workspaceId)
    });

    if (membership && type !== "personal") {
      const secretApprovalPolicy = await getSecretPolicyOfBoard(
        workspaceId,
        environment,
        secretPath
      );
      if (secretApprovalPolicy) {
        const secretApprovalRequest = await generateSecretApprovalRequest({
          workspaceId,
          environment,
          secretPath,
          policy: secretApprovalPolicy,
          commiterMembershipId: membership._id.toString(),
          authData: req.authData,
          data: {
            [CommitType.UPDATE]: [
              {
                secretName,
                newSecretName,
                secretValueCiphertext,
                secretValueIV,
                secretValueTag,
                tags,
                secretCommentIV,
                secretCommentTag,
                secretCommentCiphertext,
                skipMultilineEncoding,
                secretKeyTag,
                secretKeyCiphertext,
                secretKeyIV
              }
            ]
          }
        });
        return res.send({ approval: secretApprovalRequest });
      }
    }
  }

  if (type !== "personal") {
    const existingSecret = await SecretService.getSecret({
      secretName,
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      type,
      secretPath,
      authData: req.authData
    });

    if (secretReminderRepeatDays !== undefined) {
      if (
        (secretReminderRepeatDays &&
          existingSecret.secretReminderRepeatDays !== secretReminderRepeatDays) ||
        (secretReminderNote && existingSecret.secretReminderNote !== secretReminderNote)
      ) {
        await createReminder(existingSecret, {
          _id: existingSecret._id,
          secretReminderRepeatDays,
          secretReminderNote,
          workspace: existingSecret.workspace
        });
      } else if (
        secretReminderRepeatDays === null &&
        secretReminderNote === null &&
        existingSecret.secretReminderRepeatDays
      ) {
        await deleteReminder({
          _id: existingSecret._id,
          secretReminderRepeatDays: existingSecret.secretReminderRepeatDays
        });
      }
    }
  }

  const secret = await SecretService.updateSecret({
    secretName,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
    secretId,
    authData: req.authData,
    newSecretName,
    secretValueCiphertext,
    secretValueIV,
    secretReminderRepeatDays,
    secretReminderNote,
    secretValueTag,
    secretPath,
    tags,
    secretCommentIV,
    secretCommentTag,
    secretCommentCiphertext,
    skipMultilineEncoding,
    secretKeyTag,
    secretKeyCiphertext,
    secretKeyIV
  });

  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath
    })
  });

  return res.status(200).send({
    secret
  });
};

/**
 * Delete secret with name [secretName]
 * @param req
 * @param res
 */
export const deleteSecretByName = async (req: Request, res: Response) => {
  const {
    body: { type, environment, secretPath, workspaceId, secretId },
    params: { secretName }
  } = await validateRequest(reqValidator.DeleteSecretByNameV3, req);

  logger.info(
    `deleteSecretByName: delete a encrypted secret by name [environment=${environment}] [workspaceId=${workspaceId}] [type=${type}]`
  );

  await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Delete
  });

  if (req.authData.authPayload instanceof User) {
    const membership = await Membership.findOne({
      user: req.authData.authPayload._id,
      workspace: new Types.ObjectId(workspaceId)
    });

    if (membership && type !== "personal") {
      const secretApprovalPolicy = await getSecretPolicyOfBoard(
        workspaceId,
        environment,
        secretPath
      );
      if (secretApprovalPolicy) {
        const secretApprovalRequest = await generateSecretApprovalRequest({
          workspaceId,
          environment,
          secretPath,
          authData: req.authData,
          policy: secretApprovalPolicy,
          commiterMembershipId: membership._id.toString(),
          data: {
            [CommitType.DELETE]: [
              {
                secretName
              }
            ]
          }
        });
        return res.send({ approval: secretApprovalRequest });
      }
    }
  }

  const { secret } = await SecretService.deleteSecret({
    secretName,
    secretId,
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    type,
    authData: req.authData,
    secretPath
  });

  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath
    })
  });

  return res.status(200).send({
    secret
  });
};

export const createSecretByNameBatch = async (req: Request, res: Response) => {
  const {
    body: { secrets, secretPath, environment, workspaceId }
  } = await validateRequest(reqValidator.CreateSecretByNameBatchV3, req);

  logger.info(
    `createSecretByNameBatch: create a list of secrets by their names [environment=${environment}] [workspaceId=${workspaceId}] [secretsLength=${secrets?.length}]`
  );

  await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Create
  });

  if (req.authData.authPayload instanceof User) {
    const membership = await Membership.findOne({
      user: req.authData.authPayload._id,
      workspace: new Types.ObjectId(workspaceId)
    });

    if (membership) {
      const secretApprovalPolicy = await getSecretPolicyOfBoard(
        workspaceId,
        environment,
        secretPath
      );
      if (secretApprovalPolicy) {
        const secretApprovalRequest = await generateSecretApprovalRequest({
          workspaceId,
          environment,
          secretPath,
          authData: req.authData,
          policy: secretApprovalPolicy,
          commiterMembershipId: membership._id.toString(),
          data: {
            [CommitType.CREATE]: secrets.filter(({ type }) => type === "shared")
          }
        });
        return res.send({ approval: secretApprovalRequest });
      }
    }
  }

  const createdSecrets = await SecretService.createSecretBatch({
    secretPath,
    environment,
    workspaceId: new Types.ObjectId(workspaceId),
    secrets,
    authData: req.authData
  });

  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath
    })
  });

  return res.status(200).send({
    secrets: createdSecrets
  });
};

export const updateSecretByNameBatch = async (req: Request, res: Response) => {
  const {
    body: { secrets, secretPath, environment, workspaceId }
  } = await validateRequest(reqValidator.UpdateSecretByNameBatchV3, req);

  logger.info(
    `updateSecretByNameBatch: update a list of secrets by their names [environment=${environment}] [workspaceId=${workspaceId}] [secretsLength=${secrets?.length}]`
  );

  await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Edit
  });

  if (req.authData.authPayload instanceof User) {
    const membership = await Membership.findOne({
      user: req.authData.authPayload._id,
      workspace: new Types.ObjectId(workspaceId)
    });

    if (membership) {
      const secretApprovalPolicy = await getSecretPolicyOfBoard(
        workspaceId,
        environment,
        secretPath
      );
      if (secretApprovalPolicy) {
        const secretApprovalRequest = await generateSecretApprovalRequest({
          workspaceId,
          environment,
          secretPath,
          policy: secretApprovalPolicy,
          commiterMembershipId: membership._id.toString(),
          data: {
            [CommitType.UPDATE]: secrets.filter(({ type }) => type === "shared")
          },
          authData: req.authData
        });
        return res.send({ approval: secretApprovalRequest });
      }
    }
  }

  const updatedSecrets = await SecretService.updateSecretBatch({
    secretPath,
    environment,
    workspaceId: new Types.ObjectId(workspaceId),
    secrets,
    authData: req.authData
  });

  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath
    })
  });

  return res.status(200).send({
    secrets: updatedSecrets
  });
};

export const deleteSecretByNameBatch = async (req: Request, res: Response) => {
  const {
    body: { secrets, secretPath, environment, workspaceId }
  } = await validateRequest(reqValidator.DeleteSecretByNameBatchV3, req);

  logger.info(
    `deleteSecretByNameBatch: delete a list of secrets by their names [environment=${environment}] [workspaceId=${workspaceId}] [secretsLength=${secrets?.length}]`
  );

  await checkSecretsPermission({
    authData: req.authData,
    workspaceId,
    environment,
    secretPath,
    secretAction: ProjectPermissionActions.Delete
  });

  if (req.authData.authPayload instanceof User) {
    const membership = await Membership.findOne({
      user: req.authData.authPayload._id,
      workspace: new Types.ObjectId(workspaceId)
    });

    if (membership) {
      const secretApprovalPolicy = await getSecretPolicyOfBoard(
        workspaceId,
        environment,
        secretPath
      );
      if (secretApprovalPolicy) {
        const secretApprovalRequest = await generateSecretApprovalRequest({
          workspaceId,
          environment,
          secretPath,
          policy: secretApprovalPolicy,
          commiterMembershipId: membership._id.toString(),
          data: {
            [CommitType.DELETE]: secrets.filter(({ type }) => type === "shared")
          },
          authData: req.authData
        });
        return res.send({ approval: secretApprovalRequest });
      }
    }
  }

  const deletedSecrets = await SecretService.deleteSecretBatch({
    secretPath,
    environment,
    workspaceId: new Types.ObjectId(workspaceId),
    secrets,
    authData: req.authData
  });

  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath
    })
  });

  return res.status(200).send({
    secrets: deletedSecrets
  });
};
