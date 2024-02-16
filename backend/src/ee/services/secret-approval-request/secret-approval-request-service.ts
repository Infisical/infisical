import { ForbiddenError, subject } from "@casl/ability";

import {
  ProjectMembershipRole,
  SecretEncryptionAlgo,
  SecretKeyEncoding,
  SecretType,
  TSecretApprovalRequestsSecretsInsert
} from "@app/db/schemas";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { groupBy, pick, unique } from "@app/lib/fn";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { ActorType } from "@app/services/auth/auth-type";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TSecretQueueFactory } from "@app/services/secret/secret-queue";
import { TSecretServiceFactory } from "@app/services/secret/secret-service";
import { TSecretVersionDALFactory } from "@app/services/secret/secret-version-dal";
import { TSecretBlindIndexDALFactory } from "@app/services/secret-blind-index/secret-blind-index-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";

import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TSecretSnapshotServiceFactory } from "../secret-snapshot/secret-snapshot-service";
import { TSecretApprovalRequestDALFactory } from "./secret-approval-request-dal";
import { TSecretApprovalRequestReviewerDALFactory } from "./secret-approval-request-reviewer-dal";
import { TSecretApprovalRequestSecretDALFactory } from "./secret-approval-request-secret-dal";
import {
  ApprovalStatus,
  CommitType,
  RequestState,
  TApprovalRequestCountDTO,
  TGenerateSecretApprovalRequestDTO,
  TListApprovalsDTO,
  TMergeSecretApprovalRequestDTO,
  TReviewRequestDTO,
  TSecretApprovalDetailsDTO,
  TStatusChangeDTO
} from "./secret-approval-request-types";

type TSecretApprovalRequestServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretApprovalRequestDAL: TSecretApprovalRequestDALFactory;
  secretApprovalRequestSecretDAL: TSecretApprovalRequestSecretDALFactory;
  secretApprovalRequestReviewerDAL: TSecretApprovalRequestReviewerDALFactory;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findById" | "findSecretPathByFolderIds">;
  secretTagDAL: Pick<TSecretTagDALFactory, "findManyTagsById">;
  secretBlindIndexDAL: Pick<TSecretBlindIndexDALFactory, "findOne">;
  snapshotService: Pick<TSecretSnapshotServiceFactory, "performSnapshot">;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "findLatestVersionMany">;
  projectDAL: Pick<TProjectDALFactory, "isProjectBeingUpgraded">;
  secretService: Pick<
    TSecretServiceFactory,
    | "fnSecretBulkInsert"
    | "fnSecretBulkUpdate"
    | "fnSecretBlindIndexCheck"
    | "fnSecretBulkDelete"
    | "fnSecretBlindIndexCheckV2"
  >;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets">;
};

export type TSecretApprovalRequestServiceFactory = ReturnType<typeof secretApprovalRequestServiceFactory>;

export const secretApprovalRequestServiceFactory = ({
  secretApprovalRequestDAL,
  folderDAL,
  secretTagDAL,
  secretApprovalRequestReviewerDAL,
  secretApprovalRequestSecretDAL,
  secretBlindIndexDAL,
  projectDAL,
  permissionService,
  snapshotService,
  secretService,
  secretVersionDAL,
  secretQueueService
}: TSecretApprovalRequestServiceFactoryDep) => {
  const requestCount = async ({ projectId, actor, actorId, actorOrgId }: TApprovalRequestCountDTO) => {
    if (actor === ActorType.SERVICE) throw new BadRequestError({ message: "Cannot use service token" });

    const { membership } = await permissionService.getProjectPermission(
      actor as ActorType.USER,
      actorId,
      projectId,
      actorOrgId
    );

    const count = await secretApprovalRequestDAL.findProjectRequestCount(projectId, membership.id);
    return count;
  };

  const getSecretApprovals = async ({
    projectId,
    actorId,
    actor,
    actorOrgId,
    status,
    environment,
    committer,
    limit,
    offset
  }: TListApprovalsDTO) => {
    if (actor === ActorType.SERVICE) throw new BadRequestError({ message: "Cannot use service token" });

    const { membership } = await permissionService.getProjectPermission(actor, actorId, projectId, actorOrgId);
    const approvals = await secretApprovalRequestDAL.findByProjectId({
      projectId,
      committer,
      environment,
      status,
      membershipId: membership.id,
      limit,
      offset
    });
    return approvals;
  };

  const getSecretApprovalDetails = async ({ actor, actorId, actorOrgId, id }: TSecretApprovalDetailsDTO) => {
    if (actor === ActorType.SERVICE) throw new BadRequestError({ message: "Cannot use service token" });

    const secretApprovalRequest = await secretApprovalRequestDAL.findById(id);
    if (!secretApprovalRequest) throw new BadRequestError({ message: "Secret approval request not found" });

    const { policy } = secretApprovalRequest;
    const { membership } = await permissionService.getProjectPermission(
      actor,
      actorId,
      secretApprovalRequest.projectId,
      actorOrgId
    );
    if (
      membership.role !== ProjectMembershipRole.Admin &&
      secretApprovalRequest.committerId !== membership.id &&
      !policy.approvers.find((approverId) => approverId === membership.id)
    ) {
      throw new UnauthorizedError({ message: "User has no access" });
    }

    const secrets = await secretApprovalRequestSecretDAL.findByRequestId(secretApprovalRequest.id);
    const secretPath = await folderDAL.findSecretPathByFolderIds(secretApprovalRequest.projectId, [
      secretApprovalRequest.folderId
    ]);
    return { ...secretApprovalRequest, secretPath: secretPath?.[0]?.path || "/", commits: secrets };
  };

  const reviewApproval = async ({ approvalId, actor, status, actorId, actorOrgId }: TReviewRequestDTO) => {
    const secretApprovalRequest = await secretApprovalRequestDAL.findById(approvalId);
    if (!secretApprovalRequest) throw new BadRequestError({ message: "Secret approval request not found" });
    if (actor !== ActorType.USER) throw new BadRequestError({ message: "Must be a user" });

    const { policy } = secretApprovalRequest;
    const { membership } = await permissionService.getProjectPermission(
      ActorType.USER,
      actorId,
      secretApprovalRequest.projectId,
      actorOrgId
    );
    if (
      membership.role !== ProjectMembershipRole.Admin &&
      secretApprovalRequest.committerId !== membership.id &&
      !policy.approvers.find((approverId) => approverId === membership.id)
    ) {
      throw new UnauthorizedError({ message: "User has no access" });
    }
    const reviewStatus = await secretApprovalRequestReviewerDAL.transaction(async (tx) => {
      const review = await secretApprovalRequestReviewerDAL.findOne(
        {
          requestId: secretApprovalRequest.id,
          member: membership.id
        },
        tx
      );
      if (!review) {
        return secretApprovalRequestReviewerDAL.create(
          {
            status,
            requestId: secretApprovalRequest.id,
            member: membership.id
          },
          tx
        );
      }
      return secretApprovalRequestReviewerDAL.updateById(review.id, { status }, tx);
    });
    return reviewStatus;
  };

  const updateApprovalStatus = async ({ actorId, status, approvalId, actor, actorOrgId }: TStatusChangeDTO) => {
    const secretApprovalRequest = await secretApprovalRequestDAL.findById(approvalId);
    if (!secretApprovalRequest) throw new BadRequestError({ message: "Secret approval request not found" });
    if (actor !== ActorType.USER) throw new BadRequestError({ message: "Must be a user" });

    const { policy } = secretApprovalRequest;
    const { membership } = await permissionService.getProjectPermission(
      ActorType.USER,
      actorId,
      secretApprovalRequest.projectId,
      actorOrgId
    );
    if (
      membership.role !== ProjectMembershipRole.Admin &&
      secretApprovalRequest.committerId !== membership.id &&
      !policy.approvers.find((approverId) => approverId === membership.id)
    ) {
      throw new UnauthorizedError({ message: "User has no access" });
    }

    if (secretApprovalRequest.hasMerged) throw new BadRequestError({ message: "Approval request has been merged" });
    if (secretApprovalRequest.status === RequestState.Closed && status === RequestState.Closed)
      throw new BadRequestError({ message: "Approval request is already closed" });
    if (secretApprovalRequest.status === RequestState.Open && status === RequestState.Open)
      throw new BadRequestError({ message: "Approval request is already open" });

    const updatedRequest = await secretApprovalRequestDAL.updateById(secretApprovalRequest.id, {
      status,
      statusChangeBy: membership.id
    });
    return { ...secretApprovalRequest, ...updatedRequest };
  };

  const mergeSecretApprovalRequest = async ({
    approvalId,
    actor,
    actorId,
    actorOrgId
  }: TMergeSecretApprovalRequestDTO) => {
    const secretApprovalRequest = await secretApprovalRequestDAL.findById(approvalId);
    if (!secretApprovalRequest) throw new BadRequestError({ message: "Secret approval request not found" });
    if (actor !== ActorType.USER) throw new BadRequestError({ message: "Must be a user" });

    const { policy, folderId, projectId } = secretApprovalRequest;
    const { membership } = await permissionService.getProjectPermission(ActorType.USER, actorId, projectId, actorOrgId);
    if (
      membership.role !== ProjectMembershipRole.Admin &&
      secretApprovalRequest.committerId !== membership.id &&
      !policy.approvers.find((approverId) => approverId === membership.id)
    ) {
      throw new UnauthorizedError({ message: "User has no access" });
    }
    const reviewers = secretApprovalRequest.reviewers.reduce<Record<string, ApprovalStatus>>(
      (prev, curr) => ({ ...prev, [curr.member.toString()]: curr.status as ApprovalStatus }),
      {}
    );
    const hasMinApproval =
      secretApprovalRequest.policy.approvals <=
      secretApprovalRequest.policy.approvers.filter(
        (approverId) => reviewers[approverId.toString()] === ApprovalStatus.APPROVED
      ).length;

    if (!hasMinApproval) throw new BadRequestError({ message: "Doesn't have minimum approvals needed" });
    const secretApprovalSecrets = await secretApprovalRequestSecretDAL.findByRequestId(secretApprovalRequest.id);
    if (!secretApprovalSecrets) throw new BadRequestError({ message: "No secrets found" });

    const conflicts: Array<{ secretId: string; op: CommitType }> = [];
    let secretCreationCommits = secretApprovalSecrets.filter(({ op }) => op === CommitType.Create);
    if (secretCreationCommits.length) {
      const { secsGroupedByBlindIndex: conflictGroupByBlindIndex } = await secretService.fnSecretBlindIndexCheckV2({
        folderId,
        inputSecrets: secretCreationCommits.map(({ secretBlindIndex }) => {
          if (!secretBlindIndex) {
            throw new BadRequestError({
              message: "Missing secret blind index"
            });
          }
          return { secretBlindIndex };
        })
      });
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
      const { secsGroupedByBlindIndex: conflictGroupByBlindIndex } = await secretService.fnSecretBlindIndexCheckV2({
        folderId,
        inputSecrets: secretUpdationCommits
          .filter(({ secretBlindIndex, secret }) => secret && secret.secretBlindIndex !== secretBlindIndex)
          .map(({ secretBlindIndex }) => {
            if (!secretBlindIndex) {
              throw new BadRequestError({
                message: "Missing secret blind index"
              });
            }
            return { secretBlindIndex };
          })
      });
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
          Boolean(secretId) && (secretBlindIndex ? !conflictGroupByBlindIndex[secretBlindIndex] : true)
      );
    }

    const secretDeletionCommits = secretApprovalSecrets.filter(({ op }) => op === CommitType.Delete);

    const mergeStatus = await secretApprovalRequestDAL.transaction(async (tx) => {
      const newSecrets = secretCreationCommits.length
        ? await secretService.fnSecretBulkInsert({
            tx,
            folderId,
            inputSecrets: secretCreationCommits.map((el) => ({
              ...pick(el, [
                "secretCommentCiphertext",
                "secretCommentTag",
                "secretCommentIV",
                "secretValueIV",
                "secretValueTag",
                "secretValueCiphertext",
                "secretKeyCiphertext",
                "secretKeyTag",
                "secretKeyIV",
                "metadata",
                "skipMultilineEncoding",
                "secretReminderNote",
                "secretReminderRepeatDays",
                "algorithm",
                "keyEncoding",
                "secretBlindIndex"
              ]),
              tags: el?.tags.map(({ id }) => id),
              version: 1,
              type: SecretType.Shared
            }))
          })
        : [];
      const updatedSecrets = secretUpdationCommits.length
        ? await secretService.fnSecretBulkUpdate({
            folderId,
            projectId,
            tx,
            inputSecrets: secretUpdationCommits.map((el) => ({
              filter: {
                id: el.secretId as string, // this null check is already checked at top on conflict strategy
                type: SecretType.Shared
              },
              data: {
                tags: el?.tags.map(({ id }) => id),
                ...pick(el, [
                  "secretCommentCiphertext",
                  "secretCommentTag",
                  "secretCommentIV",
                  "secretValueIV",
                  "secretValueTag",
                  "secretValueCiphertext",
                  "secretKeyCiphertext",
                  "secretKeyTag",
                  "secretKeyIV",
                  "metadata",
                  "skipMultilineEncoding",
                  "secretReminderNote",
                  "secretReminderRepeatDays",
                  "secretBlindIndex"
                ])
              }
            }))
          })
        : [];
      const deletedSecret = secretDeletionCommits.length
        ? await secretService.fnSecretBulkDelete({
            projectId,
            folderId,
            tx,
            actorId: "",
            inputSecrets: secretDeletionCommits.map(({ secretBlindIndex }) => {
              if (!secretBlindIndex) {
                throw new BadRequestError({
                  message: "Missing secret blind index"
                });
              }
              return { secretBlindIndex, type: SecretType.Shared };
            })
          })
        : [];
      const updatedSecretApproval = await secretApprovalRequestDAL.updateById(
        secretApprovalRequest.id,
        {
          conflicts: JSON.stringify(conflicts),
          hasMerged: true,
          status: RequestState.Closed,
          statusChangeBy: membership.id
        },
        tx
      );
      return {
        secrets: { created: newSecrets, updated: updatedSecrets, deleted: deletedSecret },
        approval: updatedSecretApproval
      };
    });
    await snapshotService.performSnapshot(folderId);
    const folder = await folderDAL.findById(folderId);
    // TODO(akhilmhdh-pg):  change query to do secret path from folder
    await secretQueueService.syncSecrets({
      projectId,
      secretPath: "/",
      environment: folder?.environment.envSlug as string
    });
    return mergeStatus;
  };

  // function to save secret change to secret approval
  // this will keep a copy to do merge later when accepting
  const generateSecretApprovalRequest = async ({
    data,
    actorId,
    actor,
    actorOrgId,
    policy,
    projectId,
    secretPath,
    environment
  }: TGenerateSecretApprovalRequestDTO) => {
    if (actor === ActorType.SERVICE) throw new BadRequestError({ message: "Cannot use service token" });

    const { permission, membership } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const isProjectBeingUpgraded = await projectDAL.isProjectBeingUpgraded(projectId);

    if (isProjectBeingUpgraded) {
      throw new BadRequestError({
        message: "Project is currently being upgraded, and secrets cannot be written. Please try again"
      });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) throw new BadRequestError({ message: "Folder not  found", name: "GenSecretApproval" });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg) throw new BadRequestError({ message: "Blind index not found", name: "Update secret" });

    const commits: Omit<TSecretApprovalRequestsSecretsInsert, "requestId">[] = [];
    const commitTagIds: Record<string, string[]> = {};
    // for created secret approval change
    const createdSecrets = data[CommitType.Create];
    if (createdSecrets && createdSecrets?.length) {
      const { keyName2BlindIndex } = await secretService.fnSecretBlindIndexCheck({
        inputSecrets: createdSecrets,
        folderId,
        isNew: true,
        blindIndexCfg
      });

      commits.push(
        ...createdSecrets.map(({ secretName, ...el }) => ({
          ...el,
          op: CommitType.Create as const,
          version: 1,
          secretBlindIndex: keyName2BlindIndex[secretName],
          algorithm: SecretEncryptionAlgo.AES_256_GCM,
          keyEncoding: SecretKeyEncoding.BASE64
        }))
      );
      createdSecrets.forEach(({ tagIds, secretName }) => {
        if (tagIds?.length) commitTagIds[keyName2BlindIndex[secretName]] = tagIds;
      });
    }
    // not secret approval for update operations
    const updatedSecrets = data[CommitType.Update];
    if (updatedSecrets && updatedSecrets?.length) {
      // get all blind index
      // Find all those secrets
      // if not throw not found
      const { keyName2BlindIndex, secrets: secretsToBeUpdated } = await secretService.fnSecretBlindIndexCheck({
        inputSecrets: updatedSecrets,
        folderId,
        isNew: false,
        blindIndexCfg
      });

      // now find any secret that needs to update its name
      // same process as above
      const nameUpdatedSecrets = updatedSecrets.filter(({ newSecretName }) => Boolean(newSecretName));
      const { keyName2BlindIndex: newKeyName2BlindIndex } = await secretService.fnSecretBlindIndexCheck({
        inputSecrets: nameUpdatedSecrets,
        folderId,
        isNew: true,
        blindIndexCfg
      });

      const secsGroupedByBlindIndex = groupBy(secretsToBeUpdated, (el) => el.secretBlindIndex as string);
      const updatedSecretIds = updatedSecrets.map(
        (el) => secsGroupedByBlindIndex[keyName2BlindIndex[el.secretName]][0].id
      );
      const latestSecretVersions = await secretVersionDAL.findLatestVersionMany(folderId, updatedSecretIds);
      commits.push(
        ...updatedSecrets.map(({ newSecretName, secretName, tagIds, ...el }) => {
          const secretId = secsGroupedByBlindIndex[keyName2BlindIndex[secretName]][0].id;
          const secretBlindIndex =
            newSecretName && newKeyName2BlindIndex[newSecretName]
              ? newKeyName2BlindIndex?.[secretName]
              : keyName2BlindIndex[secretName];
          // add tags
          if (tagIds?.length) commitTagIds[keyName2BlindIndex[secretName]] = tagIds;
          return {
            ...latestSecretVersions[secretId],
            ...el,
            op: CommitType.Update as const,
            secret: secretId,
            secretVersion: latestSecretVersions[secretId].id,
            secretBlindIndex,
            version: secsGroupedByBlindIndex[keyName2BlindIndex[secretName]][0].version || 1
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
      const { keyName2BlindIndex, secrets } = await secretService.fnSecretBlindIndexCheck({
        inputSecrets: deletedSecrets,
        folderId,
        isNew: false,
        blindIndexCfg
      });
      const secretsGroupedByBlindIndex = groupBy(secrets, (i) => {
        if (!i.secretBlindIndex) throw new BadRequestError({ message: "Missing secret blind index" });
        return i.secretBlindIndex;
      });
      const deletedSecretIds = deletedSecrets.map(
        (el) => secretsGroupedByBlindIndex[keyName2BlindIndex[el.secretName]][0].id
      );
      const latestSecretVersions = await secretVersionDAL.findLatestVersionMany(folderId, deletedSecretIds);
      commits.push(
        ...deletedSecrets.map((el) => {
          const secretId = secretsGroupedByBlindIndex[keyName2BlindIndex[el.secretName]][0].id;
          if (!latestSecretVersions[secretId].secretBlindIndex)
            throw new BadRequestError({ message: "Failed to find secret blind index" });
          return {
            op: CommitType.Delete as const,
            ...latestSecretVersions[secretId],
            secretBlindIndex: latestSecretVersions[secretId].secretBlindIndex as string,
            secret: secretId,
            secretVersion: latestSecretVersions[secretId].id
          };
        })
      );
    }

    if (!commits.length) throw new BadRequestError({ message: "Empty commits" });

    const tagIds = unique(Object.values(commitTagIds).flat());
    const tags = tagIds.length ? await secretTagDAL.findManyTagsById(projectId, tagIds) : [];
    if (tagIds.length !== tags.length) throw new BadRequestError({ message: "Tag not found" });

    const secretApprovalRequest = await secretApprovalRequestDAL.transaction(async (tx) => {
      const doc = await secretApprovalRequestDAL.create(
        {
          folderId,
          slug: alphaNumericNanoId(),
          policyId: policy.id,
          status: "open",
          hasMerged: false,
          committerId: membership.id
        },
        tx
      );
      const approvalCommits = await secretApprovalRequestSecretDAL.insertMany(
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
            secretReminderNote,
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
            secretReminderNote,
            skipMultilineEncoding,
            secretCommentCiphertext,
            secretReminderRepeatDays
          })
        ),
        tx
      );

      const commitsGroupByBlindIndex = groupBy(approvalCommits, (i) => {
        if (!i.secretBlindIndex) {
          throw new BadRequestError({ message: "Missing secret blind index" });
        }
        return i.secretBlindIndex;
      });
      if (tagIds.length) {
        await secretApprovalRequestSecretDAL.insertApprovalSecretTags(
          Object.keys(commitTagIds).flatMap((blindIndex) =>
            commitTagIds[blindIndex]
              ? commitTagIds[blindIndex].map((tagId) => ({
                  secretId: commitsGroupByBlindIndex[blindIndex][0].id,
                  tagId
                }))
              : []
          ),
          tx
        );
      }
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
