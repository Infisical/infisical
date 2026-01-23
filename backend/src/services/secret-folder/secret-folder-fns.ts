import { TSecretFolders } from "@app/db/schemas/secret-folders";
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

  return `${buildFolderPath(foldersMap[folder.parentId], foldersMap, depth + 1)}/${folder.name}`;
};
