import { TPamFolderDALFactory } from "./pam-folder-dal";

type GetFullFolderPath = {
  pamFolderDAL: Pick<TPamFolderDALFactory, "find">;
  folderId?: string | null;
  projectId: string;
};

export const getFullPamFolderPath = async ({
  pamFolderDAL,
  folderId,
  projectId
}: GetFullFolderPath): Promise<string> => {
  if (!folderId) return "/";

  const folders = await pamFolderDAL.find({ projectId });
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));

  if (!folderMap.has(folderId)) return "";

  const path: string[] = [];
  let currentFolderId: string | null | undefined = folderId;

  while (currentFolderId) {
    const folder = folderMap.get(currentFolderId);
    if (!folder) break;

    path.unshift(folder.name);
    currentFolderId = folder.parentId;
  }

  return `/${path.join("/")}`;
};
