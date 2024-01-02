import { TSecretFolderDalFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretApprovalRequestDalFactory } from "./secret-approval-request-dal";
import {
  ApprovalStatus,
  CommitType,
  TApprovalRequestCountDTO,
  TGenerateSecretApprovalRequestDTO,
  TListApprovalsDTO,
  TMergeSecretApprovalRequestDTO,
  TReviewRequestDTO,
  TSecretApprovalDetailsDTO,
  TStatusChangeDTO
} from "./secret-approval-request-types";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { TSecretBlindIndexDalFactory } from "@app/services/secret/secret-blind-index-dal";
import { generateSecretBlindIndexBySalt } from "@app/services/secret/secret-service";
import {
  ProjectMembershipRole,
  SecretEncryptionAlgo,
  SecretKeyEncoding,
  SecretType,
  TSaRequestSecretsInsert,
  TSecrets
} from "@app/db/schemas";
import { TSecretDalFactory } from "@app/services/secret/secret-dal";
import { TSecretVersionDalFactory } from "@app/services/secret/secret-version-dal";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TSarSecretDalFactory } from "./sar-secret-dal";
import { ActorType } from "@app/services/auth/auth-type";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { TSarReviewerDalFactory } from "./sar-reviewer-dal";

type TSecretApprovalRequestServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretApprovalRequestDal: TSecretApprovalRequestDalFactory;
  secretDal: TSecretDalFactory;
  sarSecretDal: TSarSecretDalFactory;
  sarReviewerDal: TSarReviewerDalFactory;
  secretVersionDal: Pick<TSecretVersionDalFactory, "findLatestVersionMany" | "insertMany">;
  folderDal: Pick<TSecretFolderDalFactory, "findBySecretPath">;
  secretBlindIndexDal: Pick<TSecretBlindIndexDalFactory, "findOne">;
};

export type TSecretApprovalRequestServiceFactory = ReturnType<
  typeof secretApprovalRequestServiceFactory
>;

export const secretApprovalRequestServiceFactory = ({
  secretApprovalRequestDal,
  folderDal,
  secretDal,
  sarReviewerDal,
  sarSecretDal,
  secretVersionDal,
  secretBlindIndexDal,
  permissionService
}: TSecretApprovalRequestServiceFactoryDep) => {
  const requestCount = async ({ projectId, actor, actorId }: TApprovalRequestCountDTO) => {
    const { membership } = await permissionService.getProjectPermission(actor, actorId, projectId);
    const count = await secretApprovalRequestDal.findProjectRequestCount(projectId, membership.id);
    return count;
  };

  const getSecretApprovals = async ({
    projectId,
    actorId,
    actor,
    status,
    environment,
    committer
  }: TListApprovalsDTO) => {
    const { membership } = await permissionService.getProjectPermission(actor, actorId, projectId);
    const approvals = await secretApprovalRequestDal.findByProjectId({
      projectId,
      committer,
      environment,
      status,
      membershipId: membership.id
    });
    return approvals;
  };

  const getSecretApprovalDetails = async ({ actor, actorId, id }: TSecretApprovalDetailsDTO) => {
    const secretApprovalRequest = await secretApprovalRequestDal.findById(id);
    if (!secretApprovalRequest)
      throw new BadRequestError({ message: "Secret approval request not found" });

    const { policy } = secretApprovalRequest;
    const { membership } = await permissionService.getProjectPermission(
      actor,
      actorId,
      secretApprovalRequest.projectId
    );
    if (
      membership.role !== ProjectMembershipRole.Admin &&
      secretApprovalRequest.committerId !== membership.id &&
      !policy.approvers.find((approverId) => approverId === membership.id)
    ) {
      throw new UnauthorizedError({ message: "User has no access" });
    }

    const secrets = await sarSecretDal.findByRequestId(secretApprovalRequest.id);
    return { ...secretApprovalRequest, commits: secrets };
  };

  const reviewApproval = async ({ approvalId, actor, status, actorId }: TReviewRequestDTO) => {
    const secretApprovalRequest = await secretApprovalRequestDal.findById(approvalId);
    if (!secretApprovalRequest)
      throw new BadRequestError({ message: "Secret approval request not found" });
    if (actor !== ActorType.USER) throw new BadRequestError({ message: "Must be a user" });

    const { policy } = secretApprovalRequest;
    const { membership } = await permissionService.getProjectPermission(
      ActorType.USER,
      actorId,
      secretApprovalRequest.projectId
    );
    if (
      membership.role !== ProjectMembershipRole.Admin &&
      secretApprovalRequest.committerId !== membership.id &&
      !policy.approvers.find((approverId) => approverId === membership.id)
    ) {
      throw new UnauthorizedError({ message: "User has no access" });
    }
    const reviewStatus = await sarReviewerDal.transaction(async (tx) => {
      const review = await sarReviewerDal.findOne(
        {
          requestId: secretApprovalRequest.id,
          member: membership.id
        },
        tx
      );
      if (!review) {
        return sarReviewerDal.create(
          {
            status,
            requestId: secretApprovalRequest.id,
            member: membership.id
          },
          tx
        );
      }
      return sarReviewerDal.updateById(review.id, { status }, tx);
    });
    return reviewStatus;
  };

  const updateApprovalStatus = async ({ actorId, status, approvalId, actor }: TStatusChangeDTO) => {
    const secretApprovalRequest = await secretApprovalRequestDal.findById(approvalId);
    if (!secretApprovalRequest)
      throw new BadRequestError({ message: "Secret approval request not found" });
    if (actor !== ActorType.USER) throw new BadRequestError({ message: "Must be a user" });

    const { policy } = secretApprovalRequest;
    const { membership } = await permissionService.getProjectPermission(
      ActorType.USER,
      actorId,
      secretApprovalRequest.projectId
    );
    if (
      membership.role !== ProjectMembershipRole.Admin &&
      secretApprovalRequest.committerId !== membership.id &&
      !policy.approvers.find((approverId) => approverId === membership.id)
    ) {
      throw new UnauthorizedError({ message: "User has no access" });
    }

    if (secretApprovalRequest.hasMerged)
      throw new BadRequestError({ message: "Approval request has been merged" });
    if (secretApprovalRequest.status === "close" && status === "close")
      throw new BadRequestError({ message: "Approval request is already closed" });
    if (secretApprovalRequest.status === "open" && status === "open")
      throw new BadRequestError({ message: "Approval request is already open" });

    const updatedRequest = await secretApprovalRequestDal.updateById(secretApprovalRequest.id, {
      status,
      statusChangeBy: membership.id
    });
    return updatedRequest;
  };

  const mergeSecretApprovalRequest = async ({
    approvalId,
    actor,
    actorId
  }: TMergeSecretApprovalRequestDTO) => {
    const secretApprovalRequest = await secretApprovalRequestDal.findById(approvalId);
    if (!secretApprovalRequest)
      throw new BadRequestError({ message: "Secret approval request not found" });
    if (actor !== ActorType.USER) throw new BadRequestError({ message: "Must be a user" });

    const { policy, folderId } = secretApprovalRequest;
    const { membership } = await permissionService.getProjectPermission(
      ActorType.USER,
      actorId,
      secretApprovalRequest.projectId
    );
    if (
      membership.role !== ProjectMembershipRole.Admin &&
      secretApprovalRequest.committerId !== membership.id &&
      !policy.approvers.find((approverId) => approverId === membership.id)
    ) {
      throw new UnauthorizedError({ message: "User has no access" });
    }
    const reviewers = secretApprovalRequest.reviewers.reduce<Record<string, ApprovalStatus>>(
      (prev, curr) => ({ ...prev, [curr.member.toString()]: curr.status }),
      {}
    );
    const hasMinApproval =
      secretApprovalRequest.policy.approvals <=
      secretApprovalRequest.policy.approvers.filter(
        (approverId) => reviewers[approverId.toString()] === ApprovalStatus.APPROVED
      ).length;

    if (!hasMinApproval)
      throw new BadRequestError({ message: "Doesn't have minimum approvals needed" });
    const secretApprovalSecrets = await sarSecretDal.findByRequestId(secretApprovalRequest.id);
    if (!secretApprovalSecrets) throw new BadRequestError({ message: "No secrets found" });

    const conflicts: Array<{ secretId: string; op: CommitType }> = [];
    let secretCreationCommits = secretApprovalSecrets.filter(({ op }) => op === CommitType.Create);
    if (secretCreationCommits.length) {
      const conflictedSecrets = await secretDal.findByBlindIndexes(
        folderId,
        secretCreationCommits.map(({ secretBlindIndex }) => ({
          type: SecretType.Shared,
          blindIndex: secretBlindIndex
        }))
      );
      const conflictGroupByBlindIndex = conflictedSecrets.reduce<Record<string, boolean>>(
        (prev, curr) => ({ ...prev, [curr.secretBlindIndex || ""]: true }),
        {}
      );
      secretCreationCommits
        .filter(({ secretBlindIndex }) => conflictGroupByBlindIndex[secretBlindIndex || ""])
        .forEach((el) => {
          conflicts.push({ op: CommitType.Create, secretId: el.id });
        });
      secretCreationCommits = secretCreationCommits.filter(
        ({ secretBlindIndex }) => !conflictGroupByBlindIndex[secretBlindIndex || ""]
      );
    }

    let secretUpdationCommits = secretApprovalSecrets.filter(({ op }) => op === CommitType.Update);
    if (secretUpdationCommits.length) {
      const conflictedByNewBlindIndex = await secretDal.findByBlindIndexes(
        folderId,
        secretUpdationCommits.map(({ secretBlindIndex }) => ({
          type: SecretType.Shared,
          blindIndex: secretBlindIndex
        }))
      );
      const conflictGroupByBlindIndex = conflictedByNewBlindIndex.reduce<Record<string, boolean>>(
        (prev, curr) =>
          curr?.secretBlindIndex ? { ...prev, [curr.secretBlindIndex]: true } : prev,
        {}
      );
      secretUpdationCommits
        .filter(
          ({ secretBlindIndex, secretId }) =>
            (secretBlindIndex && conflictGroupByBlindIndex[secretBlindIndex]) || !secretId
        )
        .forEach((el) => {
          conflicts.push({ op: CommitType.Update, secretId: el.id });
        });

      secretUpdationCommits = secretUpdationCommits.filter(
        ({ secretBlindIndex, secretId }) =>
          Boolean(secretId) &&
          (secretBlindIndex ? !conflictGroupByBlindIndex[secretBlindIndex] : true)
      );
    }

    const secretDeletionCommits = secretApprovalSecrets.filter(
      ({ op }) => op === CommitType.Delete
    );

    const mergeStatus = await secretDal.transaction(async (tx) => {
      const newSecrets = await secretDal.insertMany(
        secretCreationCommits.map(
          ({
            secretBlindIndex,
            metadata,
            secretKeyIV,
            secretKeyTag,
            secretKeyCiphertext,
            secretValueIV,
            secretValueTag,
            secretValueCiphertext,
            secretCommentIV,
            secretCommentTag,
            secretCommentCiphertext,
            skipMultilineEncoding,
            secretReminderNotice,
            secretReminderRepeatDays
          }) => ({
            secretBlindIndex,
            metadata,
            secretKeyIV,
            secretKeyTag,
            secretKeyCiphertext,
            secretValueIV,
            secretValueTag,
            secretValueCiphertext,
            secretCommentIV,
            secretCommentTag,
            secretCommentCiphertext,
            skipMultilineEncoding,
            secretReminderNotice,
            secretReminderRepeatDays,
            version: 1,
            folderId,
            type: SecretType.Shared,
            algorithm: SecretEncryptionAlgo.AES_256_GCM,
            keyEncoding: SecretKeyEncoding.UTF8
          })
        ),
        tx
      );
      const updatedSecrets = await secretDal.bulkUpdate(
        secretUpdationCommits.map(
          ({
            secretId,
            secretBlindIndex,
            metadata,
            secretKeyIV,
            secretKeyTag,
            secretKeyCiphertext,
            secretValueIV,
            secretValueTag,
            secretValueCiphertext,
            secretCommentIV,
            secretCommentTag,
            secretCommentCiphertext,
            skipMultilineEncoding,
            secretReminderNotice,
            secretReminderRepeatDays
          }) => ({
            folderId,
            id: secretId as string,
            type: SecretType.Shared,
            secretBlindIndex,
            metadata,
            secretKeyIV,
            secretKeyTag,
            secretKeyCiphertext,
            secretValueIV,
            secretValueTag,
            secretValueCiphertext,
            secretCommentIV,
            secretCommentTag,
            secretCommentCiphertext,
            skipMultilineEncoding,
            secretReminderNotice,
            secretReminderRepeatDays
          })
        ),
        tx
      );
      const deletedSecret = await secretDal.deleteMany(
        secretDeletionCommits.map(({ secretBlindIndex }) => ({
          blindIndex: secretBlindIndex,
          type: SecretType.Shared
        })),
        folderId,
        actorId,
        tx
      );
      await secretVersionDal.insertMany(
        newSecrets
          .map(({ id, updatedAt, createdAt, ...el }) => ({
            ...el,
            secretId: id
          }))
          .concat(
            updatedSecrets.map(({ id, updatedAt, createdAt, ...el }) => ({
              ...el,
              secretId: id
            }))
          ),
        tx
      );

      const updatedSecretApproval = await secretApprovalRequestDal.updateById(
        secretApprovalRequest.id,
        {
          conflicts,
          hasMerged: true,
          status: "close",
          statusChangeBy: actorId
        },
        tx
      );
      return {
        secrets: { created: newSecrets, updated: updatedSecrets, deleted: deletedSecret },
        approval: updatedSecretApproval
      };
    });
    return mergeStatus;
  };

  // function to save secret change to secret approval
  // this will keep a copy to do merge later when accepting
  const generateSecretApprovalRequest = async ({
    data,
    policy,
    projectId,
    secretPath,
    environment,
    commiterMembershipId
  }: TGenerateSecretApprovalRequestDTO) => {
    const folder = await folderDal.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new BadRequestError({ message: "Folder not  found", name: "GenSecretApproval" });
    const folderId = folder.id;

    const blindIndexDoc = await secretBlindIndexDal.findOne({ projectId });
    if (!blindIndexDoc)
      throw new BadRequestError({ message: "Blind index not found", name: "Update secret" });

    const commits: Omit<TSaRequestSecretsInsert, "requestId">[] = [];
    // for created secret approval change
    const createdSecrets = data[CommitType.Create];
    if (createdSecrets && createdSecrets?.length) {
      const secretBlindIndexToKey: Record<string, string> = {}; // used at audit log point
      const secretBlindIndexes = await Promise.all(
        createdSecrets.map(({ secretName }) =>
          generateSecretBlindIndexBySalt(secretName, blindIndexDoc)
        )
      ).then((blindIndexes) =>
        blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
          // eslint-disable-next-line
          prev[createdSecrets[i].secretName] = curr;
          secretBlindIndexToKey[curr] = createdSecrets[i].secretName;
          return prev;
        }, {})
      );

      const exists = await secretDal.findByBlindIndexes(
        folderId,
        createdSecrets.map(({ secretName }) => ({
          blindIndex: secretBlindIndexes[secretName],
          type: SecretType.Shared
        }))
      );
      if (exists.length) throw new BadRequestError({ message: "Secret already exist" });
      commits.push(
        ...createdSecrets.map((el) => ({
          ...el,
          op: CommitType.Create as const,
          version: 0,
          secretBlindIndex: secretBlindIndexes[el.secretName]
        }))
      );
    }
    // not secret approval for update operations
    const updatedSecrets = data[CommitType.Update];
    if (updatedSecrets && updatedSecrets?.length) {
      // get all blind index
      // Find all those secrets
      // if not throw not found
      const secretBlindIndexToKey: Record<string, string> = {}; // used at audit log point
      const secretBlindIndexes = await Promise.all(
        updatedSecrets.map(({ secretName }) =>
          generateSecretBlindIndexBySalt(secretName, blindIndexDoc)
        )
      ).then((blindIndexes) =>
        blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
          // eslint-disable-next-line
          prev[updatedSecrets[i].secretName] = curr;
          secretBlindIndexToKey[curr] = updatedSecrets[i].secretName;
          return prev;
        }, {})
      );

      const secretsToBeUpdated = await secretDal.findByBlindIndexes(
        folderId,
        updatedSecrets.map(({ secretName }) => ({
          blindIndex: secretBlindIndexes[secretName],
          type: SecretType.Shared
        }))
      );
      if (secretsToBeUpdated.length !== updatedSecrets.length)
        throw new BadRequestError({ message: "Secret not found" });

      // now find any secret that needs to update its name
      // same process as above
      const nameUpdatedSecrets = updatedSecrets.filter(({ newSecretName }) =>
        Boolean(newSecretName)
      );
      const newSecretBlindIndexes = await Promise.all(
        nameUpdatedSecrets.map(({ newSecretName }) =>
          generateSecretBlindIndexBySalt(newSecretName as string, blindIndexDoc)
        )
      ).then((blindIndexes) =>
        blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
          // eslint-disable-next-line
          prev[nameUpdatedSecrets[i].secretName] = curr;
          return prev;
        }, {})
      );
      const secretsWithNewName = await secretDal.findByBlindIndexes(
        folderId,
        nameUpdatedSecrets.map(({ newSecretName }) => ({
          blindIndex: newSecretBlindIndexes[newSecretName as string],
          type: SecretType.Shared
        }))
      );
      if (secretsWithNewName.length)
        throw new BadRequestError({ message: "Secret with new name already exist" });

      const secretsGroupedByBlindIndex = secretsToBeUpdated.reduce<Record<string, TSecrets>>(
        (prev, curr) => {
          // eslint-disable-next-line
          if (curr.secretBlindIndex) prev[curr.secretBlindIndex] = curr;
          return prev;
        },
        {}
      );
      const updatedSecretIds = updatedSecrets.map(
        (el) => secretsGroupedByBlindIndex[secretBlindIndexes[el.secretName]].id
      );
      const latestSecretVersions = await secretVersionDal.findLatestVersionMany(
        folderId,
        updatedSecretIds
      );
      commits.push(
        ...updatedSecrets.map((el) => {
          const secretId = secretsGroupedByBlindIndex[secretBlindIndexes[el.secretName]].id;
          return {
            ...latestSecretVersions[secretId],
            op: CommitType.Update as const,
            secret: secretId,
            secretVersion: latestSecretVersions[secretId].id,
            ...el,
            secretBlindIndex: newSecretBlindIndexes?.[el.secretName],
            version: secretsGroupedByBlindIndex[secretBlindIndexes[el.secretName]].version || 1
          };
        })
      );
    }
    // deleted secrets
    const deletedSecrets = data[CommitType.Delete];
    if (deletedSecrets && deletedSecrets.length) {
      // get all blind index
      // Find all those secrets
      // if not throw not found
      const secretBlindIndexToKey: Record<string, string> = {}; // used at audit log point
      const secretBlindIndexes = await Promise.all(
        deletedSecrets.map(({ secretName }) =>
          generateSecretBlindIndexBySalt(secretName, blindIndexDoc)
        )
      ).then((blindIndexes) =>
        blindIndexes.reduce<Record<string, string>>((prev, curr, i) => {
          // eslint-disable-next-line
          prev[deletedSecrets[i].secretName] = curr;
          secretBlindIndexToKey[curr] = deletedSecrets[i].secretName;
          return prev;
        }, {})
      );
      // not find those secrets. if any of them not found throw an not found error
      const secretsToBeDeleted = await secretDal.findByBlindIndexes(
        folderId,
        deletedSecrets.map(({ secretName }) => ({
          blindIndex: secretBlindIndexes[secretName],
          type: SecretType.Shared
        }))
      );
      if (secretsToBeDeleted.length !== deletedSecrets.length)
        throw new BadRequestError({ message: "Secret not found" });
      const secretsGroupedByBlindIndex = secretsToBeDeleted.reduce<Record<string, TSecrets>>(
        (prev, curr) => {
          // eslint-disable-next-line
          if (curr.secretBlindIndex) prev[curr.secretBlindIndex] = curr;
          return prev;
        },
        {}
      );
      const deletedSecretIds = deletedSecrets.map(
        (el) => secretsGroupedByBlindIndex[secretBlindIndexes[el.secretName]].id
      );
      const latestSecretVersions = await secretVersionDal.findLatestVersionMany(
        folderId,
        deletedSecretIds
      );
      commits.push(
        ...deletedSecrets.map((el) => {
          const secretId = secretsGroupedByBlindIndex[secretBlindIndexes[el.secretName]].id;
          return {
            op: CommitType.Delete as const,
            ...latestSecretVersions[secretId],
            secret: secretId,
            secretVersion: latestSecretVersions[secretId].id
          };
        })
      );
    }

    const secretApprovalRequest = await secretApprovalRequestDal.transaction(async (tx) => {
      const doc = await secretApprovalRequestDal.create(
        {
          folderId,
          slug: alphaNumericNanoId(),
          policyId: policy.id,
          status: "open",
          hasMerged: false,
          committerId: commiterMembershipId
        },
        tx
      );
      const approvalCommits = await sarSecretDal.insertMany(
        commits.map(
          ({
            version,
            op,
            secretKeyTag,
            secretKeyIV,
            keyEncoding,
            secretId,
            metadata,
            algorithm,
            secretBlindIndex,
            secretValueIV,
            secretValueTag,
            secretVersion,
            secretCommentIV,
            secretCommentTag,
            secretKeyCiphertext,
            secretValueCiphertext,
            secretReminderNotice,
            skipMultilineEncoding,
            secretCommentCiphertext,
            secretReminderRepeatDays
          }) => ({
            version,
            requestId: doc.id,
            op,
            secretKeyTag,
            secretKeyIV,
            keyEncoding,
            secretId,
            metadata,
            algorithm,
            secretBlindIndex,
            secretValueIV,
            secretValueTag,
            secretVersion,
            secretCommentIV,
            secretCommentTag,
            secretKeyCiphertext,
            secretValueCiphertext,
            secretReminderNotice,
            skipMultilineEncoding,
            secretCommentCiphertext,
            secretReminderRepeatDays
          })
        ),
        tx
      );
      return { ...doc, commits: approvalCommits };
    });
    return secretApprovalRequest;
  };
  return {
    generateSecretApprovalRequest,
    mergeSecretApprovalRequest,
    reviewApproval,
    updateApprovalStatus,
    getSecretApprovals,
    getSecretApprovalDetails,
    requestCount
  };
};
