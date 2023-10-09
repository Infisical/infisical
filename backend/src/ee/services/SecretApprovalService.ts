import picomatch from "picomatch";
import { Types } from "mongoose";
import {
  containsGlobPatterns,
  generateSecretBlindIndexWithSaltHelper,
  getSecretBlindIndexSaltHelper
} from "../../helpers/secrets";
import { Folder, ISecret, Secret } from "../../models";
import { ISecretApprovalPolicy, SecretApprovalPolicy } from "../models/secretApprovalPolicy";
import {
  CommitType,
  ISecretApprovalRequest,
  ISecretApprovalSecChange,
  ISecretCommits,
  SecretApprovalRequest
} from "../models/secretApprovalRequest";
import { BadRequestError } from "../../utils/errors";
import { getFolderByPath } from "../../services/FolderService";
import { ALGORITHM_AES_256_GCM, ENCODING_SCHEME_UTF8, SECRET_SHARED } from "../../variables";
import TelemetryService from "../../services/TelemetryService";
import { EEAuditLogService, EESecretService } from "../services";
import { EventType, SecretVersion } from "../models";
import { AuthData } from "../../interfaces/middleware";

// if glob pattern score is 1, if not exist score is 0 and if its not both then its exact path meaning score 2
const getPolicyScore = (policy: ISecretApprovalPolicy) =>
  policy.secretPath ? (containsGlobPatterns(policy.secretPath) ? 1 : 2) : 0;

// this will fetch the policy that gets priority for an environment and secret path
export const getSecretPolicyOfBoard = async (
  workspaceId: string,
  environment: string,
  secretPath: string
) => {
  const policies = await SecretApprovalPolicy.find({ workspace: workspaceId, environment });
  if (!policies) return;
  // this will filter policies either without scoped to secret path or the one that matches with secret path
  const policiesFilteredByPath = policies.filter(
    ({ secretPath: policyPath }) =>
      !policyPath || picomatch.isMatch(secretPath, policyPath, { strictSlashes: false })
  );
  // now sort by priority. exact secret path gets first match followed by glob followed by just env scoped
  // if that is tie get by first createdAt
  const policiesByPriority = policiesFilteredByPath.sort(
    (a, b) => getPolicyScore(b) - getPolicyScore(a)
  );
  const finalPolicy = policiesByPriority.shift();
  return finalPolicy;
};

const getLatestSecretVersion = async (secretIds: Types.ObjectId[]) => {
  const latestSecretVersions = await SecretVersion.aggregate([
    {
      $match: {
        secret: {
          $in: secretIds
        },
        type: SECRET_SHARED
      }
    },
    {
      $sort: { version: -1 }
    },
    {
      $group: {
        _id: "$secret",
        version: { $max: "$version" },
        versionId: { $max: "$_id" }, // id of latest secret versionId
        secret: { $first: "$$ROOT" }
      }
    }
  ]).exec();
  // reduced with secret id and latest version as document
  return latestSecretVersions.reduce(
    (prev, curr) => ({ ...prev, [curr._id.toString()]: curr.secret }),
    {}
  );
};

type TApprovalCreateSecret = Omit<ISecretApprovalSecChange, "_id" | "version"> & {
  secretName: string;
};
type TApprovalUpdateSecret = Partial<Omit<ISecretApprovalSecChange, "_id" | "version">> & {
  secretName: string;
  newSecretName?: string;
};

type TGenerateSecretApprovalRequestArg = {
  workspaceId: string;
  environment: string;
  secretPath: string;
  policy: ISecretApprovalPolicy;
  data: {
    [CommitType.CREATE]?: TApprovalCreateSecret[];
    [CommitType.UPDATE]?: TApprovalUpdateSecret[];
    [CommitType.DELETE]?: { secretName: string }[];
  };
  commiterMembershipId: string;
  authData: AuthData;
};

export const generateSecretApprovalRequest = async ({
  workspaceId,
  environment,
  secretPath,
  policy,
  data,
  commiterMembershipId,
  authData
}: TGenerateSecretApprovalRequestArg) => {
  // calculate folder id from secret path
  let folderId = "root";
  const rootFolder = await Folder.findOne({ workspace: workspaceId, environment });
  if (!rootFolder && secretPath !== "/") throw BadRequestError({ message: "Folder not found" });
  if (rootFolder) {
    const folder = getFolderByPath(rootFolder.nodes, secretPath);
    if (!folder) throw BadRequestError({ message: "Folder not found" });
    folderId = folder.id;
  }

  // generate secret blindIndexes
  const salt = await getSecretBlindIndexSaltHelper({
    workspaceId: new Types.ObjectId(workspaceId)
  });
  const commits: ISecretApprovalRequest["commits"] = [];

  // -----
  // for created secret approval change
  const createdSecret = data[CommitType.CREATE];
  if (createdSecret && createdSecret?.length) {
    // validation checks whether secret exists for creation
    const secretBlindIndexes = await Promise.all(
      createdSecret.map(({ secretName }) =>
        generateSecretBlindIndexWithSaltHelper({
          secretName,
          salt
        })
      )
    ).then((blindIndexes) =>
      blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
        prev[createdSecret[i].secretName] = curr;
        return prev;
      }, {})
    );
    // check created secret exists
    const exists = await Secret.exists({
      workspace: new Types.ObjectId(workspaceId),
      folder: folderId,
      environment
    })
      .or(
        createdSecret.map(({ secretName }) => ({
          secretBlindIndex: secretBlindIndexes[secretName],
          type: SECRET_SHARED
        }))
      )
      .exec();
    if (exists) throw BadRequestError({ message: "Secrets already exist" });
    commits.push(
      ...createdSecret.map((el) => ({
        op: CommitType.CREATE as const,
        newVersion: {
          ...el,
          version: 0,
          _id: new Types.ObjectId(),
          secretBlindIndex: secretBlindIndexes[el.secretName]
        }
      }))
    );
  }

  // ----
  // updated secrets approval change
  const updatedSecret = data[CommitType.UPDATE];
  if (updatedSecret && updatedSecret?.length) {
    // validation checks whether secret doesn't exists for update
    const secretBlindIndexes = await Promise.all(
      updatedSecret.map(({ secretName }) =>
        generateSecretBlindIndexWithSaltHelper({
          secretName,
          salt
        })
      )
    ).then((blindIndexes) =>
      blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
        prev[updatedSecret[i].secretName] = curr;
        return prev;
      }, {})
    );
    // check update secret exists
    const oldSecrets = await Secret.find({
      workspace: new Types.ObjectId(workspaceId),
      folder: folderId,
      environment,
      type: SECRET_SHARED,
      secretBlindIndex: {
        $in: updatedSecret.map(({ secretName }) => secretBlindIndexes[secretName])
      }
    })
      .select("+secretBlindIndex")
      .lean()
      .exec();
    if (oldSecrets.length !== updatedSecret.length)
      throw BadRequestError({ message: "Secrets already exist" });

    // finally check updating blindindex exist
    const nameUpdatedSecrets = updatedSecret.filter(({ newSecretName }) => Boolean(newSecretName));
    const newSecretBlindIndexes = await Promise.all(
      nameUpdatedSecrets.map(({ newSecretName }) =>
        generateSecretBlindIndexWithSaltHelper({
          secretName: newSecretName as string,
          salt
        })
      )
    ).then((blindIndexes) =>
      blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
        prev[nameUpdatedSecrets[i].secretName] = curr;
        return prev;
      }, {})
    );
    const doesAnySecretExistWithNewIndex = await Secret.find({
      workspace: new Types.ObjectId(workspaceId),
      folder: folderId,
      environment,
      secretBlindIndex: { $in: Object.values(newSecretBlindIndexes) }
    });
    if (doesAnySecretExistWithNewIndex.length)
      throw BadRequestError({ message: "Secret with new name already exist" });

    const oldSecretsGroupById = oldSecrets.reduce<Record<string, ISecret>>(
      (prev, curr) => ({ ...prev, [curr?.secretBlindIndex || ""]: curr }),
      {}
    );
    const latestSecretVersions = await getLatestSecretVersion(
      updatedSecret.map((el) => oldSecretsGroupById[secretBlindIndexes[el.secretName]]._id)
    );

    commits.push(
      ...updatedSecret.map((el) => {
        const secretId = oldSecretsGroupById[secretBlindIndexes[el.secretName]]._id;
        return {
          op: CommitType.UPDATE as const,
          secret: secretId,
          secretVersion: latestSecretVersions[secretId.toString()]._id,
          newVersion: {
            ...el,
            secretBlindIndex: newSecretBlindIndexes?.[el.secretName],
            _id: new Types.ObjectId(),
            version: oldSecretsGroupById[secretBlindIndexes[el.secretName]].version || 1
          }
        };
      })
    );
  }

  // -----
  // deleted secrets
  const deletedSecrets = data[CommitType.DELETE];
  if (deletedSecrets && deletedSecrets.length) {
    const secretBlindIndexes = await Promise.all(
      deletedSecrets.map(({ secretName }) =>
        generateSecretBlindIndexWithSaltHelper({
          secretName,
          salt
        })
      )
    ).then((blindIndexes) =>
      blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
        prev[deletedSecrets[i].secretName] = curr;
        return prev;
      }, {})
    );

    const secretsToDelete = await Secret.find({
      workspace: new Types.ObjectId(workspaceId),
      folder: folderId,
      environment,
      type: SECRET_SHARED,
      secretBlindIndex: {
        $in: deletedSecrets.map(({ secretName }) => secretBlindIndexes[secretName])
      }
    })
      .select({ secretBlindIndex: 1, _id: 1 })
      .lean()
      .exec();
    if (secretsToDelete.length !== deletedSecrets.length)
      throw BadRequestError({ message: "Deleted secrets not found" });

    const oldSecretsGroupById = secretsToDelete.reduce<Record<string, ISecret>>(
      (prev, curr) => ({ ...prev, [curr?.secretBlindIndex || ""]: curr }),
      {}
    );
    const latestSecretVersions = await getLatestSecretVersion(
      deletedSecrets.map((el) => oldSecretsGroupById[secretBlindIndexes[el.secretName]]._id)
    );

    commits.push(
      ...deletedSecrets.map((el) => {
        const secretId = oldSecretsGroupById[secretBlindIndexes[el.secretName]]._id;
        return {
          op: CommitType.DELETE as const,
          secret: secretId,
          secretVersion: latestSecretVersions[secretId.toString()]
        };
      })
    );
  }

  const secretApprovalRequest = new SecretApprovalRequest({
    workspace: workspaceId,
    environment,
    folderId,
    policy,
    commits,
    committer: commiterMembershipId
  });
  await secretApprovalRequest.save();

  await EEAuditLogService.createAuditLog(
    authData,
    {
      type: EventType.SECRET_APPROVAL_REQUEST,
      metadata: {
        committedBy: commiterMembershipId,
        secretApprovalRequestId: secretApprovalRequest._id.toString(),
        secretApprovalRequestSlug: secretApprovalRequest.slug
      }
    },
    {
      workspaceId: secretApprovalRequest.workspace
    }
  );

  return secretApprovalRequest;
};

// validation for a merge conditions happen in another function in controller
export const performSecretApprovalRequestMerge = async (
  id: string,
  authData: AuthData,
  userMembershipId: string
) => {
  const secretApprovalRequest = await SecretApprovalRequest.findById(id)
    .populate<{ commits: ISecretCommits<ISecret> }>({
      path: "commits.secret",
      select: "+secretBlindIndex",
      populate: {
        path: "tags"
      }
    })
    .select("+commits.newVersion.secretBlindIndex");
  if (!secretApprovalRequest) throw BadRequestError({ message: "Approval request not found" });

  const workspaceId = secretApprovalRequest.workspace;
  const environment = secretApprovalRequest.environment;
  const folderId = secretApprovalRequest.folderId;
  const postHogClient = await TelemetryService.getPostHogClient();
  const conflicts: Array<{ secretId: string; op: CommitType }> = [];

  const secretCreationCommits = secretApprovalRequest.commits.filter(
    ({ op }) => op === CommitType.CREATE
  ) as Array<{ op: CommitType.CREATE; newVersion: ISecretApprovalSecChange }>;
  if (secretCreationCommits.length) {
    // the created secrets already exist thus creation conflict ones
    const conflictedSecrets = await Secret.find({
      workspace: workspaceId,
      environment,
      folder: folderId,
      secretBlindIndex: {
        $in: secretCreationCommits.map(({ newVersion }) => newVersion.secretBlindIndex)
      }
    })
      .select("+secretBlindIndex")
      .lean();
    const conflictGroupByBlindIndex = conflictedSecrets.reduce<Record<string, boolean>>(
      (prev, curr) => ({ ...prev, [curr.secretBlindIndex || ""]: true }),
      {}
    );
    const nonConflictSecrets = secretCreationCommits.filter(
      ({ newVersion }) => !conflictGroupByBlindIndex[newVersion.secretBlindIndex || ""]
    );
    secretCreationCommits
      .filter(({ newVersion }) => conflictGroupByBlindIndex[newVersion.secretBlindIndex || ""])
      .forEach((el) => {
        conflicts.push({ op: CommitType.CREATE, secretId: el.newVersion._id.toString() });
      });

    // create secret
    const newlyCreatedSecrets: ISecret[] = await Secret.insertMany(
      nonConflictSecrets.map(
        ({
          newVersion: {
            secretKeyIV,
            secretKeyTag,
            secretValueIV,
            secretValueTag,
            secretCommentIV,
            secretCommentTag,
            secretKeyCiphertext,
            secretValueCiphertext,
            secretCommentCiphertext,
            skipMultilineEncoding,
            secretBlindIndex,
            algorithm,
            keyEncoding,
            tags
          }
        }) => ({
          version: 1,
          workspace: new Types.ObjectId(workspaceId),
          environment,
          type: SECRET_SHARED,
          secretKeyCiphertext,
          secretKeyIV,
          secretKeyTag,
          secretValueCiphertext,
          secretValueIV,
          secretValueTag,
          secretCommentCiphertext,
          secretCommentIV,
          secretCommentTag,
          folder: folderId,
          algorithm: algorithm || ALGORITHM_AES_256_GCM,
          keyEncoding: keyEncoding || ENCODING_SCHEME_UTF8,
          tags,
          skipMultilineEncoding,
          secretBlindIndex
        })
      )
    );

    await EESecretService.addSecretVersions({
      secretVersions: newlyCreatedSecrets.map(
        (secret) =>
          new SecretVersion({
            secret: secret._id,
            version: secret.version,
            workspace: secret.workspace,
            type: secret.type,
            folder: folderId,
            tags: secret.tags,
            skipMultilineEncoding: secret?.skipMultilineEncoding,
            environment: secret.environment,
            isDeleted: false,
            secretBlindIndex: secret.secretBlindIndex,
            secretKeyCiphertext: secret.secretKeyCiphertext,
            secretKeyIV: secret.secretKeyIV,
            secretKeyTag: secret.secretKeyTag,
            secretValueCiphertext: secret.secretValueCiphertext,
            secretValueIV: secret.secretValueIV,
            secretValueTag: secret.secretValueTag,
            algorithm: ALGORITHM_AES_256_GCM,
            keyEncoding: ENCODING_SCHEME_UTF8
          })
      )
    });
  }

  const secretUpdationCommits = secretApprovalRequest.commits.filter(
    ({ op }) => op === CommitType.UPDATE
  ) as Array<{
    op: CommitType.UPDATE;
    newVersion: Partial<Omit<ISecretApprovalSecChange, "_id">> & { _id: Types.ObjectId };
    secret: ISecret;
  }>;
  if (secretUpdationCommits.length) {
    const conflictedByNewBlindIndex = await Secret.find({
      workspace: workspaceId,
      environment,
      folder: folderId,
      secretBlindIndex: {
        $in: secretUpdationCommits
          .map(({ newVersion }) => newVersion?.secretBlindIndex)
          .filter(Boolean)
      }
    })
      .select("+secretBlindIndex")
      .lean();
    const conflictGroupByBlindIndex = conflictedByNewBlindIndex.reduce<Record<string, boolean>>(
      (prev, curr) => (curr?.secretBlindIndex ? { ...prev, [curr.secretBlindIndex]: true } : prev),
      {}
    );
    secretUpdationCommits
      .filter(
        ({ newVersion, secret }) =>
          (newVersion.secretBlindIndex && conflictGroupByBlindIndex[newVersion.secretBlindIndex]) ||
          !secret
      )
      .forEach((el) => {
        conflicts.push({ op: CommitType.UPDATE, secretId: el.newVersion._id.toString() });
      });

    const nonConflictSecrets = secretUpdationCommits.filter(
      ({ newVersion, secret }) =>
        Boolean(secret) &&
        (newVersion?.secretBlindIndex
          ? !conflictGroupByBlindIndex[newVersion.secretBlindIndex]
          : true)
    );
    await Secret.bulkWrite(
      // id and version are stripped off
      nonConflictSecrets.map(
        ({
          newVersion: {
            secretKeyIV,
            secretKeyTag,
            secretValueIV,
            secretValueTag,
            secretCommentIV,
            secretCommentTag,
            secretKeyCiphertext,
            secretValueCiphertext,
            secretCommentCiphertext,
            skipMultilineEncoding,
            secretBlindIndex,
            tags
          },
          secret
        }) => ({
          updateOne: {
            filter: {
              workspace: new Types.ObjectId(workspaceId),
              environment,
              folder: folderId,
              secretBlindIndex: secret.secretBlindIndex,
              type: SECRET_SHARED
            },
            update: {
              $inc: {
                version: 1
              },
              secretKeyIV,
              secretKeyTag,
              secretValueIV,
              secretValueTag,
              secretCommentIV,
              secretCommentTag,
              secretKeyCiphertext,
              secretValueCiphertext,
              secretCommentCiphertext,
              skipMultilineEncoding,
              secretBlindIndex,
              tags,
              algorithm: ALGORITHM_AES_256_GCM,
              keyEncoding: ENCODING_SCHEME_UTF8
            }
          }
        })
      )
    );

    await EESecretService.addSecretVersions({
      secretVersions: nonConflictSecrets.map(({ newVersion, secret }) => {
        return new SecretVersion({
          secret: secret._id,
          version: secret.version + 1,
          workspace: workspaceId,
          type: SECRET_SHARED,
          folder: folderId,
          environment,
          isDeleted: false,
          secretBlindIndex: newVersion?.secretBlindIndex ?? secret.secretBlindIndex,
          secretKeyCiphertext: newVersion?.secretKeyCiphertext ?? secret.secretKeyCiphertext,
          secretKeyIV: newVersion?.secretKeyIV ?? secret.secretKeyCiphertext,
          secretKeyTag: newVersion?.secretKeyTag ?? secret.secretKeyTag,
          secretValueCiphertext: newVersion?.secretValueCiphertext ?? secret.secretValueCiphertext,
          secretValueIV: newVersion?.secretValueIV ?? secret.secretValueIV,
          secretValueTag: newVersion?.secretValueTag ?? secret.secretValueTag,
          tags: newVersion?.tags ?? secret.tags,
          algorithm: ALGORITHM_AES_256_GCM,
          keyEncoding: ENCODING_SCHEME_UTF8,
          skipMultilineEncoding: newVersion?.skipMultilineEncoding ?? secret.skipMultilineEncoding
        });
      })
    });
  }

  const secretDeletionCommits = secretApprovalRequest.commits.filter(
    ({ op }) => op === CommitType.DELETE
  ) as Array<{
    op: CommitType.DELETE;
    secret: ISecret;
  }>;
  if (secretDeletionCommits.length) {
    await Secret.deleteMany({
      workspace: new Types.ObjectId(workspaceId),
      folder: folderId,
      environment
    })
      .or(
        secretDeletionCommits.map(({ secret: { secretBlindIndex } }) => ({
          secretBlindIndex,
          type: { $in: ["shared", "personal"] }
        }))
      )
      .exec();

    await EESecretService.markDeletedSecretVersions({
      secretIds: secretDeletionCommits.map(({ secret }) => secret._id)
    });
  }

  const updatedSecretApproval = await SecretApprovalRequest.findByIdAndUpdate(
    id,
    {
      conflicts,
      hasMerged: true,
      status: "close",
      statusChangeBy: userMembershipId
    },
    { new: true }
  );

  if (postHogClient) {
    if (postHogClient) {
      postHogClient.capture({
        event: "secrets merged",
        distinctId: await TelemetryService.getDistinctId({
          authData
        }),
        properties: {
          numberOfSecrets: secretApprovalRequest.commits.length,
          environment,
          workspaceId,
          folderId,
          channel: authData.userAgentType,
          userAgent: authData.userAgent
        }
      });
    }
  }

  await EESecretService.takeSecretSnapshot({
    workspaceId,
    environment,
    folderId
  });

  // question to team where to keep secretKey
  await EEAuditLogService.createAuditLog(
    authData,
    {
      type: EventType.SECRET_APPROVAL_MERGED,
      metadata: {
        mergedBy: userMembershipId,
        secretApprovalRequestId: id,
        secretApprovalRequestSlug: secretApprovalRequest.slug
      }
    },
    {
      workspaceId
    }
  );

  return updatedSecretApproval;
};
