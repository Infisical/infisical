import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TPamAccountDALFactory, TPamAccountDetail } from "../pam-account/pam-account-dal";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";

type TResolveAccountByPathDeps = {
  pamFolderDAL: Pick<TPamFolderDALFactory, "findOne">;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findOne" | "findByIdWithDetails">;
};

// Resolves a "folderName/accountName" path to a full account within a project. Shared by session
// launch and access-request creation so both accept the same path format.
export const resolveAccountByPath = async (
  { pamFolderDAL, pamAccountDAL }: TResolveAccountByPathDeps,
  projectId: string,
  path: string
): Promise<TPamAccountDetail> => {
  const separatorIdx = path.indexOf("/");
  if (separatorIdx === -1) {
    throw new BadRequestError({ message: "Path must be in the format 'folderName/accountName'" });
  }

  const folderName = path.slice(0, separatorIdx);
  const accountName = path.slice(separatorIdx + 1);
  if (!folderName || !accountName) {
    throw new BadRequestError({ message: "Path must be in the format 'folderName/accountName'" });
  }

  const folder = await pamFolderDAL.findOne({ projectId, name: folderName });
  if (!folder) {
    throw new NotFoundError({ message: `Folder '${folderName}' not found` });
  }

  const accountRow = await pamAccountDAL.findOne({ folderId: folder.id, name: accountName });
  if (!accountRow) {
    throw new NotFoundError({ message: `Account '${accountName}' not found in folder '${folderName}'` });
  }

  const account = await pamAccountDAL.findByIdWithDetails(accountRow.id);
  if (!account) {
    throw new NotFoundError({ message: `Account '${accountName}' not found` });
  }

  return account;
};
