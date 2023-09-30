import picomatch from "picomatch";
import { Types } from "mongoose";
import {
  containsGlobPatterns,
  generateSecretBlindIndexWithSaltHelper,
  getSecretBlindIndexSaltHelper
} from "../helpers/secrets";
import { Folder, ISecret, Secret } from "../models";
import { ISecretApprovalPolicy, SecretApprovalPolicy } from "../models/secretApprovalPolicy";
import {
  CommitType,
  ISecretApprovalRequest,
  ISecretApprovalSecChange,
  SecretApprovalRequest
} from "../models/secretApprovalRequest";
import { BadRequestError } from "../utils/errors";
import { getFolderByPath } from "./FolderService";
import { SECRET_SHARED } from "../variables";

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
    (a, b) => getPolicyScore(a) - getPolicyScore(b)
  );
  const finalPolicy = policiesByPriority.shift();
  return finalPolicy;
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
};

export const generateSecretApprovalRequest = async ({
  workspaceId,
  environment,
  secretPath,
  policy,
  data,
  commiterMembershipId
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
    const secretsToBeUpdated = await Secret.find({
      workspace: new Types.ObjectId(workspaceId),
      folder: folderId,
      environment
    })
      .select("+secretBlindIndex")
      .or(
        updatedSecret.map(({ secretName }) => ({
          secretBlindIndex: secretBlindIndexes[secretName],
          type: SECRET_SHARED
        }))
      )
      .lean()
      .exec();
    if (secretsToBeUpdated.length !== updatedSecret.length)
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
    if (doesAnySecretExistWithNewIndex)
      throw BadRequestError({ message: "Secret with new name already exist" });

    commits.push(
      ...updatedSecret.map((el) => {
        const oldSecret = secretsToBeUpdated.find(
          (sec) => sec?.secretBlindIndex === secretBlindIndexes[el.secretName]
        );
        if (!oldSecret) throw BadRequestError({ message: "Secret not found" });

        return {
          op: CommitType.UPDATE as const,
          secret: oldSecret._id,
          newVersion: {
            ...el,
            secretBlindIndex: newSecretBlindIndexes?.[el.secretName],
            _id: new Types.ObjectId(),
            version: oldSecret.version || 1
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
      environment
    })
      .or(
        deletedSecrets.map(({ secretName }) => ({
          secretBlindIndex: secretBlindIndexes[secretName],
          type: SECRET_SHARED
        }))
      )
      .select({ secretBlindIndexes: 1 })
      .lean()
      .exec();
    if (secretsToDelete.length !== deletedSecrets.length)
      throw BadRequestError({ message: "Deleted secrets not found" });

    commits.push(
      ...deletedSecrets.map((el) => ({
        op: CommitType.DELETE as const,
        secret: (
          secretsToDelete.find(
            (sec) => sec?.secretBlindIndex === secretBlindIndexes[el.secretName]
          ) as ISecret
        )._id
      }))
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
  return secretApprovalRequest;
};
