import { Types } from "mongoose";
import { Secret, ISecret } from "../../models";
import Folder from "../../models/folder";
import {
  getAllFolderIds,
  searchByFolderId,
} from "../../services/FolderService";
import {
  SecretSnapshot,
  SecretVersion,
  ISecretVersion,
  FolderVersion,
} from "../models";

/**
 * Save a secret snapshot that is a copy of the current state of secrets in workspace with id
 * [workspaceId] under a new snapshot with incremented version under the
 * secretsnapshots collection.
 * @param {Object} obj
 * @param {String} obj.workspaceId
 * @returns {SecretSnapshot} secretSnapshot - new secret snapshot
 */
const takeSecretSnapshotHelper = async ({
  workspaceId,
  environment,
  folderId = "root",
}: {
  workspaceId: Types.ObjectId;
  environment: string;
  folderId?: string;
}) => {
  // get all folder ids
  let folderIds: string[] = [];
  const folders = await Folder.findOne({
    workspace: workspaceId,
    environment,
  }).lean();
  if (folders && folderId) {
    const folder = searchByFolderId(folders.nodes, folderId);
    if (folder) folderIds = getAllFolderIds(folder).map(({ id }) => id);
  }

  const secQuery: Record<string, unknown> = {
    workspace: workspaceId,
    environment,
    // undefined means root thus collect all secrets
  };
  if (folderId !== "root") secQuery.folder = { $in: folderIds };
  const secretIds = (await Secret.find(secQuery, "_id").lean()).map(
    (s) => s._id
  );

  const latestSecretVersions = (
    await SecretVersion.aggregate([
      {
        $match: {
          environment,
          workspace: new Types.ObjectId(workspaceId),
          secret: {
            $in: secretIds,
          },
        },
      },
      {
        $group: {
          _id: "$secret",
          version: { $max: "$version" },
          versionId: { $max: "$_id" }, // secret version id
        },
      },
      {
        $sort: { version: -1 },
      },
    ]).exec()
  ).map((s) => s.versionId);
  const latestFolderVersion = await FolderVersion.findOne({
    environment,
    workspace: workspaceId,
    "nodes.id": folderId || "root",
  }).sort({ "nodes.version": -1 });

  const latestSecretSnapshot = await SecretSnapshot.findOne({
    workspace: workspaceId,
  }).sort({ version: -1 });

  const secretSnapshot = await new SecretSnapshot({
    workspace: workspaceId,
    environment,
    version: latestSecretSnapshot ? latestSecretSnapshot.version + 1 : 1,
    secretVersions: latestSecretVersions,
    folderId,
    folderVersion: latestFolderVersion,
  }).save();

  return secretSnapshot;
};

/**
 * Add secret versions [secretVersions] to the SecretVersion collection.
 * @param {Object} obj
 * @param {Object[]} obj.secretVersions
 * @returns {SecretVersion[]} newSecretVersions - new secret versions
 */
const addSecretVersionsHelper = async ({
  secretVersions,
}: {
  secretVersions: ISecretVersion[];
}) => {
  const newSecretVersions = await SecretVersion.insertMany(secretVersions);

  return newSecretVersions;
};

const markDeletedSecretVersionsHelper = async ({
  secretIds,
}: {
  secretIds: Types.ObjectId[];
}) => {
  await SecretVersion.updateMany(
    {
      secret: { $in: secretIds },
    },
    {
      isDeleted: true,
    },
    {
      new: true,
    }
  );
};

export {
  takeSecretSnapshotHelper,
  addSecretVersionsHelper,
  markDeletedSecretVersionsHelper
};
