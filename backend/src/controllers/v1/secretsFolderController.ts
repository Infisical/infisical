import { Request, Response } from "express";
import { Types } from "mongoose";
import { EventType, FolderVersion } from "../../ee/models";
import { EEAuditLogService, EESecretService } from "../../ee/services";
import { validateMembership } from "../../helpers/membership";
import { isValidScope } from "../../helpers/secrets";
import { Folder, Secret, ServiceTokenData } from "../../models";
import {
  appendFolder,
  deleteFolderById,
  generateFolderId,
  getAllFolderIds,
  getFolderByPath,
  getFolderWithPathFromId,
  getParentFromFolderId,
  validateFolderName
} from "../../services/FolderService";
import { BadRequestError, UnauthorizedRequestError } from "../../utils/errors";
import { ADMIN, MEMBER } from "../../variables";

// verify workspace id/environment
export const createFolder = async (req: Request, res: Response) => {
  const { workspaceId, environment, folderName, parentFolderId } = req.body;
  if (!validateFolderName(folderName)) {
    throw BadRequestError({
      message: "Folder name cannot contain spaces. Only underscore and dashes"
    });
  }

  const folders = await Folder.findOne({
    workspace: workspaceId,
    environment
  }).lean();

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
      workspaceId,
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
    workspaceId,
    environment,
    folderId: parentFolderId
  });
  
  const {folderPath} = getFolderWithPathFromId(folders.nodes, folder.id);
  
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

export const updateFolderById = async (req: Request, res: Response) => {
  const { folderId } = req.params;
  const { name, workspaceId, environment } = req.body;
  if (!validateFolderName(name)) {
    throw BadRequestError({
      message: "Folder name cannot contain spaces. Only underscore and dashes"
    });
  }

  const folders = await Folder.findOne({ workspace: workspaceId, environment });
  if (!folders) {
    throw BadRequestError({ message: "The folder doesn't exist" });
  }

  if (!(req.authData.authPayload instanceof ServiceTokenData)) {
    // check that user is a member of the workspace
    await validateMembership({
      userId: req.user._id.toString(),
      workspaceId,
      acceptedRoles: [ADMIN, MEMBER]
    });
  }

  const parentFolder = getParentFromFolderId(folders.nodes, folderId);
  if (!parentFolder) {
    throw BadRequestError({ message: "The folder doesn't exist" });
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
    workspaceId,
    environment,
    folderId: parentFolder.id
  });

  const {folderPath} = getFolderWithPathFromId(folders.nodes, folder.id);
  
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

export const deleteFolder = async (req: Request, res: Response) => {
  const { folderId } = req.params;
  const { workspaceId, environment } = req.body;

  const folders = await Folder.findOne({ workspace: workspaceId, environment });
  if (!folders) {
    throw BadRequestError({ message: "The folder doesn't exist" });
  }

  if (!(req.authData.authPayload instanceof ServiceTokenData)) {
    // check that user is a member of the workspace
    await validateMembership({
      userId: req.user._id.toString(),
      workspaceId,
      acceptedRoles: [ADMIN, MEMBER]
    });
  }

  const {folderPath} = getFolderWithPathFromId(folders.nodes, folderId);

  const delOp = deleteFolderById(folders.nodes, folderId);
  if (!delOp) {
    throw BadRequestError({ message: "The folder doesn't exist" });
  }
  const { deletedNode: delFolder, parent: parentFolder } = delOp;

  if (req.authData.authPayload instanceof ServiceTokenData) {
    const { folderPath: secretPath } = getFolderWithPathFromId(folders.nodes, parentFolder.id);
    const isValidScopeAccess = isValidScope(req.authData.authPayload, environment, secretPath);
    if (!isValidScopeAccess) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
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
    workspaceId,
    environment,
    folderId: parentFolder.id
  });

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.DELETE_FOLDER ,
      metadata: {
        environment,
        folderId,
        folderName: delFolder.name,
        folderPath
      }
    },
    {
      workspaceId: new Types.ObjectId(workspaceId)
    }
  );

  res.send({ message: "successfully deleted folders", folders: delFolderIds });
};

// TODO: validate workspace
export const getFolders = async (req: Request, res: Response) => {
  const { workspaceId, environment, parentFolderId, parentFolderPath } = req.query as {
    workspaceId: string;
    environment: string;
    parentFolderId?: string;
    parentFolderPath?: string;
  };

  const folders = await Folder.findOne({ workspace: workspaceId, environment });
  if (!folders) {
    res.send({ folders: [], dir: [] });
    return;
  }

  if (!(req.authData.authPayload instanceof ServiceTokenData)) {
    // check that user is a member of the workspace
    await validateMembership({
      userId: req.user._id.toString(),
      workspaceId,
      acceptedRoles: [ADMIN, MEMBER]
    });
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
