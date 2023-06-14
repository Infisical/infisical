// import Folder from "../models/folder";

// export const ROOT_FOLDER_PATH = "/"

// export const getFolderPath = async (folderId: string) => {
//   let currentFolder = await Folder.findById(folderId);
//   const pathSegments = [];

//   while (currentFolder) {
//     pathSegments.unshift(currentFolder.name);
//     currentFolder = currentFolder.parent ? await Folder.findById(currentFolder.parent) : null;
//   }

//   return '/' + pathSegments.join('/');
// };

// /**
//   Returns the folder ID associated with the specified secret path in the given workspace and environment.
//   @param workspaceId - The ID of the workspace to search in.
//   @param environment - The environment to search in.
//   @param secretPath - The secret path to search for.
//   @returns The folder ID associated with the specified secret path, or undefined if the path is at the root folder level.
//   @throws Error if the specified secret path is not found.
// */
// export const getFolderIdFromPath = async (workspaceId: string, environment: string, secretPath: string) => {
//   const secretPathParts = secretPath.split("/").filter(path => path != "")
//   if (secretPathParts.length <= 1) {
//     return undefined // root folder, so no folder id
//   }

//   const folderId = await Folder.find({ path: secretPath, workspace: workspaceId, environment: environment })
//   if (!folderId) {
//     throw Error("Secret path not found")
//   }

//   return folderId
// }

// /**
//  * Cleans up a path by removing empty parts, duplicate slashes,
//  * and ensuring it starts with ROOT_FOLDER_PATH.
//  * @param path - The input path to clean up.
//  * @returns The cleaned-up path string.
//  */
// export const normalizePath = (path: string) => {
//   if (path == undefined || path == "" || path == ROOT_FOLDER_PATH) {
//     return ROOT_FOLDER_PATH
//   }

//   const pathParts = path.split("/").filter(part => part != "")
//   const cleanPathString = ROOT_FOLDER_PATH + pathParts.join("/")

//   return cleanPathString
// }

// export const getFoldersInDirectory = async (workspaceId: string, environment: string, pathString: string) => {
//   const normalizedPath = normalizePath(pathString)
//   const foldersInDirectory = await Folder.find({
//     workspace: workspaceId,
//     environment: environment,
//     parentPath: normalizedPath,
//   });

//   return foldersInDirectory;
// }

// /**
//  * Returns the parent path of the given path.
//  * @param path - The input path.
//  * @returns The parent path string.
//  */
// export const getParentPath = (path: string) => {
//   const normalizedPath = normalizePath(path);
//   const folderParts = normalizedPath.split('/').filter(part => part !== '');

//   let folderParent = ROOT_FOLDER_PATH;
//   if (folderParts.length > 1) {
//     folderParent = ROOT_FOLDER_PATH + folderParts.slice(0, folderParts.length - 1).join('/');
//   }

//   return folderParent;
// }

// export const validateFolderName = (folderName: string) => {
//   const validNameRegex = /^[a-zA-Z0-9-_]+$/;
//   return validNameRegex.test(folderName);
// }
