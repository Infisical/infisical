import Folder from "../models/folder";

export const getFolderPath = async (folderId: string) => {
  let currentFolder = await Folder.findById(folderId);
  const pathSegments = [];

  while (currentFolder) {
    pathSegments.unshift(currentFolder.name);
    currentFolder = currentFolder.parent ? await Folder.findById(currentFolder.parent) : null;
  }

  return '/' + pathSegments.join('/');
};