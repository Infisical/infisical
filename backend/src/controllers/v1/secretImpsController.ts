
import { Request, Response } from "express";
import { Types } from "mongoose";
import { isValidScope } from "../../helpers";
import { Folder, IServiceTokenData, SecretImport, ServiceTokenData } from "../../models";
import { getAllImportedSecrets } from "../../services/SecretImportService";
import { getFolderByPath, getFolderWithPathFromId } from "../../services/FolderService";
import {
  BadRequestError,
  ResourceNotFoundError,
  UnauthorizedRequestError
} from "../../utils/errors";
import { EEAuditLogService } from "../../ee/services";
import { EventType } from "../../ee/models";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/secretImports";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { ForbiddenError, subject } from "@casl/ability";

export const createSecretImp = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Create secret import'
    #swagger.description = 'Create secret import'

    #swagger.requestBody = {
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "workspaceId": {
                            "type": "string",
                            "description": "ID of workspace where to create secret import",
                            "example": "someWorkspaceId"
                        },
                        "environment": {
                            "type": "string",
                            "description": "Slug of environment where to create secret import",
                            "example": "dev"
                        },
                        "directory": {
                            "type": "string",
                            "description": "Path where to create secret import like / or /foo/bar. Default is /",
                            "example": "/foo/bar"
                        },
                        "secretImport": {
                            "type": "object",
                            "properties": {
                              "environment": {
                                "type": "string",
                                "description": "Slug of environment to import from",
                                "example": "development"
                              },
                              "secretPath": {
                                "type": "string",
                                "description": "Path where to import from like / or /foo/bar.",
                                "example": "/user/oauth"
                              }
                            }
                        }
                    },
                    "required": ["workspaceId", "environment", "directory", "secretImport"]
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
                        "message": {
                            "type": "string",
                            "example": "successfully created secret import"
                        }
                    },
                    "description": "Confirmation of secret import creation"
                }
            }
        }
    }
    #swagger.responses[400] = {
        description: "Bad Request. For example, 'Secret import already exist'"
    }
    #swagger.responses[401] = {
        description: "Unauthorized request. For example, 'Folder Permission Denied'"
    }
    #swagger.responses[404] = {
        description: "Resource Not Found. For example, 'Failed to find folder'"
    }   
  */

  const {
    body: { workspaceId, environment, directory, secretImport }
  } = await validateRequest(reqValidator.CreateSecretImportV1, req);

  if (req.authData.authPayload instanceof ServiceTokenData) {
    // root check
    const isValidScopeAccess = isValidScope(req.authData.authPayload, environment, directory);
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  } else {
    const { permission } = await getAuthDataProjectPermissions({
      authData: req.authData,
      workspaceId: new Types.ObjectId(workspaceId)
    });
    
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: directory })
    );
  }

  const folders = await Folder.findOne({
    workspace: workspaceId,
    environment
  }).lean();

  if (!folders && directory !== "/")
    throw ResourceNotFoundError({ message: "Failed to find folder" });

  let folderId = "root";
  if (folders) {
    const folder = getFolderByPath(folders.nodes, directory);
    if (!folder) throw BadRequestError({ message: "Folder not found" });
    folderId = folder.id;
  }

  const importSecDoc = await SecretImport.findOne({
    workspace: workspaceId,
    environment,
    folderId
  });

  if (!importSecDoc) {
    const doc = new SecretImport({
      workspace: workspaceId,
      environment,
      folderId,
      imports: [{ environment: secretImport.environment, secretPath: secretImport.secretPath }]
    });

    await doc.save();
    await EEAuditLogService.createAuditLog(
      req.authData,
      {
        type: EventType.CREATE_SECRET_IMPORT,
        metadata: {
          secretImportId: doc._id.toString(),
          folderId: doc.folderId.toString(),
          importFromEnvironment: secretImport.environment,
          importFromSecretPath: secretImport.secretPath,
          importToEnvironment: environment,
          importToSecretPath: directory
        }
      },
      {
        workspaceId: doc.workspace
      }
    );
    return res.status(200).json({ message: "successfully created secret import" });
  }

  const doesImportExist = importSecDoc.imports.find(
    (el) => el.environment === secretImport.environment && el.secretPath === secretImport.secretPath
  );
  if (doesImportExist) {
    throw BadRequestError({ message: "Secret import already exist" });
  }

  importSecDoc.imports.push({
    environment: secretImport.environment,
    secretPath: secretImport.secretPath
  });
  await importSecDoc.save();

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.CREATE_SECRET_IMPORT,
      metadata: {
        secretImportId: importSecDoc._id.toString(),
        folderId: importSecDoc.folderId.toString(),
        importFromEnvironment: secretImport.environment,
        importFromSecretPath: secretImport.secretPath,
        importToEnvironment: environment,
        importToSecretPath: directory
      }
    },
    {
      workspaceId: importSecDoc.workspace
    }
  );
  return res.status(200).json({ message: "successfully created secret import" });
};

// to keep the ordering, you must pass all the imports in here not the only updated one
// this is because the order decide which import gets overriden

/**
 * Update secret import
 * @param req
 * @param res
 * @returns
 */
export const updateSecretImport = async (req: Request, res: Response) => {
  /*
    #swagger.summary = 'Update secret import'
    #swagger.description = 'Update secret import'

    #swagger.parameters['id'] = {
        in: 'path',
        description: 'ID of secret import to update',
        required: true,
        type: 'string',
        example: 'import12345'
    }

    #swagger.requestBody = {
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "secretImports": {
                            "type": "array",
                            "description": "List of secret imports to update to",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "environment": {
                                        "type": "string",
                                        "description": "Slug of environment to import from",
                                        "example": "dev"
                                    },
                                    "secretPath": {
                                        "type": "string",
                                        "description": "Path where to import secrets from like / or /foo/bar",
                                        "example": "/foo/bar"
                                    }
                                },
                                "required": ["environment", "secretPath"]
                            }
                        }
                    },
                    "required": ["secretImports"]
                }
            }
        }
    }

    #swagger.responses[200] = {
        description: 'Successfully updated the secret import',
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string",
                            "example": "successfully updated secret import"
                        }
                    }
                }
            }
        }
    }

    #swagger.responses[400] = {
        description: 'Bad Request - Import not found',
    }

    #swagger.responses[403] = {
        description: 'Forbidden access due to insufficient permissions',
    }

    #swagger.responses[401] = {
        description: 'Unauthorized access due to invalid token or scope',
    }
  */
  const {
    body: { secretImports },
    params: { id }
  } = await validateRequest(reqValidator.UpdateSecretImportV1, req);

  const importSecDoc = await SecretImport.findById(id);
  if (!importSecDoc) {
    throw BadRequestError({ message: "Import not found" });
  }

  // check for service token validity
  const folders = await Folder.findOne({
    workspace: importSecDoc.workspace,
    environment: importSecDoc.environment
  }).lean();

  let secretPath = "/";
  if (folders) {
    const { folderPath } = getFolderWithPathFromId(folders.nodes, importSecDoc.folderId);
    secretPath = folderPath;
  }

  if (req.authData.authPayload instanceof ServiceTokenData) {
    // token permission check
    const isValidScopeAccess = isValidScope(
      req.authData.authPayload,
      importSecDoc.environment,
      secretPath
    );
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  } else {
    // non token entry check
    const { permission } = await getAuthDataProjectPermissions({
      authData: req.authData,
      workspaceId: importSecDoc.workspace
    });
    
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, {
        environment: importSecDoc.environment,
        secretPath
      })
    );
  }

  const orderBefore = importSecDoc.imports;
  importSecDoc.imports = secretImports;

  await importSecDoc.save();

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.UPDATE_SECRET_IMPORT,
      metadata: {
        importToEnvironment: importSecDoc.environment,
        importToSecretPath: secretPath,
        secretImportId: importSecDoc._id.toString(),
        folderId: importSecDoc.folderId.toString(),
        orderBefore,
        orderAfter: secretImports
      }
    },
    {
      workspaceId: importSecDoc.workspace
    }
  );
  return res.status(200).json({ message: "successfully updated secret import" });
};

/**
 * Delete secret import
 * @param req
 * @param res
 * @returns
 */
export const deleteSecretImport = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Delete secret import'
    #swagger.description = 'Delete secret import'

    #swagger.parameters['id'] = {
        in: 'path',
        description: 'ID of parent secret import document from which to delete secret import',
        required: true,
        type: 'string',
        example: '12345abcde'
    }

    #swagger.requestBody = {
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "secretImportEnv": {
                            "type": "string",
                            "description": "Slug of environment of import to delete",
                            "example": "someWorkspaceId"
                        },
                        "secretImportPath": {
                            "type": "string",
                            "description": "Path like / or /foo/bar of import to delete",
                            "example": "production"
                        }
                    },
                    "required": ["id", "secretImportEnv", "secretImportPath"]
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
                        "message": {
                            "type": "string",
                            "example": "successfully delete secret import"
                        }
                    },
                    "description": "Confirmation of secret import deletion"
                }
            }
        }
    }
  */
  const {
    params: { id },
    body: { secretImportEnv, secretImportPath }
  } = await validateRequest(reqValidator.DeleteSecretImportV1, req);

  const importSecDoc = await SecretImport.findById(id);
  if (!importSecDoc) {
    throw BadRequestError({ message: "Import not found" });
  }

  // check for service token validity
  const folders = await Folder.findOne({
    workspace: importSecDoc.workspace,
    environment: importSecDoc.environment
  }).lean();

  let secretPath = "/";
  if (folders) {
    const { folderPath } = getFolderWithPathFromId(folders.nodes, importSecDoc.folderId);
    secretPath = folderPath;
  }

  if (req.authData.authPayload instanceof ServiceTokenData) {
    const isValidScopeAccess = isValidScope(
      req.authData.authPayload,
      importSecDoc.environment,
      secretPath
    );
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  } else {
    const { permission } = await getAuthDataProjectPermissions({
      authData: req.authData,
      workspaceId: importSecDoc.workspace
    });
    
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Secrets, {
        environment: importSecDoc.environment,
        secretPath
      })
    );
  }
  importSecDoc.imports = importSecDoc.imports.filter(
    ({ environment, secretPath }) =>
      !(environment === secretImportEnv && secretPath === secretImportPath)
  );
  await importSecDoc.save();

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.DELETE_SECRET_IMPORT,
      metadata: {
        secretImportId: importSecDoc._id.toString(),
        folderId: importSecDoc.folderId.toString(),
        importFromEnvironment: secretImportEnv,
        importFromSecretPath: secretImportPath,
        importToEnvironment: importSecDoc.environment,
        importToSecretPath: secretPath
      }
    },
    {
      workspaceId: importSecDoc.workspace
    }
  );

  return res.status(200).json({ message: "successfully delete secret import" });
};

/**
 * Get secret imports
 * @param req
 * @param res
 * @returns
 */
export const getSecretImports = async (req: Request, res: Response) => {
  /*
    #swagger.summary = 'Get secret imports'
    #swagger.description = 'Get secret imports'

    #swagger.parameters['workspaceId'] = {
        in: 'query',
        description: 'ID of workspace where to get secret imports from',
        required: true,
        type: 'string',
        example: 'workspace12345'
    }

    #swagger.parameters['environment'] = {
        in: 'query',
        description: 'Slug of environment where to get secret imports from',
        required: true,
        type: 'string',
        example: 'production'
    }

    #swagger.parameters['directory'] = {
        in: 'query',
        description: 'Path where to get secret imports from like / or /foo/bar. Default is /',
        required: false,
        type: 'string',
        example: 'folder12345'
    }

    #swagger.responses[200] = {
        description: 'Successfully retrieved secret import',
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "secretImport": {
                          $ref: '#/definitions/SecretImport'
                        }
                    }
                }
            }
        }
    }

    #swagger.responses[403] = {
        description: 'Forbidden access due to insufficient permissions',
    }

    #swagger.responses[401] = {
        description: 'Unauthorized access due to invalid token or scope',
    }
  */
  const {
    query: { workspaceId, environment, directory }
  } = await validateRequest(reqValidator.GetSecretImportsV1, req);

  if (req.authData.authPayload instanceof ServiceTokenData) {
    const isValidScopeAccess = isValidScope(req.authData.authPayload, environment, directory);
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  } else {
    const { permission } = await getAuthDataProjectPermissions({
      authData: req.authData,
      workspaceId: new Types.ObjectId(workspaceId)
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, {
        environment,
        secretPath: directory
      })
    );
  }

  const folders = await Folder.findOne({
    workspace: workspaceId,
    environment
  }).lean();
  if (!folders && directory !== "/") throw BadRequestError({ message: "Folder not found" });

  let folderId = "root";
  if (folders) {
    const folder = getFolderByPath(folders.nodes, directory);
    if (!folder) throw BadRequestError({ message: "Folder not found" });
    folderId = folder.id;
  }

  const importSecDoc = await SecretImport.findOne({
    workspace: workspaceId,
    environment,
    folderId
  });

  if (!importSecDoc) {
    return res.status(200).json({ secretImport: {} });
  }

  return res.status(200).json({ secretImport: importSecDoc });
};

/**
 * Get all secret imports
 * @param req
 * @param res
 * @returns
 */
export const getAllSecretsFromImport = async (req: Request, res: Response) => {
  const {
    query: { workspaceId, environment, directory }
  } = await validateRequest(reqValidator.GetAllSecretsFromImportV1, req);

  if (req.authData.authPayload instanceof ServiceTokenData) {
    // check for service token validity
    const isValidScopeAccess = isValidScope(req.authData.authPayload, environment, directory);
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  } else {
    const { permission } = await getAuthDataProjectPermissions({
      authData: req.authData,
      workspaceId: new Types.ObjectId(workspaceId)
    });
    
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, {
        environment,
        secretPath: directory
      })
    );
  }

  const folders = await Folder.findOne({
    workspace: workspaceId,
    environment
  }).lean();
  if (!folders && directory !== "/") throw BadRequestError({ message: "Folder not found" });

  let folderId = "root";
  if (folders) {
    const folder = getFolderByPath(folders.nodes, directory);
    if (!folder) throw BadRequestError({ message: "Folder not found" });
    folderId = folder.id;
  }

  const importSecDoc = await SecretImport.findOne({
    workspace: workspaceId,
    environment,
    folderId
  });

  if (!importSecDoc) {
    return res.status(200).json({ secrets: [] });
  }

  let secretPath = "/";
  if (folders) {
    const { folderPath } = getFolderWithPathFromId(folders.nodes, importSecDoc.folderId);
    secretPath = folderPath;
  }

  let permissionCheckFn: (env: string, secPath: string) => boolean; // used to pass as callback function to import secret
  if (req.authData.authPayload instanceof ServiceTokenData) {
    // check for service token validity
    const isValidScopeAccess = isValidScope(
      req.authData.authPayload,
      importSecDoc.environment,
      secretPath
    );
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
    permissionCheckFn = (env: string, secPath: string) =>
      isValidScope(req.authData.authPayload as IServiceTokenData, env, secPath);
  } else {
    const { permission } = await getAuthDataProjectPermissions({
      authData: req.authData,
      workspaceId: importSecDoc.workspace
    });
    
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, {
        environment: importSecDoc.environment,
        secretPath
      })
    );
    permissionCheckFn = (env: string, secPath: string) =>
      permission.can(
        ProjectPermissionActions.Read,
        subject(ProjectPermissionSub.Secrets, {
          environment: env,
          secretPath: secPath
        })
      );
  }

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.GET_SECRET_IMPORTS,
      metadata: {
        environment,
        secretImportId: importSecDoc._id.toString(),
        folderId,
        numberOfImports: importSecDoc.imports.length
      }
    },
    {
      workspaceId: importSecDoc.workspace
    }
  );

  const secrets = await getAllImportedSecrets(
    workspaceId,
    environment,
    folderId,
    permissionCheckFn
  );
  return res.status(200).json({ secrets });
};
