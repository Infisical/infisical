import { Types } from "mongoose";
import { SecretVersion } from "../models";

/**
 * Return latest secret versions for secrets with ids [secretIds]
 * @param {Object} obj
 * @param {Object} obj.secretIds = ids of secrets to get latest versions for
 * @returns
 */
const getLatestSecretVersionIds = async ({
  secretIds,
}: {
  secretIds: Types.ObjectId[];
}) => {
  const latestSecretVersionIds = await SecretVersion.aggregate([
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
        versionId: { $max: "$_id" }, // id of latest secret version
      },
    },
    {
      $sort: { version: -1 },
    },
  ]).exec();

  return latestSecretVersionIds;
};

/**
 * Return latest [n] secret versions for secrets with ids [secretIds]
 * @param {Object} obj
 * @param {Object} obj.secretIds = ids of secrets to get latest versions for
 * @param {Number} obj.n - number of latest secret versions to return for each secret
 * @returns
 */
const getLatestNSecretSecretVersionIds = async ({
  secretIds,
  n,
}: {
  secretIds: Types.ObjectId[];
  n: number;
}) => {
  // TODO: optimize query
  const latestNSecretVersions = await SecretVersion.aggregate([
    {
      $match: {
        secret: {
          $in: secretIds,
        },
      },
    },
    {
      $sort: { version: -1 },
    },
    {
      $group: {
        _id: "$secret",
        versions: { $push: "$$ROOT" },
      },
    },
    {
      $project: {
        _id: 0,
        secret: "$_id",
        versions: { $slice: ["$versions", n] },
      },
    },
  ]);

  return latestNSecretVersions;
};

export { getLatestSecretVersionIds, getLatestNSecretSecretVersionIds };
