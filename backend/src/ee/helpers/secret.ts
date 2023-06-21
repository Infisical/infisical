import { Types } from "mongoose";
import { Secret } from "../../models";
import {
  FolderVersion,
  ISecretVersion,
  SecretSnapshot,
  SecretVersion,
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
  const secretIds = (
    await Secret.find(
      {
        workspace: workspaceId,
        environment,
        folder: folderId,
      },
      "_id"
    ).lean()
  ).map((s) => s._id);

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
    "nodes.id": folderId,
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
  markDeletedSecretVersionsHelper,
};
