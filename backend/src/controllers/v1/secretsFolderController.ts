import { ForbiddenError, subject } from "@casl/ability";
import { Request, Response } from "express";
import { Types } from "mongoose";
import { EventType, FolderVersion } from "../../ee/models";
import { EEAuditLogService, EESecretService } from "../../ee/services";
import { isValidScope } from "../../helpers/secrets";
import { validateRequest } from "../../helpers/validation";
import { Secret, ServiceTokenData } from "../../models";
import { Folder } from "../../models/folder";
import {
  appendFolder,
  getAllFolderIds,
  getFolderByPath,
  getFolderWithPathFromId,
  validateFolderName
} from "../../services/FolderService";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { BadRequestError, UnauthorizedRequestError } from "../../utils/errors";
import * as reqValidator from "../../validation/folders";

const ERR_FOLDER_NOT_FOUND = BadRequestError({ message: "The folder doesn't exist" });

// verify workspace id/environment
export const createFolder = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Create folder'
    #swagger.description = 'Create folder'
    
    #swagger.security = [{
        "apiKeyAuth": [],
        "bearerAuth": []
    }]

    #swagger.requestBody = {
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "workspaceId": {
                            "type": "string",
                            "description": "ID of the workspace where to create folder",
                            "example": "someWorkspaceId"
                        },
                        "environment": {
                            "type": "string",
                            "description": "Slug of environment where to create folder",
                            "example": "production"
                        },
                        "folderName": {
                            "type": "string",
                            "description": "Name of folder to create",
                            "example": "my_folder"
                        },
                        "directory": {
                            "type": "string",
                            "description": "Path where to create folder like / or /foo/bar. Default is /",
                            "example": "/foo/bar"
                        }
                    },
                    "required": ["workspaceId", "environment", "folderName"]
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
                        "folder": {
                            "type": "object",
                            "properties": {
                                "id": {
                                    "type": "string",
                                    "description": "ID of folder",
                                    "example": "someFolderId"
                                },
                                "name": {
                                    "type": "string",
                                    "description": "Name of folder",
                                    "example": "my_folder"
                                },
                                "version": {
                                    "type": "number",
                                    "description": "Version of folder",
                                    "example": 1
                                }
                            },
                            "description": "Details of created folder"
                        }
                    }
                }
            }
        }
    }
    #swagger.responses[400] = {
        description: "Bad Request. For example, 'Folder name cannot contain spaces. Only underscore and dashes'"
    }
    #swagger.responses[401] = {
        description: "Unauthorized request. For example, 'Folder Permission Denied'"
    }
  */
  const {
    body: { workspaceId, environment, folderName, directory }
  } = await validateRequest(reqValidator.CreateFolderV1, req);

  if (!validateFolderName(folderName)) {
    throw BadRequestError({
      message: "Folder name cannot contain spaces. Only underscore and dashes"
    });
  }

  if (req.authData.authPayload instanceof ServiceTokenData) {
    // token check
    const isValidScopeAccess = isValidScope(req.authData.authPayload, environment, directory);
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  } else {
    // user check
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

  // space has no folders initialized
  if (!folders) {
    const folder = new Folder({
      workspace: workspaceId,
      environment,
      nodes: {
        id: "root",
        name: "root",
        version: 1,
        children: []
      }
    });
    const { parent, child } = appendFolder(folder.nodes, { folderName, directory });
    await folder.save();
    const folderVersion = new FolderVersion({
      workspace: workspaceId,
      environment,
      nodes: parent
    });
    await folderVersion.save();
    await EESecretService.takeSecretSnapshot({
      workspaceId: new Types.ObjectId(workspaceId),
      environment
    });

    await EEAuditLogService.createAuditLog(
      req.authData,
      {
        type: EventType.CREATE_FOLDER,
        metadata: {
          environment,
          folderId: child.id,
          folderName,
          folderPath: directory
        }
      },
      {
        workspaceId: new Types.ObjectId(workspaceId)
      }
    );

    return res.json({ folder: { id: child.id, name: folderName } });
  }

  const { parent, child, hasCreated } = appendFolder(folders.nodes, { folderName, directory });

  if (!hasCreated) return res.json({ folder: child });

  await Folder.findByIdAndUpdate(folders._id, folders);

  const folderVersion = new FolderVersion({
    workspace: workspaceId,
    environment,
    nodes: parent
  });
  await folderVersion.save();

  await EESecretService.takeSecretSnapshot({
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    folderId: child.id
  });

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.CREATE_FOLDER,
      metadata: {
        environment,
        folderId: child.id,
        folderName,
        folderPath: directory
      }
    },
    {
      workspaceId: new Types.ObjectId(workspaceId)
    }
  );

  return res.json({ folder: child });
};

/**
 * Update folder with id [folderId]
 * @param req
 * @param res
 * @returns
 */
export const updateFolderById = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Update folder'
    #swagger.description = 'Update folder'
    
    #swagger.security = [{
        "apiKeyAuth": [],
        "bearerAuth": []
    }]

    #swagger.parameters['folderName'] = {
        "description": "Name of folder to update",
        "required": true,
        "type": "string"
    }

    #swagger.requestBody = {
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "workspaceId": {
                            "type": "string",
                            "description": "ID of workspace where to update folder",
                            "example": "someWorkspaceId"
                        },
                        "environment": {
                            "type": "string",
                            "description": "Slug of environment where to update folder",
                            "example": "production"
                        },
                        "name": {
                            "type": "string",
                            "description": "Name of folder to update to",
                            "example": "updated_folder_name"
                        },
                        "directory": {
                            "type": "string",
                            "description": "Path where to update folder like / or /foo/bar. Default is /",
                            "example": "/foo/bar"
                        }
                    },
                    "required": ["workspaceId", "environment", "name"]
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
                            "description": "Success message",
                            "example": "Successfully updated folder"
                        },
                        "folder": {
                            "type": "object",
                            "properties": {
                                "name": {
                                    "type": "string",
                                    "description": "Name of updated folder",
                                    "example": "updated_folder_name"
                                },
                                "id": {
                                    "type": "string",
                                    "description": "ID of created folder",
                                    "example": "abc123"
                                }
                            },
                            "description": "Details of the updated folder"
                        }
                    }
                }
            }
        }
    }

    #swagger.responses[400] = {
        description: "Bad Request. Reasons can include 'The folder doesn't exist' or 'Folder name cannot contain spaces. Only underscore and dashes'"
    }

    #swagger.responses[401] = {
        description: "Unauthorized request. For example, 'Folder Permission Denied'"
    }
  */
  const {
    body: { workspaceId, environment, name, directory },
    params: { folderName }
  } = await validateRequest(reqValidator.UpdateFolderV1, req);

  if (!validateFolderName(name)) {
    throw BadRequestError({
      message: "Folder name cannot contain spaces. Only underscore and dashes"
    });
  }

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
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: directory })
    );
  }

  const folders = await Folder.findOne({ workspace: workspaceId, environment });
  if (!folders) {
    throw BadRequestError({ message: "The folder doesn't exist" });
  }

  const parentFolder = getFolderByPath(folders.nodes, directory);
  if (!parentFolder) {
    throw BadRequestError({ message: "The folder doesn't exist" });
  }

  const folder = parentFolder.children.find(({ name }) => name === folderName);
  if (!folder) throw ERR_FOLDER_NOT_FOUND;

  const oldFolderName = folder.name;
  parentFolder.version += 1;
  folder.name = name;

  await Folder.findByIdAndUpdate(folders._id, folders);
  const folderVersion = new FolderVersion({
    workspace: workspaceId,
    environment,
    nodes: parentFolder
  });
  await folderVersion.save();

  await EESecretService.takeSecretSnapshot({
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    folderId: parentFolder.id
  });

  const { folderPath } = getFolderWithPathFromId(folders.nodes, folder.id);

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.UPDATE_FOLDER,
      metadata: {
        environment,
        folderId: folder.id,
        oldFolderName,
        newFolderName: name,
        folderPath
      }
    },
    {
      workspaceId: new Types.ObjectId(workspaceId)
    }
  );

  return res.json({
    message: "Successfully updated folder",
    folder: { name: folder.name, id: folder.id }
  });
};

/**
 * Delete folder with id [folderId]
 * @param req
 * @param res
 * @returns
 */
export const deleteFolder = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Delete folder'
    #swagger.description = 'Delete folder'
    
    #swagger.security = [{
        "apiKeyAuth": [],
        "bearerAuth": []
    }]

    #swagger.parameters['folderName'] = {
        "description": "Name of folder to delete",
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
                            "description": "ID of the workspace where to delete folder",
                            "example": "someWorkspaceId"
                        },
                        "environment": {
                            "type": "string",
                            "description": "Slug of environment where to delete folder",
                            "example": "production"
                        },
                        "directory": {
                            "type": "string",
                            "description": "Path where to delete folder like / or /foo/bar. Default is /",
                            "example": "/foo/bar"
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
                        "message": {
                            "type": "string",
                            "description": "Success message",
                            "example": "successfully deleted folders"
                        },
                        "folders": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": {
                                        "type": "string",
                                        "description": "ID of deleted folder",
                                        "example": "abc123"
                                    },
                                    "name": {
                                        "type": "string",
                                        "description": "Name of deleted folder",
                                        "example": "someFolderName"
                                    }
                                }
                            },
                            "description": "List of IDs and names of deleted folders"
                        }
                    }
                }
            }
        }
    }

    #swagger.responses[400] = {
        description: "Bad Request. Reasons can include 'The folder doesn't exist'"
    }

    #swagger.responses[401] = {
        description: "Unauthorized request. For example, 'Folder Permission Denied'"
    }
  */
  const {
    params: { folderName },
    body: { environment, workspaceId, directory }
  } = await validateRequest(reqValidator.DeleteFolderV1, req);

  if (req.authData.authPayload instanceof ServiceTokenData) {
    const isValidScopeAccess = isValidScope(req.authData.authPayload, environment, directory);
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  } else {
    // check that user is a member of the workspace
    const { permission } = await getAuthDataProjectPermissions({
      authData: req.authData,
      workspaceId: new Types.ObjectId(workspaceId)
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: directory })
    );
  }

  const folders = await Folder.findOne({ workspace: workspaceId, environment });
  if (!folders) throw ERR_FOLDER_NOT_FOUND;

  const parentFolder = getFolderByPath(folders.nodes, directory);
  if (!parentFolder) throw ERR_FOLDER_NOT_FOUND;

  const index = parentFolder.children.findIndex(({ name }) => name === folderName);
  if (index === -1) throw ERR_FOLDER_NOT_FOUND;

  const deletedFolder = parentFolder.children.splice(index, 1)[0];

  parentFolder.version += 1;
  const delFolderIds = getAllFolderIds(deletedFolder);

  await Folder.findByIdAndUpdate(folders._id, folders);
  const folderVersion = new FolderVersion({
    workspace: workspaceId,
    environment,
    nodes: parentFolder
  });
  await folderVersion.save();
  if (delFolderIds.length) {
    await Secret.deleteMany({
      folder: { $in: delFolderIds.map(({ id }) => id) },
      workspace: workspaceId,
      environment
    });
  }

  await EESecretService.takeSecretSnapshot({
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    folderId: parentFolder.id
  });

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.DELETE_FOLDER,
      metadata: {
        environment,
        folderId: deletedFolder.id,
        folderName: deletedFolder.name,
        folderPath: directory
      }
    },
    {
      workspaceId: new Types.ObjectId(workspaceId)
    }
  );

  return res.send({ message: "successfully deleted folders", folders: delFolderIds });
};

/**
 * Get folders for workspace with id [workspaceId] and environment [environment]
 * considering directory/path [directory]
 * @param req
 * @param res
 * @returns
 */
export const getFolders = async (req: Request, res: Response) => {
  /*
    #swagger.summary = 'Get folders'
    #swagger.description = 'Get folders'
    
    #swagger.security = [{
        "apiKeyAuth": [],
        "bearerAuth": []
    }]

    #swagger.parameters['workspaceId'] = {
        "description": "ID of the workspace where to get folders from",
        "required": true,
        "type": "string",
        "in": "query"
    }

    #swagger.parameters['environment'] = {
        "description": "Slug of environment where to get folders from",
        "required": true,
        "type": "string",
        "in": "query"
    }

    #swagger.parameters['directory'] = {
        "description": "Path where to get fodlers from like / or /foo/bar. Default is /",
        "required": false,
        "type": "string",
        "in": "query"
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "folders": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": {
                                        "type": "string",
                                        "example": "someFolderId"
                                    },
                                    "name": {
                                        "type": "string",
                                        "example": "someFolderName"
                                    }
                                }
                            },
                            "description": "List of folders"
                        }
                    }
                }
            }
        }
    }

    #swagger.responses[400] = {
        description: "Bad Request. For instance, 'The folder doesn't exist'"
    }

    #swagger.responses[401] = {
        description: "Unauthorized request. For example, 'Folder Permission Denied'"
    }
  */
  const {
    query: { workspaceId, environment, directory }
  } = await validateRequest(reqValidator.GetFoldersV1, req);

  if (req.authData.authPayload instanceof ServiceTokenData) {
    const isValidScopeAccess = isValidScope(req.authData.authPayload, environment, directory);
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  } else {
    // check that user is a member of the workspace
    await getAuthDataProjectPermissions({
      authData: req.authData,
      workspaceId: new Types.ObjectId(workspaceId)
    });
  }

  const folders = await Folder.findOne({ workspace: workspaceId, environment });
  if (!folders) {
    return res.send({ folders: [], dir: [] });
  }

  const folder = getFolderByPath(folders.nodes, directory);

  return res.send({
    folders: folder?.children?.map(({ id, name }) => ({ id, name })) || []
  });
};
