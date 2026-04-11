import { TSecretFolders } from "@app/db/schemas";
import { InternalServerError } from "@app/lib/errors";

export const buildFolderPath = (
  folder: TSecretFolders,
  foldersMap: Record<string, TSecretFolders>,
  depth: number = 0
): string => {
  if (depth > 20) {
    throw new InternalServerError({ message: "Maximum folder depth of 20 exceeded" });
  }
  if (!folder.parentId) {
    return depth === 0 ? "/" : "";
  }

  const parent = foldersMap[folder.parentId];
  if (!parent) {
    // Orphaned folder
    return `/${folder.name}`;
  }

  return `${buildFolderPath(parent, foldersMap, depth + 1)}/${folder.name}`;
};

export const buildFolderIdMap = (folders: TSecretFolders[]): Record<string, TSecretFolders> => {
  const map: Record<string, TSecretFolders> = {};
  for (const folder of folders) {
    map[folder.id] = folder;
  }
  return map;
};

export const buildChildrenMap = (folders: TSecretFolders[]): Record<string, TSecretFolders[]> => {
  const map: Record<string, TSecretFolders[]> = {};
  for (const folder of folders) {
    const key = folder.parentId || "null";
    if (!map[key]) {
      map[key] = [];
    }
    map[key].push(folder);
  }
  return map;
};

export const resolvePathToFolder = (
  childrenMap: Record<string, TSecretFolders[]>,
  pathSegments: string[]
): TSecretFolders | undefined => {
  const roots = childrenMap.null || [];
  const root = roots[0];
  if (!root) return undefined;

  if (pathSegments.length === 0) return root;

  let current = root;
  for (const segment of pathSegments) {
    const children = childrenMap[current.id] || [];
    const next = children.find((f) => f.name === segment);
    if (!next) return undefined;
    current = next;
  }
  return current;
};

export const resolveClosestFolder = (
  childrenMap: Record<string, TSecretFolders[]>,
  pathSegments: string[]
): TSecretFolders | undefined => {
  const roots = childrenMap.null || [];
  const root = roots[0];
  if (!root) return undefined;

  if (pathSegments.length === 0) return root;

  let current = root;
  for (const segment of pathSegments) {
    const children = childrenMap[current.id] || [];
    const next = children.find((f) => f.name === segment);
    if (!next) return current;
    current = next;
  }
  return current;
};
