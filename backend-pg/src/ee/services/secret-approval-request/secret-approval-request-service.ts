import { ForbiddenError, subject } from "@casl/ability";

import {
  ProjectMembershipRole,
  SecretEncryptionAlgo,
  SecretKeyEncoding,
  SecretType,
  TSaRequestSecretsInsert
} from "@app/db/schemas";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { groupBy, pick } from "@app/lib/fn";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { ActorType } from "@app/services/auth/auth-type";
import { TSecretBlindIndexDalFactory } from "@app/services/secret/secret-blind-index-dal";
import { TSecretQueueFactory } from "@app/services/secret/secret-queue";
import { TSecretServiceFactory } from "@app/services/secret/secret-service";
import { TSecretVersionDalFactory } from "@app/services/secret/secret-version-dal";
import { TSecretFolderDalFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TSecretSnapshotServiceFactory } from "../secret-snapshot/secret-snapshot-service";
import { TSarReviewerDalFactory } from "./sar-reviewer-dal";
import { TSarSecretDalFactory } from "./sar-secret-dal";
import { TSecretApprovalRequestDalFactory } from "./secret-approval-request-dal";
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
  secretApprovalRequestDal: TSecretApprovalRequestDalFactory;
  sarSecretDal: TSarSecretDalFactory;
  sarReviewerDal: TSarReviewerDalFactory;
  folderDal: Pick<
    TSecretFolderDalFactory,
    "findBySecretPath" | "findById" | "findSecretPathByFolderIds"
  >;
  secretBlindIndexDal: Pick<TSecretBlindIndexDalFactory, "findOne">;
  snapshotService: Pick<TSecretSnapshotServiceFactory, "performSnapshot">;
  secretVersionDal: Pick<TSecretVersionDalFactory, "findLatestVersionMany">;
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

export type TSecretApprovalRequestServiceFactory = ReturnType<
  typeof secretApprovalRequestServiceFactory
>;

export const secretApprovalRequestServiceFactory = ({
  secretApprovalRequestDal,
  folderDal,
  sarReviewerDal,
  sarSecretDal,
  secretBlindIndexDal,
  permissionService,
  snapshotService,
  secretService,
  secretVersionDal,
  secretQueueService
}: TSecretApprovalRequestServiceFactoryDep) => {
  const requestCount = async ({ projectId, actor, actorId }: TApprovalRequestCountDTO) => {
    if (actor === ActorType.SERVICE)
      throw new BadRequestError({ message: "Cannot use service token" });

    const { membership } = await permissionService.getProjectPermission(
      actor as ActorType.USER,
      actorId,
      projectId
    );

    const count = await secretApprovalRequestDal.findProjectRequestCount(projectId, membership.id);
    return count;
  };

  const getSecretApprovals = async ({
    projectId,
    actorId,
    actor,
    status,
    environment,
    committer,
    limit,
    offset
  }: TListApprovalsDTO) => {
    if (actor === ActorType.SERVICE)
      throw new BadRequestError({ message: "Cannot use service token" });

    const { membership } = await permissionService.getProjectPermission(actor, actorId, projectId);
    const approvals = await secretApprovalRequestDal.findByProjectId({
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

  const getSecretApprovalDetails = async ({ actor, actorId, id }: TSecretApprovalDetailsDTO) => {
    if (actor === ActorType.SERVICE)
      throw new BadRequestError({ message: "Cannot use service token" });

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
    const secretPath = await folderDal.findSecretPathByFolderIds(secretApprovalRequest.projectId, [
      secretApprovalRequest.folderId
    ]);
    return { ...secretApprovalRequest, secretPath: secretPath?.[0]?.path || "/", commits: secrets };
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
    if (secretApprovalRequest.status === RequestState.Closed && status === RequestState.Closed)
      throw new BadRequestError({ message: "Approval request is already closed" });
    if (secretApprovalRequest.status === RequestState.Open && status === RequestState.Open)
      throw new BadRequestError({ message: "Approval request is already open" });

    const updatedRequest = await secretApprovalRequestDal.updateById(secretApprovalRequest.id, {
      status,
      statusChangeBy: membership.id
    });
    return { ...secretApprovalRequest, ...updatedRequest };
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

    const { policy, folderId, projectId } = secretApprovalRequest;
    const { membership } = await permissionService.getProjectPermission(
      ActorType.USER,
      actorId,
      projectId
    );
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

    if (!hasMinApproval)
      throw new BadRequestError({ message: "Doesn't have minimum approvals needed" });
    const secretApprovalSecrets = await sarSecretDal.findByRequestId(secretApprovalRequest.id);
    if (!secretApprovalSecrets) throw new BadRequestError({ message: "No secrets found" });

    const conflicts: Array<{ secretId: string; op: CommitType }> = [];
    let secretCreationCommits = secretApprovalSecrets.filter(({ op }) => op === CommitType.Create);
    if (secretCreationCommits.length) {
      const { secsGroupedByBlindIndex: conflictGroupByBlindIndex } =
        await secretService.fnSecretBlindIndexCheckV2({
          folderId,
          inputSecrets: secretCreationCommits.map(({ secretBlindIndex }) => ({ secretBlindIndex }))
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
      const { secsGroupedByBlindIndex: conflictGroupByBlindIndex } =
        await secretService.fnSecretBlindIndexCheckV2({
          folderId,
          inputSecrets: secretUpdationCommits
            .filter(
              ({ secretBlindIndex, secret }) =>
                secret && secret.secretBlindIndex !== secretBlindIndex
            )
            .map(({ secretBlindIndex }) => ({ secretBlindIndex }))
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
          Boolean(secretId) &&
          (secretBlindIndex ? !conflictGroupByBlindIndex[secretBlindIndex] : true)
      );
    }

    const secretDeletionCommits = secretApprovalSecrets.filter(
      ({ op }) => op === CommitType.Delete
    );

    const mergeStatus = await secretApprovalRequestDal.transaction(async (tx) => {
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
                "version",
                "algorithm",
                "keyEncoding",
                "secretBlindIndex"
              ]),
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
                id: el.secretId,
                type: SecretType.Shared
              },
              data: pick(el, [
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
            }))
          })
        : [];
      const deletedSecret = secretDeletionCommits.length
        ? await secretService.fnSecretBulkDelete({
            projectId,
            folderId,
            tx,
            actorId: "",
            inputSecrets: secretDeletionCommits.map(({ secretBlindIndex }) => ({
              secretBlindIndex,
              type: SecretType.Shared
            }))
          })
        : [];
      const updatedSecretApproval = await secretApprovalRequestDal.updateById(
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
    const folder = await folderDal.findById(folderId);
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
    policy,
    projectId,
    secretPath,
    environment
  }: TGenerateSecretApprovalRequestDTO) => {
    if (actor === ActorType.SERVICE)
      throw new BadRequestError({ message: "Cannot use service token" });

    const { permission, membership } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const folder = await folderDal.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new BadRequestError({ message: "Folder not  found", name: "GenSecretApproval" });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDal.findOne({ projectId });
    if (!blindIndexCfg)
      throw new BadRequestError({ message: "Blind index not found", name: "Update secret" });

    const commits: Omit<TSaRequestSecretsInsert, "requestId">[] = [];
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
          version: 0,
          secretBlindIndex: keyName2BlindIndex[secretName],
          algorithm: SecretEncryptionAlgo.AES_256_GCM,
          keyEncoding: SecretKeyEncoding.BASE64
        }))
      );
    }
    // not secret approval for update operations
    const updatedSecrets = data[CommitType.Update];
    if (updatedSecrets && updatedSecrets?.length) {
      // get all blind index
      // Find all those secrets
      // if not throw not found
      const { keyName2BlindIndex, secrets: secretsToBeUpdated } =
        await secretService.fnSecretBlindIndexCheck({
          inputSecrets: updatedSecrets,
          folderId,
          isNew: false,
          blindIndexCfg
        });

      // now find any secret that needs to update its name
      // same process as above
      const nameUpdatedSecrets = updatedSecrets.filter(({ newSecretName }) =>
        Boolean(newSecretName)
      );
      const { keyName2BlindIndex: newKeyName2BlindIndex } =
        await secretService.fnSecretBlindIndexCheck({
          inputSecrets: nameUpdatedSecrets,
          folderId,
          isNew: true,
          blindIndexCfg
        });

      const secsGroupedByBlindIndex = groupBy(secretsToBeUpdated, (el) => el.secretBlindIndex);
      const updatedSecretIds = updatedSecrets.map(
        (el) => secsGroupedByBlindIndex[keyName2BlindIndex[el.secretName]][0].id
      );
      const latestSecretVersions = await secretVersionDal.findLatestVersionMany(
        folderId,
        updatedSecretIds
      );
      commits.push(
        ...updatedSecrets.map(({ newSecretName, secretName, ...el }) => {
          const secretId = secsGroupedByBlindIndex[keyName2BlindIndex[secretName]][0].id;
          return {
            ...latestSecretVersions[secretId],
            ...el,
            op: CommitType.Update as const,
            secret: secretId,
            secretVersion: latestSecretVersions[secretId].id,
            secretBlindIndex:
              newSecretName && newKeyName2BlindIndex[newSecretName]
                ? newKeyName2BlindIndex?.[secretName]
                : keyName2BlindIndex[secretName],
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
      const secretsGroupedByBlindIndex = groupBy(secrets, (i) => i.secretBlindIndex);
      const deletedSecretIds = deletedSecrets.map(
        (el) => secretsGroupedByBlindIndex[keyName2BlindIndex[el.secretName]][0].id
      );
      const latestSecretVersions = await secretVersionDal.findLatestVersionMany(
        folderId,
        deletedSecretIds
      );
      commits.push(
        ...deletedSecrets.map((el) => {
          const secretId = secretsGroupedByBlindIndex[keyName2BlindIndex[el.secretName]][0].id;
          return {
            op: CommitType.Delete as const,
            ...latestSecretVersions[secretId],
            secret: secretId,
            secretVersion: latestSecretVersions[secretId].id
          };
        })
      );
    }

    if (!commits.length) throw new BadRequestError({ message: "Empty commits" });
    const secretApprovalRequest = await secretApprovalRequestDal.transaction(async (tx) => {
      const doc = await secretApprovalRequestDal.create(
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
