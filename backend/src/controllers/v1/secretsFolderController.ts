import { ForbiddenError, subject } from "@casl/ability";
import { Request, Response } from "express";
import { Types } from "mongoose";
import { EventType, FolderVersion } from "@app/ee/models";
import { EEAuditLogService, EESecretService } from "@app/ee/services";
import { isValidScope } from "@app/helpers/secrets";
import { validateRequest } from "@app/helpers/validation";
import { Secret, ServiceTokenData } from "@app/models";
import { Folder } from "@app/models/folder";
import {
  appendFolder,
  deleteFolderById,
  generateFolderId,
  getAllFolderIds,
  getFolderByPath,
  getFolderWithPathFromId,
  getParentFromFolderId,
  validateFolderName
} from "@app/services/FolderService";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getUserProjectPermissions
} from "@app/ee/services/ProjectRoleService";
import { BadRequestError, UnauthorizedRequestError } from "@app/utils/errors";
import * as reqValidator from "@app/validation/folders";

/**
 * Create folder with name [folderName] for workspace with id [workspaceId]
 * and environment [environment]
 * @param req
 * @param res
 * @returns
 */
export const createFolder = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Create a folder'
    #swagger.description = 'Create a new folder in a specified workspace and environment'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.requestBody = {
        content: {
            "application/json": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "workspaceId": {
                            "type": "string",
                            "description": "ID of the workspace where the folder will be created",
                            "example": "someWorkspaceId"
                        },
                        "environment": {
                            "type": "string",
                            "description": "Environment where the folder will reside",
                            "example": "production"
                        },
                        "folderName": {
                            "type": "string",
                            "description": "Name of the folder to be created",
                            "example": "my_folder"
                        },
                        "parentFolderId": {
                            "type": "string",
                            "description": "ID of the parent folder under which this folder will be created. If not specified, it will be created at the root level.",
                            "example": "someParentFolderId"
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
                                    "example": "someFolderId"
                                },
                                "name": {
                                    "type": "string",
                                    "example": "my_folder"
                                }
                            },
                            "description": "Details of the created folder"
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
    body: { workspaceId, environment, folderName, parentFolderId }
  } = await validateRequest(reqValidator.CreateFolderV1, req);

  if (!validateFolderName(folderName)) {
    throw BadRequestError({
      message: "Folder name cannot contain spaces. Only underscore and dashes"
    });
  }

  const folders = await Folder.findOne({
    workspace: workspaceId,
    environment
  }).lean();

  if (req.user) {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    const secretPath =
      folders && parentFolderId
        ? getFolderWithPathFromId(folders.nodes, parentFolderId).folderPath
        : "/";
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Folders, { environment, secretPath })
    );
  }

  // space has no folders initialized

  if (!folders) {
    if (req.authData.authPayload instanceof ServiceTokenData) {
      // root check
      const isValidScopeAccess = isValidScope(req.authData.authPayload, environment, "/");
      if (!isValidScopeAccess) {
        throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
      }
    }

    const id = generateFolderId();
    const folder = new Folder({
      workspace: workspaceId,
      environment,
      nodes: {
        id: "root",
        name: "root",
        version: 1,
        children: [{ id, name: folderName, children: [], version: 1 }]
      }
    });
    await folder.save();
    const folderVersion = new FolderVersion({
      workspace: workspaceId,
      environment,
      nodes: folder.nodes
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
          folderId: id,
          folderName,
          folderPath: `root/${folderName}`
        }
      },
      {
        workspaceId: new Types.ObjectId(workspaceId)
      }
    );

    return res.json({ folder: { id, name: folderName } });
  }

  const folder = appendFolder(folders.nodes, { folderName, parentFolderId });

  await Folder.findByIdAndUpdate(folders._id, folders);

  const { folder: parentFolder, folderPath: parentFolderPath } = getFolderWithPathFromId(
    folders.nodes,
    parentFolderId || "root"
  );

  if (req.authData.authPayload instanceof ServiceTokenData) {
    // root check
    const isValidScopeAccess = isValidScope(
      req.authData.authPayload,
      environment,
      parentFolderPath
    );
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  }

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
    folderId: parentFolderId
  });

  const { folderPath } = getFolderWithPathFromId(folders.nodes, folder.id);

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.CREATE_FOLDER,
      metadata: {
        environment,
        folderId: folder.id,
        folderName,
        folderPath
      }
    },
    {
      workspaceId: new Types.ObjectId(workspaceId)
    }
  );

  return res.json({ folder });
};

/**
 * Update folder with id [folderId]
 * @param req
 * @param res
 * @returns
 */
export const updateFolderById = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Update a folder by ID'
    #swagger.description = 'Update the name of a folder in a specified workspace and environment by its ID'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.parameters['folderId'] = {
        "description": "ID of the folder to be updated",
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
                            "description": "ID of the workspace where the folder is located",
                            "example": "someWorkspaceId"
                        },
                        "environment": {
                            "type": "string",
                            "description": "Environment where the folder is located",
                            "example": "production"
                        },
                        "name": {
                            "type": "string",
                            "description": "New name for the folder",
                            "example": "updated_folder_name"
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
                            "example": "Successfully updated folder"
                        },
                        "folder": {
                            "type": "object",
                            "properties": {
                                "name": {
                                    "type": "string",
                                    "example": "updated_folder_name"
                                },
                                "id": {
                                    "type": "string",
                                    "example": "someFolderId"
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
    body: { workspaceId, environment, name },
    params: { folderId }
  } = await validateRequest(reqValidator.UpdateFolderV1, req);

  if (!validateFolderName(name)) {
    throw BadRequestError({
      message: "Folder name cannot contain spaces. Only underscore and dashes"
    });
  }

  const folders = await Folder.findOne({ workspace: workspaceId, environment });
  if (!folders) {
    throw BadRequestError({ message: "The folder doesn't exist" });
  }

  const parentFolder = getParentFromFolderId(folders.nodes, folderId);
  if (!parentFolder) {
    throw BadRequestError({ message: "The folder doesn't exist" });
  }

  if (req.user) {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    const secretPath = getFolderWithPathFromId(folders.nodes, parentFolder.id).folderPath;
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Folders, { environment, secretPath })
    );
  }

  const folder = parentFolder.children.find(({ id }) => id === folderId);
  if (!folder) {
    throw BadRequestError({ message: "The folder doesn't exist" });
  }

  if (req.authData.authPayload instanceof ServiceTokenData) {
    const { folderPath: secretPath } = getFolderWithPathFromId(folders.nodes, parentFolder.id);
    // root check
    const isValidScopeAccess = isValidScope(req.authData.authPayload, environment, secretPath);
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  }

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
    #swagger.summary = 'Delete a folder by ID'
    #swagger.description = 'Delete the specified folder from a specified workspace and environment using its ID'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.parameters['folderId'] = {
        "description": "ID of the folder to be deleted",
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
                            "description": "ID of the workspace where the folder is located",
                            "example": "someWorkspaceId"
                        },
                        "environment": {
                            "type": "string",
                            "description": "Environment where the folder is located",
                            "example": "production"
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
                            "example": "successfully deleted folders"
                        },
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
                            "description": "List of IDs and names of the deleted folders"
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
    params: { folderId },
    body: { environment, workspaceId }
  } = await validateRequest(reqValidator.DeleteFolderV1, req);

  const folders = await Folder.findOne({ workspace: workspaceId, environment });
  if (!folders) {
    throw BadRequestError({ message: "The folder doesn't exist" });
  }

  const delOp = deleteFolderById(folders.nodes, folderId);
  if (!delOp) {
    throw BadRequestError({ message: "The folder doesn't exist" });
  }
  const { deletedNode: delFolder, parent: parentFolder } = delOp;
  const { folderPath: secretPath } = getFolderWithPathFromId(folders.nodes, parentFolder.id);

  if (req.authData.authPayload instanceof ServiceTokenData) {
    const isValidScopeAccess = isValidScope(req.authData.authPayload, environment, secretPath);
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  } else {
    // check that user is a member of the workspace
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Folders, { environment, secretPath })
    );
  }

  parentFolder.version += 1;
  const delFolderIds = getAllFolderIds(delFolder);

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
        folderId,
        folderName: delFolder.name,
        folderPath: secretPath
      }
    },
    {
      workspaceId: new Types.ObjectId(workspaceId)
    }
  );

  res.send({ message: "successfully deleted folders", folders: delFolderIds });
};

/**
 * Get folders for workspace with id [workspaceId] and environment [environment]
 * considering [parentFolderId] and [parentFolderPath]
 * @param req
 * @param res
 * @returns
 */
export const getFolders = async (req: Request, res: Response) => {
  /*
    #swagger.summary = 'Retrieve folders based on specific conditions'
    #swagger.description = 'Fetches folders from the specified workspace and environment, optionally providing either a parentFolderId or a parentFolderPath to narrow down results'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.parameters['workspaceId'] = {
        "description": "ID of the workspace from which the folders are to be fetched",
        "required": true,
        "type": "string",
        "in": "query"
    }

    #swagger.parameters['environment'] = {
        "description": "Environment where the folder is located",
        "required": true,
        "type": "string",
        "in": "query"
    }

    #swagger.parameters['parentFolderId'] = {
        "description": "ID of the parent folder",
        "required": false,
        "type": "string",
        "in": "query"
    }

    #swagger.parameters['parentFolderPath'] = {
        "description": "Path of the parent folder, like /folder1/folder2",
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
                        },
                        "dir": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {
                                        "type": "string",
                                        "example": "parentFolderName"
                                    },
                                    "id": {
                                        "type": "string",
                                        "example": "parentFolderId"
                                    }
                                }
                            },
                            "description": "List of directories"
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
    query: { workspaceId, environment, parentFolderId, parentFolderPath }
  } = await validateRequest(reqValidator.GetFoldersV1, req);

  const folders = await Folder.findOne({ workspace: workspaceId, environment });

  if (req.user) {
    const { permission } = await getUserProjectPermissions(req.user._id, workspaceId);
    const secretPath =
      folders && parentFolderId
        ? getFolderWithPathFromId(folders.nodes, parentFolderId).folderPath
        : parentFolderPath || "/";

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Folders, { environment, secretPath })
    );
  }

  if (!folders) {
    res.send({ folders: [], dir: [] });
    return;
  }

  // if instead of parentFolderId given a path like /folder1/folder2
  if (parentFolderPath) {
    if (req.authData.authPayload instanceof ServiceTokenData) {
      const isValidScopeAccess = isValidScope(
        req.authData.authPayload,
        environment,
        parentFolderPath
      );
      if (!isValidScopeAccess) {
        throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
      }
    }
    const folder = getFolderByPath(folders.nodes, parentFolderPath);

    if (!folder) {
      res.send({ folders: [], dir: [] });
      return;
    }
    // dir is not needed at present as this is only used in overview section of secrets
    res.send({
      folders: folder.children.map(({ id, name }) => ({ id, name })),
      dir: [{ name: folder.name, id: folder.id }]
    });
  }

  if (!parentFolderId) {
    if (req.authData.authPayload instanceof ServiceTokenData) {
      const isValidScopeAccess = isValidScope(req.authData.authPayload, environment, "/");
      if (!isValidScopeAccess) {
        throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
      }
    }

    const rootFolders = folders.nodes.children.map(({ id, name }) => ({
      id,
      name
    }));
    res.send({ folders: rootFolders });
    return;
  }

  const { folder, folderPath, dir } = getFolderWithPathFromId(folders.nodes, parentFolderId);
  if (req.authData.authPayload instanceof ServiceTokenData) {
    const isValidScopeAccess = isValidScope(req.authData.authPayload, environment, folderPath);
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  }

  res.send({
    folders: folder.children.map(({ id, name }) => ({ id, name })),
    dir
  });
};
