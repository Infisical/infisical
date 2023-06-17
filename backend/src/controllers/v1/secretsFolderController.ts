import { Request, Response } from "express";
import { Secret } from "../../models";
import Folder from "../../models/folder";
import { BadRequestError } from "../../utils/errors";
import {
  appendFolder,
  deleteFolderById,
  getAllFolderIds,
  searchByFolderIdWithDir,
  searchByFolderId,
  validateFolderName,
  generateFolderId,
  getParentFromFolderId,
  getFolderByPath,
} from "../../services/FolderService";
import { ADMIN, MEMBER } from "../../variables";
import { validateMembership } from "../../helpers/membership";
import { FolderVersion } from "../../ee/models";
import { EESecretService } from "../../ee/services";

// TODO
// verify workspace id/environment
export const createFolder = async (req: Request, res: Response) => {
  const { workspaceId, environment, folderName, parentFolderId } = req.body;
  if (!validateFolderName(folderName)) {
    throw BadRequestError({
      message: "Folder name cannot contain spaces. Only underscore and dashes",
    });
  }

  const folders = await Folder.findOne({
    workspace: workspaceId,
    environment,
  }).lean();
  // space has no folders initialized
  if (!folders) {
    const id = generateFolderId();
    const folder = new Folder({
      workspace: workspaceId,
      environment,
      nodes: {
        id: "root",
        name: "root",
        version: 1,
        children: [{ id, name: folderName, children: [], version: 1 }],
      },
    });
    await folder.save();
    const folderVersion = new FolderVersion({
      workspace: workspaceId,
      environment,
      nodes: folder.nodes,
    });
    await folderVersion.save();
    await EESecretService.takeSecretSnapshot({
      workspaceId,
      environment,
    });
    return res.json({ folder: { id, name: folderName } });
  }

  const folder = appendFolder(folders.nodes, { folderName, parentFolderId });
  await Folder.findByIdAndUpdate(folders._id, folders);

  const parentFolder = searchByFolderId(folders.nodes, parentFolderId);
  const folderVersion = new FolderVersion({
    workspace: workspaceId,
    environment,
    nodes: parentFolder,
  });
  await folderVersion.save();

  await EESecretService.takeSecretSnapshot({
    workspaceId,
    environment,
    folderId: parentFolderId,
  });

  return res.json({ folder });
};

export const updateFolderById = async (req: Request, res: Response) => {
  const { folderId } = req.params;
  const { name, workspaceId, environment } = req.body;

  const folders = await Folder.findOne({ workspace: workspaceId, environment });
  if (!folders) {
    throw BadRequestError({ message: "The folder doesn't exist" });
  }

  // check that user is a member of the workspace
  await validateMembership({
    userId: req.user._id.toString(),
    workspaceId,
    acceptedRoles: [ADMIN, MEMBER],
  });

  const parentFolder = getParentFromFolderId(folders.nodes, folderId);
  if (!parentFolder) {
    throw BadRequestError({ message: "The folder doesn't exist" });
  }
  const folder = parentFolder.children.find(({ id }) => id === folderId);
  if (!folder) {
    throw BadRequestError({ message: "The folder doesn't exist" });
  }

  parentFolder.version += 1;
  folder.name = name;

  await Folder.findByIdAndUpdate(folders._id, folders);
  const folderVersion = new FolderVersion({
    workspace: workspaceId,
    environment,
    nodes: parentFolder,
  });
  await folderVersion.save();

  await EESecretService.takeSecretSnapshot({
    workspaceId,
    environment,
    folderId: parentFolder.id,
  });

  return res.json({
    message: "Successfully updated folder",
    folder: { name: folder.name, id: folder.id },
  });
};

export const deleteFolder = async (req: Request, res: Response) => {
  const { folderId } = req.params;
  const { workspaceId, environment } = req.body;

  const folders = await Folder.findOne({ workspace: workspaceId, environment });
  if (!folders) {
    throw BadRequestError({ message: "The folder doesn't exist" });
  }

  // check that user is a member of the workspace
  await validateMembership({
    userId: req.user._id.toString(),
    workspaceId,
    acceptedRoles: [ADMIN, MEMBER],
  });

  const delOp = deleteFolderById(folders.nodes, folderId);
  if (!delOp) {
    throw BadRequestError({ message: "The folder doesn't exist" });
  }
  const { deletedNode: delFolder, parent: parentFolder } = delOp;

  parentFolder.version += 1;
  const delFolderIds = getAllFolderIds(delFolder);

  await Folder.findByIdAndUpdate(folders._id, folders);
  const folderVersion = new FolderVersion({
    workspace: workspaceId,
    environment,
    nodes: parentFolder,
  });
  await folderVersion.save();
  if (delFolderIds.length) {
    await Secret.deleteMany({
      folder: { $in: delFolderIds.map(({ id }) => id) },
      workspace: workspaceId,
      environment,
    });
  }

  await EESecretService.takeSecretSnapshot({
    workspaceId,
    environment,
    folderId: parentFolder.id,
  });

  res.send({ message: "successfully deleted folders", folders: delFolderIds });
};

// TODO: validate workspace
export const getFolders = async (req: Request, res: Response) => {
  const { workspaceId, environment, parentFolderId, parentFolderPath } =
    req.query as {
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

  // check that user is a member of the workspace
  await validateMembership({
    userId: req.user._id.toString(),
    workspaceId,
    acceptedRoles: [ADMIN, MEMBER],
  });

  // if instead of parentFolderId given a path like /folder1/folder2
  if (parentFolderPath) {
    const folder = getFolderByPath(folders.nodes, parentFolderPath);
    if (!folder) {
      res.send({ folders: [], dir: [] });
      return;
    }
    // dir is not needed at present as this is only used in overview section of secrets
    res.send({
      folders: folder.children.map(({ id, name }) => ({ id, name })),
      dir: [{ name: folder.name, id: folder.id }],
    });
  }

  if (!parentFolderId) {
    const rootFolders = folders.nodes.children.map(({ id, name }) => ({
      id,
      name,
    }));
    res.send({ folders: rootFolders });
    return;
  }

  const folderBySearch = searchByFolderIdWithDir(folders.nodes, parentFolderId);
  if (!folderBySearch) {
    throw BadRequestError({ message: "The folder doesn't exist" });
  }
  const { folder, dir } = folderBySearch;

  res.send({
    folders: folder.children.map(({ id, name }) => ({ id, name })),
    dir,
  });
};
