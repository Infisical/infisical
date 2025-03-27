import { TSecretFolders } from "@app/db/schemas";

export const buildFolderPath = (
  folder: TSecretFolders,
  foldersMap: Record<string, TSecretFolders>,
  depth: number = 0
): string => {
  if (depth > 20) return "";
  if (!folder.parentId) {
    return depth === 0 ? "/" : "";
  }

  return `${buildFolderPath(foldersMap[folder.parentId], foldersMap, depth + 1)}/${folder.name}`;
};
