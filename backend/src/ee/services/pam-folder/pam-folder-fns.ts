import { TPamFolderDALFactory } from "./pam-folder-dal";

type GetFullFolderPath = {
  pamFolderDAL: Pick<TPamFolderDALFactory, "find">;
  projectId: string;
};

export const getFullPamFolderPath = async ({
  pamFolderDAL,
  projectId
}: GetFullFolderPath): Promise<(arg: { folderId?: string | null }) => string> => {
  const folders = await pamFolderDAL.find({ projectId });
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));

  return ({ folderId }) => {
    if (!folderId) return "/";

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
};
