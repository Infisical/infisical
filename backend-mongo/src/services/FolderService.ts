import { nanoid } from "nanoid";
import { Types } from "mongoose";
import { Folder, TFolderSchema } from "../models";
import path from "path";

type TAppendFolderDTO = {
  folderName: string;
  directory: string;
};

type TRenameFolderDTO = {
  folderName: string;
  folderId: string;
};

export const validateFolderName = (folderName: string) => {
  const validNameRegex = /^[a-zA-Z0-9-_]+$/;
  return validNameRegex.test(folderName);
};

export const generateFolderId = (): string => nanoid(12);

// simple bfs search
export const searchByFolderId = (
  root: TFolderSchema,
  folderId: string
): TFolderSchema | undefined => {
  const queue = [root];
  while (queue.length) {
    const folder = queue.pop() as TFolderSchema;
    if (folder.id === folderId) {
      return folder;
    }
    queue.push(...folder.children);
  }
};

export const folderBfsTraversal = async (
  root: TFolderSchema,
  callback: (data: TFolderSchema) => void | Promise<void>
) => {
  const queue = [root];
  while (queue.length) {
    const folder = queue.pop() as TFolderSchema;
    await callback(folder);
    queue.push(...folder.children);
  }
};

// bfs and then append to the folder
const appendChild = (folders: TFolderSchema, folderName: string) => {
  const folder = folders.children.find(({ name }) => name === folderName);
  if (folder) return { folder, hasCreated: false };

  const id = generateFolderId();
  folders.version += 1;
  folders.children.push({
    id,
    name: folderName,
    children: [],
    version: 1
  });
  // last element that is the new one
  return { folder: folders.children[folders.children.length - 1], hasCreated: true };
};

// root of append child wrapper
export const appendFolder = (
  folders: TFolderSchema,
  { folderName, directory }: TAppendFolderDTO
): { parent: TFolderSchema; child: TFolderSchema; hasCreated?: boolean } => {
  if (directory === "/") {
    const newFolder = appendChild(folders, folderName);
    return { parent: folders, child: newFolder.folder, hasCreated: newFolder.hasCreated };
  }

  const segments = directory.split("/").filter(Boolean);
  const segment = segments.shift();
  if (segment) {
    const nestedFolders = appendChild(folders, segment);
    return appendFolder(nestedFolders.folder, {
      folderName,
      directory: path.join("/", ...segments)
    });
  }

  const newFolder = appendChild(folders, folderName);
  return { parent: folders, child: newFolder.folder, hasCreated: newFolder.hasCreated };
};

export const renameFolder = (
  folders: TFolderSchema,
  { folderName, folderId }: TRenameFolderDTO
) => {
  const folder = searchByFolderId(folders, folderId);
  if (!folder) {
    throw new Error("Folder doesn't exist");
  }

  folder.name = folderName;
};

// bfs but stops on parent folder
// Then unmount the required child and then return both
export const deleteFolderById = (folders: TFolderSchema, folderId: string) => {
  const queue = [folders];
  while (queue.length) {
    const folder = queue.pop() as TFolderSchema;
    const index = folder.children.findIndex(({ id }) => folderId === id);
    if (index !== -1) {
      const deletedFolder = folder.children.splice(index, 1);
      return { deletedNode: deletedFolder[0], parent: folder };
    }
    queue.push(...folder.children);
  }
};

// bfs but return parent of the folderID
export const getParentFromFolderId = (folders: TFolderSchema, folderId: string) => {
  const queue = [folders];
  while (queue.length) {
    const folder = queue.pop() as TFolderSchema;
    const index = folder.children.findIndex(({ id }) => folderId === id);
    if (index !== -1) return folder;

    queue.push(...folder.children);
  }
};

// to get all folders ids from everything from below nodes
export const getAllFolderIds = (folders: TFolderSchema) => {
  const folderIds: Array<{ id: string; name: string }> = [];
  const queue = [folders];
  while (queue.length) {
    const folder = queue.pop() as TFolderSchema;
    folderIds.push({ id: folder.id, name: folder.name });
    queue.push(...folder.children);
  }
  return folderIds;
};

// To get the path of a folder from the root. Used for breadcrumbs
// LOGIC: We do dfs instead if bfs
// Each time we go down we record the current node
// We then record the number of childs of each root node
// When we reach leaf node or when all childs of a root node are visited
// We remove it from path recorded by using the total child record
export const searchByFolderIdWithDir = (folders: TFolderSchema, folderId: string) => {
  const stack = [folders];
  const dir: Array<{ id: string; name: string }> = [];
  const hits: Record<string, number> = {};

  while (stack.length) {
    const folder = stack.shift() as TFolderSchema;
    // score the hit
    hits[folder.id] = folder.children.length;
    const parent = dir[dir.length - 1];
    if (parent) hits[parent.id] -= 1;

    if (folder.id === folderId) {
      dir.push({ name: folder.name, id: folder.id });
      return { folder, dir };
    }

    if (folder.children.length) {
      dir.push({ name: folder.name, id: folder.id });
      stack.unshift(...folder.children);
    } else {
      if (!hits[parent.id]) {
        dir.pop();
      }
    }
  }
  return;
};

// used for get folder path from id
export const getFolderWithPathFromId = (folders: TFolderSchema, parentFolderId: string) => {
  const search = searchByFolderIdWithDir(folders, parentFolderId);
  if (!search) {
    throw { message: "Folder permission denied" };
  }
  const { folder, dir } = search;
  const folderPath = path.join(
    "/",
    ...dir.filter(({ name }) => name !== "root").map(({ name }) => name)
  );
  return { folder, folderPath, dir };
};

// to get folder of a path given
// Like /frontend/folder#1
export const getFolderByPath = (folders: TFolderSchema, searchPath: string) => {
  // corner case when its just / return root
  if (searchPath === "/") {
    return folders.id === "root" ? folders : undefined;
  }

  const path = searchPath.split("/").filter(Boolean);
  const queue = [folders];
  let segment: TFolderSchema | undefined;
  while (queue.length && path.length) {
    const folder = queue.pop();
    const segmentPath = path.shift();
    segment = folder?.children.find(({ name }) => name === segmentPath);
    if (!segment) return;

    queue.push(segment);
  }
  return segment;
};

export const getFolderIdFromServiceToken = async (
  workspaceId: Types.ObjectId | string,
  environment: string,
  secretPath: string
) => {
  const folders = await Folder.findOne({
    workspace: workspaceId,
    environment
  });

  if (!folders) {
    if (secretPath !== "/") throw new Error("Invalid path. Folders not found");
  } else {
    const folder = getFolderByPath(folders.nodes, secretPath);
    if (!folder) {
      throw new Error("Folder not found");
    }
    return folder.id;
  }
  return "root";
};
