import { Request, Response } from 'express';
import { Secret } from '../../models';
import Folder from '../../models/folder';
import { BadRequestError } from '../../utils/errors';
import { ROOT_FOLDER_PATH, getFolderPath, getParentPath, normalizePath, validateFolderName } from '../../utils/folder';

// TODO
// verify workspace id/environment
export const createFolder = async (req: Request, res: Response) => {
  const { workspaceId, environment, folderName, parentFolderId } = req.body
  if (!validateFolderName(folderName)) {
    throw BadRequestError({ message: "Folder name cannot contain spaces. Only underscore and dashes" })
  }

  if (parentFolderId) {
    const parentFolder = await Folder.find({ environment: environment, workspace: workspaceId, id: parentFolderId });
    if (!parentFolder) {
      throw BadRequestError({ message: "The parent folder doesn't exist" })
    }
  }

  let completePath = await getFolderPath(parentFolderId)
  if (completePath == ROOT_FOLDER_PATH) {
    completePath = ""
  }

  const currentFolderPath = completePath + "/" + folderName // construct new path with current folder to be created
  const normalizedCurrentPath = normalizePath(currentFolderPath)
  const normalizedParentPath = getParentPath(normalizedCurrentPath)

  const existingFolder = await Folder.findOne({
    name: folderName,
    workspace: workspaceId,
    environment: environment,
    parent: parentFolderId,
    path: normalizedCurrentPath
  });

  if (existingFolder) {
    return res.json(existingFolder)
  }

  const newFolder = new Folder({
    name: folderName,
    workspace: workspaceId,
    environment: environment,
    parent: parentFolderId,
    path: normalizedCurrentPath,
    parentPath: normalizedParentPath
  });

  await newFolder.save();

  return res.json(newFolder)
}

export const deleteFolder = async (req: Request, res: Response) => {
  const { folderId } = req.params
  const queue: any[] = [folderId];

  const folder = await Folder.findById(folderId);
  if (!folder) {
    throw BadRequestError({ message: "The folder doesn't exist" })
  }

  while (queue.length > 0) {
    const currentFolderId = queue.shift();

    const childFolders = await Folder.find({ parent: currentFolderId });
    for (const childFolder of childFolders) {
      queue.push(childFolder._id);
    }

    await Secret.deleteMany({ folder: currentFolderId });

    await Folder.deleteOne({ _id: currentFolderId });
  }

  res.send()
}