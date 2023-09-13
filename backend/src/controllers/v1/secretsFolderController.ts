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

// verify workspace id/environment
export const createFolder = async (req: Request, res: Response) => {
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

export const updateFolderById = async (req: Request, res: Response) => {
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

export const deleteFolder = async (req: Request, res: Response) => {
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

// TODO: validate workspace
export const getFolders = async (req: Request, res: Response) => {
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
