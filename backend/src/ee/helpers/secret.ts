import { Types } from "mongoose";
import { Secret, ISecret } from "../../models";
import { SecretSnapshot, SecretVersion, ISecretVersion } from "../models";

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
}: {
  workspaceId: Types.ObjectId;
}) => {
  const secretIds = (
    await Secret.find(
      {
        workspace: workspaceId,
      },
      "_id"
    )
  ).map((s) => s._id);

  const latestSecretVersions = (
    await SecretVersion.aggregate([
      {
        $match: {
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

  const latestSecretSnapshot = await SecretSnapshot.findOne({
    workspace: workspaceId,
  }).sort({ version: -1 });

  const secretSnapshot = await new SecretSnapshot({
    workspace: workspaceId,
    version: latestSecretSnapshot ? latestSecretSnapshot.version + 1 : 1,
    secretVersions: latestSecretVersions,
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

/**
 * Initialize secret versioning by setting previously unversioned
 * secrets to version 1 and begin populating secret versions.
 */
const initSecretVersioningHelper = async () => {
  await Secret.updateMany(
    { version: { $exists: false } },
    { $set: { version: 1 } }
  );

  const unversionedSecrets: ISecret[] = await Secret.aggregate([
    {
      $lookup: {
        from: "secretversions",
        localField: "_id",
        foreignField: "secret",
        as: "versions",
      },
    },
    {
      $match: {
        versions: { $size: 0 },
      },
    },
  ]);

  if (unversionedSecrets.length > 0) {
    await addSecretVersionsHelper({
      secretVersions: unversionedSecrets.map(
        (s, idx) =>
          new SecretVersion({
            ...s,
            secret: s._id,
            version: s.version ? s.version : 1,
            isDeleted: false,
            workspace: s.workspace,
            environment: s.environment,
          })
      ),
    });
  }
};

export {
  takeSecretSnapshotHelper,
  addSecretVersionsHelper,
  markDeletedSecretVersionsHelper,
  initSecretVersioningHelper,
};
