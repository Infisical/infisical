import { Types } from "mongoose";
import {
  Folder,
  ISecret,
  Secret,
  SecretImport
} from "../models";
import { getFolderByPath } from "./FolderService";

type TSecretImportFid = { environment: string; folderId: string; secretPath: string };

export const getAllImportedSecrets = async (
  workspaceId: string,
  environment: string,
  folderId = "root"
) => {
  const secImports = await SecretImport.findOne({
    workspace: workspaceId,
    environment,
    folderId
  });
  if (!secImports) return [];
  if (secImports.imports.length === 0) return [];

  const importedEnv: Record<string, boolean> = {}; // to get folders from all environment
  secImports.imports.forEach((el) => (importedEnv[el.environment] = true));

  const folders = await Folder.find({
    workspace: workspaceId,
    environment: { $in: Object.keys(importedEnv) }
  });

  const importedSecByFid: TSecretImportFid[] = [];
  secImports.imports.forEach((el) => {
    const folder = folders.find((fl) => fl.environment === el.environment);
    if (folder) {
      const secPathFolder = getFolderByPath(folder.nodes, el.secretPath);
      if (secPathFolder)
        importedSecByFid.push({
          environment: el.environment,
          folderId: secPathFolder.id,
          secretPath: el.secretPath
        });
    } else {
      if (el.secretPath === "/") {
        // this happens when importing with a fresh env without any folders
        importedSecByFid.push({ environment: el.environment, folderId: "root", secretPath: "/" });
      }
    }
  });
  if (importedSecByFid.length === 0) return [];

  const secsGroupedByRef = await Secret.aggregate([
    {
      $match: {
        workspace: new Types.ObjectId(workspaceId),
        type: "shared"
      }
    },
    {
      $lookup: {
        from: "tags", // note this is the name of the collection in the database, not the Mongoose model name
        localField: "tags",
        foreignField: "_id",
        as: "tags"
      }
    },
    {
      $group: {
        _id: {
          environment: "$environment",
          folderId: "$folder"
        },
        secrets: { $push: "$$ROOT" }
      }
    },
    {
      $match: {
        $or: importedSecByFid.map(({ environment, folderId: fid }) => ({
          "_id.environment": environment,
          "_id.folderId": fid
        }))
      }
    }
  ]);

  // now let stitch together secrets.
  const importedSecrets: Array<TSecretImportFid & { secrets: ISecret[] }> = [];
  importedSecByFid.forEach(({ environment, folderId, secretPath }) => {
    const secretsGrouped = secsGroupedByRef.find(
      (el) => el._id.environment === environment && el._id.folderId === folderId
    );
    if (secretsGrouped) {
      importedSecrets.push({ secretPath, folderId, environment, secrets: secretsGrouped.secrets });
    }
  });
  return importedSecrets;
};
