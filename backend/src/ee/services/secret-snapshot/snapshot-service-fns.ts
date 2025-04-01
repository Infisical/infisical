import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

type GetFullFolderPath = {
  folderDAL: Pick<TSecretFolderDALFactory, "findById" | "find">; // Added findAllInEnv
  folderId: string;
  envId: string;
};

export const getFullFolderPath = async ({ folderDAL, folderId, envId }: GetFullFolderPath): Promise<string> => {
  // Helper function to remove duplicate slashes
  const removeDuplicateSlashes = (path: string) => {
    const chars = [];
    let lastWasSlash = false;

    for (let i = 0; i < path.length; i += 1) {
      const char = path[i];
      if (char !== "/" || !lastWasSlash) chars.push(char);
      lastWasSlash = char === "/";
    }

    return chars.join("");
  };

  // Fetch all folders at once based on environment ID to avoid multiple queries
  const folders = await folderDAL.find({ envId });
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));

  const buildPath = (currFolderId: string): string => {
    const folder = folderMap.get(currFolderId);
    if (!folder) return "";
    const folderPathSegment = !folder.parentId && folder.name === "root" ? "/" : `/${folder.name}`;
    if (folder.parentId) {
      return removeDuplicateSlashes(`${buildPath(folder.parentId)}${folderPathSegment}`);
    }
    return removeDuplicateSlashes(folderPathSegment);
  };

  return buildPath(folderId);
};
