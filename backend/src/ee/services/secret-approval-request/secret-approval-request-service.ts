import { ForbiddenError, subject } from "@casl/ability";

import {
  ProjectMembershipRole,
  SecretEncryptionAlgo,
  SecretKeyEncoding,
  SecretType,
  TSecretApprovalRequestsSecretsInsert,
  TSecretApprovalRequestsSecretsV2Insert
} from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { decryptSymmetric128BitHexKeyUTF8 } from "@app/lib/crypto";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { groupBy, pick, unique } from "@app/lib/fn";
import { setKnexStringValue } from "@app/lib/knex";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { EnforcementLevel } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TSecretDALFactory } from "@app/services/secret/secret-dal";
import {
  decryptSecretWithBot,
  fnSecretBlindIndexCheck,
  fnSecretBlindIndexCheckV2,
  fnSecretBulkDelete,
  fnSecretBulkInsert,
  fnSecretBulkUpdate,
  getAllNestedSecretReferences
} from "@app/services/secret/secret-fns";
import { TSecretQueueFactory } from "@app/services/secret/secret-queue";
import { SecretOperations } from "@app/services/secret/secret-types";
import { TSecretVersionDALFactory } from "@app/services/secret/secret-version-dal";
import { TSecretVersionTagDALFactory } from "@app/services/secret/secret-version-tag-dal";
import { TSecretBlindIndexDALFactory } from "@app/services/secret-blind-index/secret-blind-index-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import {
  fnSecretBulkDelete as fnSecretV2BridgeBulkDelete,
  fnSecretBulkInsert as fnSecretV2BridgeBulkInsert,
  fnSecretBulkUpdate as fnSecretV2BridgeBulkUpdate,
  getAllNestedSecretReferences as getAllNestedSecretReferencesV2Bridge
} from "@app/services/secret-v2-bridge/secret-v2-bridge-fns";
import { TSecretVersionV2DALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "@app/services/secret-v2-bridge/secret-version-tag-dal";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { triggerSlackNotification } from "@app/services/slack/slack-fns";
import { SlackTriggerFeature } from "@app/services/slack/slack-types";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TSecretApprovalPolicyDALFactory } from "../secret-approval-policy/secret-approval-policy-dal";
import { TSecretSnapshotServiceFactory } from "../secret-snapshot/secret-snapshot-service";
import { TSecretApprovalRequestDALFactory } from "./secret-approval-request-dal";
import { sendApprovalEmailsFn } from "./secret-approval-request-fns";
import { TSecretApprovalRequestReviewerDALFactory } from "./secret-approval-request-reviewer-dal";
import { TSecretApprovalRequestSecretDALFactory } from "./secret-approval-request-secret-dal";
import {
  ApprovalStatus,
  RequestState,
  TApprovalRequestCountDTO,
  TGenerateSecretApprovalRequestDTO,
  TGenerateSecretApprovalRequestV2BridgeDTO,
  TListApprovalsDTO,
  TMergeSecretApprovalRequestDTO,
  TReviewRequestDTO,
  TSecretApprovalDetailsDTO,
  TStatusChangeDTO
} from "./secret-approval-request-types";

type TSecretApprovalRequestServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  secretApprovalRequestDAL: TSecretApprovalRequestDALFactory;
  secretApprovalRequestSecretDAL: TSecretApprovalRequestSecretDALFactory;
  secretApprovalRequestReviewerDAL: TSecretApprovalRequestReviewerDALFactory;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findSecretPathByFolderIds">;
  secretDAL: TSecretDALFactory;
  secretTagDAL: Pick<
    TSecretTagDALFactory,
    "findManyTagsById" | "saveTagsToSecret" | "deleteTagsManySecret" | "saveTagsToSecretV2" | "deleteTagsToSecretV2"
  >;
  secretBlindIndexDAL: Pick<TSecretBlindIndexDALFactory, "findOne">;
  snapshotService: Pick<TSecretSnapshotServiceFactory, "performSnapshot">;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "findLatestVersionMany" | "insertMany">;
  secretVersionTagDAL: Pick<TSecretVersionTagDALFactory, "insertMany">;
  smtpService: Pick<TSmtpService, "sendMail">;
  userDAL: Pick<TUserDALFactory, "find" | "findOne" | "findById">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  projectDAL: Pick<
    TProjectDALFactory,
    "checkProjectUpgradeStatus" | "findById" | "findProjectById" | "findProjectWithOrg"
  >;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets" | "removeSecretReminder">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "encryptWithInputKey" | "decryptWithInputKey">;
  secretV2BridgeDAL: Pick<
    TSecretV2BridgeDALFactory,
    "insertMany" | "upsertSecretReferences" | "findBySecretKeys" | "bulkUpdate" | "deleteMany"
  >;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionMany">;
  secretVersionTagV2BridgeDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  secretApprovalPolicyDAL: Pick<TSecretApprovalPolicyDALFactory, "findById">;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TSecretApprovalRequestServiceFactory = ReturnType<typeof secretApprovalRequestServiceFactory>;

export const secretApprovalRequestServiceFactory = ({
  secretApprovalRequestDAL,
  secretDAL,
  folderDAL,
  secretTagDAL,
  secretVersionTagDAL,
  secretApprovalRequestReviewerDAL,
  secretApprovalRequestSecretDAL,
  secretBlindIndexDAL,
  projectDAL,
  permissionService,
  snapshotService,
  secretVersionDAL,
  secretQueueService,
  projectBotService,
  smtpService,
  userDAL,
  projectEnvDAL,
  secretApprovalPolicyDAL,
  kmsService,
  secretV2BridgeDAL,
  secretVersionV2BridgeDAL,
  secretVersionTagV2BridgeDAL,
  licenseService,
  projectSlackConfigDAL
}: TSecretApprovalRequestServiceFactoryDep) => {
  const requestCount = async ({ projectId, actor, actorId, actorOrgId, actorAuthMethod }: TApprovalRequestCountDTO) => {
    if (actor === ActorType.SERVICE) throw new BadRequestError({ message: "Cannot use service token" });

    await permissionService.getProjectPermission(
      actor as ActorType.USER,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    const count = await secretApprovalRequestDAL.findProjectRequestCount(projectId, actorId);
    return count;
  };

  const getSecretApprovals = async ({
    projectId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    status,
    environment,
    committer,
    limit,
    offset
  }: TListApprovalsDTO) => {
    if (actor === ActorType.SERVICE) throw new BadRequestError({ message: "Cannot use service token" });

    await permissionService.getProjectPermission(actor, actorId, projectId, actorAuthMethod, actorOrgId);

    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    if (shouldUseSecretV2Bridge) {
      return secretApprovalRequestDAL.findByProjectIdBridgeSecretV2({
        projectId,
        committer,
        environment,
        status,
        userId: actorId,
        limit,
        offset
      });
    }
    const approvals = await secretApprovalRequestDAL.findByProjectId({
      projectId,
      committer,
      environment,
      status,
      userId: actorId,
      limit,
      offset
    });
    return approvals;
  };

  const getSecretApprovalDetails = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    id
  }: TSecretApprovalDetailsDTO) => {
    if (actor === ActorType.SERVICE) throw new BadRequestError({ message: "Cannot use service token" });

    const secretApprovalRequest = await secretApprovalRequestDAL.findById(id);
    if (!secretApprovalRequest) throw new BadRequestError({ message: "Secret approval request not found" });

    const { projectId } = secretApprovalRequest;
    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);

    const { policy } = secretApprovalRequest;
    const { hasRole } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    if (
      !hasRole(ProjectMembershipRole.Admin) &&
      secretApprovalRequest.committerUserId !== actorId &&
      !policy.approvers.find(({ userId }) => userId === actorId)
    ) {
      throw new UnauthorizedError({ message: "User has no access" });
    }

    let secrets;
    if (shouldUseSecretV2Bridge) {
      const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      const encrypedSecrets = await secretApprovalRequestSecretDAL.findByRequestIdBridgeSecretV2(
        secretApprovalRequest.id
      );
      secrets = encrypedSecrets.map((el) => ({
        ...el,
        secretKey: el.key,
        id: el.id,
        version: el.version,
        secretValue: el.encryptedValue ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString() : "",
        secretComment: el.encryptedComment
          ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString()
          : "",
        secret: el.secret
          ? {
              secretKey: el.secret.key,
              id: el.secret.id,
              version: el.secret.version,
              secretValue: el.secret.encryptedValue
                ? secretManagerDecryptor({ cipherTextBlob: el.secret.encryptedValue }).toString()
                : "",
              secretComment: el.secret.encryptedComment
                ? secretManagerDecryptor({ cipherTextBlob: el.secret.encryptedComment }).toString()
                : ""
            }
          : undefined,
        secretVersion: el.secretVersion
          ? {
              secretKey: el.secretVersion.key,
              id: el.secretVersion.id,
              version: el.secretVersion.version,
              secretValue: el.secretVersion.encryptedValue
                ? secretManagerDecryptor({ cipherTextBlob: el.secretVersion.encryptedValue }).toString()
                : "",
              secretComment: el.secretVersion.encryptedComment
                ? secretManagerDecryptor({ cipherTextBlob: el.secretVersion.encryptedComment }).toString()
                : ""
            }
          : undefined
      }));
    } else {
      if (!botKey) throw new BadRequestError({ message: "Bot key not found" });
      const encrypedSecrets = await secretApprovalRequestSecretDAL.findByRequestId(secretApprovalRequest.id);
      secrets = encrypedSecrets.map((el) => ({
        ...el,
        ...decryptSecretWithBot(el, botKey),
        secret: el.secret
          ? {
              id: el.secret.id,
              version: el.secret.version,
              ...decryptSecretWithBot(el.secret, botKey)
            }
          : undefined,
        secretVersion: el.secretVersion
          ? {
              id: el.secretVersion.id,
              version: el.secretVersion.version,
              ...decryptSecretWithBot(el.secretVersion, botKey)
            }
          : undefined
      }));
    }
    const secretPath = await folderDAL.findSecretPathByFolderIds(secretApprovalRequest.projectId, [
      secretApprovalRequest.folderId
    ]);
    return { ...secretApprovalRequest, secretPath: secretPath?.[0]?.path || "/", commits: secrets };
  };

  const reviewApproval = async ({
    approvalId,
    actor,
    status,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TReviewRequestDTO) => {
    const secretApprovalRequest = await secretApprovalRequestDAL.findById(approvalId);
    if (!secretApprovalRequest) throw new BadRequestError({ message: "Secret approval request not found" });
    if (actor !== ActorType.USER) throw new BadRequestError({ message: "Must be a user" });

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message:
          "Failed to review secret approval request due to plan restriction. Upgrade plan to review secret approval request."
      });
    }

    const { policy } = secretApprovalRequest;
    const { hasRole } = await permissionService.getProjectPermission(
      ActorType.USER,
      actorId,
      secretApprovalRequest.projectId,
      actorAuthMethod,
      actorOrgId
    );
    if (
      !hasRole(ProjectMembershipRole.Admin) &&
      secretApprovalRequest.committerUserId !== actorId &&
      !policy.approvers.find(({ userId }) => userId === actorId)
    ) {
      throw new UnauthorizedError({ message: "User has no access" });
    }
    const reviewStatus = await secretApprovalRequestReviewerDAL.transaction(async (tx) => {
      const review = await secretApprovalRequestReviewerDAL.findOne(
        {
          requestId: secretApprovalRequest.id,
          reviewerUserId: actorId
        },
        tx
      );
      if (!review) {
        return secretApprovalRequestReviewerDAL.create(
          {
            status,
            requestId: secretApprovalRequest.id,
            reviewerUserId: actorId
          },
          tx
        );
      }
      return secretApprovalRequestReviewerDAL.updateById(review.id, { status }, tx);
    });
    return reviewStatus;
  };

  const updateApprovalStatus = async ({
    actorId,
    status,
    approvalId,
    actor,
    actorOrgId,
    actorAuthMethod
  }: TStatusChangeDTO) => {
    const secretApprovalRequest = await secretApprovalRequestDAL.findById(approvalId);
    if (!secretApprovalRequest) throw new BadRequestError({ message: "Secret approval request not found" });
    if (actor !== ActorType.USER) throw new BadRequestError({ message: "Must be a user" });

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message:
          "Failed to update secret approval request due to plan restriction. Upgrade plan to update secret approval request."
      });
    }

    const { policy } = secretApprovalRequest;
    const { hasRole } = await permissionService.getProjectPermission(
      ActorType.USER,
      actorId,
      secretApprovalRequest.projectId,
      actorAuthMethod,
      actorOrgId
    );
    if (
      !hasRole(ProjectMembershipRole.Admin) &&
      secretApprovalRequest.committerUserId !== actorId &&
      !policy.approvers.find(({ userId }) => userId === actorId)
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
      statusChangedByUserId: actorId
    });
    return { ...secretApprovalRequest, ...updatedRequest };
  };

  const mergeSecretApprovalRequest = async ({
    approvalId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    bypassReason
  }: TMergeSecretApprovalRequestDTO) => {
    const secretApprovalRequest = await secretApprovalRequestDAL.findById(approvalId);
    if (!secretApprovalRequest) throw new BadRequestError({ message: "Secret approval request not found" });
    if (actor !== ActorType.USER) throw new BadRequestError({ message: "Must be a user" });

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message:
          "Failed to merge secret approval request due to plan restriction. Upgrade plan to merge secret approval request."
      });
    }

    const { policy, folderId, projectId } = secretApprovalRequest;
    const { hasRole } = await permissionService.getProjectPermission(
      ActorType.USER,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    if (
      !hasRole(ProjectMembershipRole.Admin) &&
      secretApprovalRequest.committerUserId !== actorId &&
      !policy.approvers.find(({ userId }) => userId === actorId)
    ) {
      throw new UnauthorizedError({ message: "User has no access" });
    }
    const reviewers = secretApprovalRequest.reviewers.reduce<Record<string, ApprovalStatus>>(
      (prev, curr) => ({ ...prev, [curr.userId.toString()]: curr.status as ApprovalStatus }),
      {}
    );
    const hasMinApproval =
      secretApprovalRequest.policy.approvals <=
      secretApprovalRequest.policy.approvers.filter(
        ({ userId: approverId }) => reviewers[approverId.toString()] === ApprovalStatus.APPROVED
      ).length;
    const isSoftEnforcement = secretApprovalRequest.policy.enforcementLevel === EnforcementLevel.Soft;

    if (!hasMinApproval && !isSoftEnforcement)
      throw new BadRequestError({ message: "Doesn't have minimum approvals needed" });

    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    let mergeStatus;
    if (shouldUseSecretV2Bridge) {
      // this cycle if for bridged secrets
      const secretApprovalSecrets = await secretApprovalRequestSecretDAL.findByRequestIdBridgeSecretV2(
        secretApprovalRequest.id
      );
      if (!secretApprovalSecrets) throw new BadRequestError({ message: "No secrets found" });

      const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });

      const conflicts: Array<{ secretId: string; op: SecretOperations }> = [];
      let secretCreationCommits = secretApprovalSecrets.filter(({ op }) => op === SecretOperations.Create);
      if (secretCreationCommits.length) {
        const secrets = await secretV2BridgeDAL.findBySecretKeys(
          folderId,
          secretCreationCommits.map((el) => ({
            key: el.key,
            type: SecretType.Shared
          }))
        );
        const creationConflictSecretsGroupByKey = groupBy(secrets, (i) => i.key);
        secretCreationCommits
          .filter(({ key }) => creationConflictSecretsGroupByKey[key])
          .forEach((el) => {
            conflicts.push({ op: SecretOperations.Create, secretId: el.id });
          });
        secretCreationCommits = secretCreationCommits.filter(({ key }) => !creationConflictSecretsGroupByKey[key]);
      }

      let secretUpdationCommits = secretApprovalSecrets.filter(({ op }) => op === SecretOperations.Update);
      if (secretUpdationCommits.length) {
        const secrets = await secretV2BridgeDAL.findBySecretKeys(
          folderId,
          secretCreationCommits.map((el) => ({
            key: el.key,
            type: SecretType.Shared
          }))
        );
        const updationConflictSecretsGroupByKey = groupBy(secrets, (i) => i.key);
        secretUpdationCommits
          .filter(({ key, secretId }) => updationConflictSecretsGroupByKey[key] || !secretId)
          .forEach((el) => {
            conflicts.push({ op: SecretOperations.Update, secretId: el.id });
          });

        secretUpdationCommits = secretUpdationCommits.filter(
          ({ key, secretId }) => Boolean(secretId) && !updationConflictSecretsGroupByKey[key]
        );
      }

      const secretDeletionCommits = secretApprovalSecrets.filter(({ op }) => op === SecretOperations.Delete);
      mergeStatus = await secretApprovalRequestDAL.transaction(async (tx) => {
        const newSecrets = secretCreationCommits.length
          ? await fnSecretV2BridgeBulkInsert({
              tx,
              folderId,
              inputSecrets: secretCreationCommits.map((el) => ({
                tagIds: el?.tags.map(({ id }) => id),
                version: 1,
                encryptedComment: el.encryptedComment,
                encryptedValue: el.encryptedValue,
                skipMultilineEncoding: el.skipMultilineEncoding,
                key: el.key,
                references: el.encryptedValue
                  ? getAllNestedSecretReferencesV2Bridge(
                      secretManagerDecryptor({
                        cipherTextBlob: el.encryptedValue
                      }).toString()
                    )
                  : [],
                type: SecretType.Shared
              })),
              secretDAL: secretV2BridgeDAL,
              secretVersionDAL: secretVersionV2BridgeDAL,
              secretTagDAL,
              secretVersionTagDAL: secretVersionTagV2BridgeDAL
            })
          : [];
        const updatedSecrets = secretUpdationCommits.length
          ? await fnSecretV2BridgeBulkUpdate({
              folderId,
              tx,
              inputSecrets: secretUpdationCommits.map((el) => {
                const encryptedValue =
                  typeof el.encryptedValue !== "undefined"
                    ? {
                        encryptedValue: el.encryptedValue as Buffer,
                        references: el.encryptedValue
                          ? getAllNestedSecretReferencesV2Bridge(
                              secretManagerDecryptor({
                                cipherTextBlob: el.encryptedValue
                              }).toString()
                            )
                          : []
                      }
                    : {};
                return {
                  filter: { id: el.secretId as string, type: SecretType.Shared },
                  data: {
                    reminderRepeatDays: el.reminderRepeatDays,
                    encryptedComment: el.encryptedComment,
                    reminderNote: el.reminderNote,
                    skipMultilineEncoding: el.skipMultilineEncoding,
                    key: el.key,
                    tagIds: el?.tags.map(({ id }) => id),
                    ...encryptedValue
                  }
                };
              }),
              secretDAL: secretV2BridgeDAL,
              secretVersionDAL: secretVersionV2BridgeDAL,
              secretTagDAL,
              secretVersionTagDAL: secretVersionTagV2BridgeDAL
            })
          : [];
        const deletedSecret = secretDeletionCommits.length
          ? await fnSecretV2BridgeBulkDelete({
              projectId,
              folderId,
              tx,
              actorId: "",
              secretDAL: secretV2BridgeDAL,
              secretQueueService,
              inputSecrets: secretDeletionCommits.map(({ key }) => ({ secretKey: key, type: SecretType.Shared }))
            })
          : [];
        const updatedSecretApproval = await secretApprovalRequestDAL.updateById(
          secretApprovalRequest.id,
          {
            conflicts: JSON.stringify(conflicts),
            hasMerged: true,
            status: RequestState.Closed,
            statusChangedByUserId: actorId
          },
          tx
        );
        return {
          secrets: { created: newSecrets, updated: updatedSecrets, deleted: deletedSecret },
          approval: updatedSecretApproval
        };
      });
    } else {
      const secretApprovalSecrets = await secretApprovalRequestSecretDAL.findByRequestId(secretApprovalRequest.id);
      if (!secretApprovalSecrets) throw new BadRequestError({ message: "No secrets found" });

      const conflicts: Array<{ secretId: string; op: SecretOperations }> = [];
      let secretCreationCommits = secretApprovalSecrets.filter(({ op }) => op === SecretOperations.Create);
      if (secretCreationCommits.length) {
        const { secsGroupedByBlindIndex: conflictGroupByBlindIndex } = await fnSecretBlindIndexCheckV2({
          folderId,
          secretDAL,
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
            conflicts.push({ op: SecretOperations.Create, secretId: el.id });
          });
        secretCreationCommits = secretCreationCommits.filter(
          ({ secretBlindIndex }) => !conflictGroupByBlindIndex[secretBlindIndex || ""]
        );
      }

      let secretUpdationCommits = secretApprovalSecrets.filter(({ op }) => op === SecretOperations.Update);
      if (secretUpdationCommits.length) {
        const { secsGroupedByBlindIndex: conflictGroupByBlindIndex } = await fnSecretBlindIndexCheckV2({
          folderId,
          secretDAL,
          userId: "",
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
            conflicts.push({ op: SecretOperations.Update, secretId: el.id });
          });

        secretUpdationCommits = secretUpdationCommits.filter(
          ({ secretBlindIndex, secretId }) =>
            Boolean(secretId) && (secretBlindIndex ? !conflictGroupByBlindIndex[secretBlindIndex] : true)
        );
      }

      const secretDeletionCommits = secretApprovalSecrets.filter(({ op }) => op === SecretOperations.Delete);
      mergeStatus = await secretApprovalRequestDAL.transaction(async (tx) => {
        const newSecrets = secretCreationCommits.length
          ? await fnSecretBulkInsert({
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
                type: SecretType.Shared,
                references: botKey
                  ? getAllNestedSecretReferences(
                      decryptSymmetric128BitHexKeyUTF8({
                        ciphertext: el.secretValueCiphertext,
                        iv: el.secretValueIV,
                        tag: el.secretValueTag,
                        key: botKey
                      })
                    )
                  : undefined
              })),
              secretDAL,
              secretVersionDAL,
              secretTagDAL,
              secretVersionTagDAL
            })
          : [];
        const updatedSecrets = secretUpdationCommits.length
          ? await fnSecretBulkUpdate({
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
                  ]),
                  references: botKey
                    ? getAllNestedSecretReferences(
                        decryptSymmetric128BitHexKeyUTF8({
                          ciphertext: el.secretValueCiphertext,
                          iv: el.secretValueIV,
                          tag: el.secretValueTag,
                          key: botKey
                        })
                      )
                    : undefined
                }
              })),
              secretDAL,
              secretVersionDAL,
              secretTagDAL,
              secretVersionTagDAL
            })
          : [];
        const deletedSecret = secretDeletionCommits.length
          ? await fnSecretBulkDelete({
              projectId,
              folderId,
              tx,
              actorId: "",
              secretDAL,
              secretQueueService,
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
            statusChangedByUserId: actorId
          },
          tx
        );
        return {
          secrets: { created: newSecrets, updated: updatedSecrets, deleted: deletedSecret },
          approval: updatedSecretApproval
        };
      });
    }

    await snapshotService.performSnapshot(folderId);
    const [folder] = await folderDAL.findSecretPathByFolderIds(projectId, [folderId]);
    if (!folder) throw new BadRequestError({ message: "Folder not found" });
    await secretQueueService.syncSecrets({
      projectId,
      secretPath: folder.path,
      environmentSlug: folder.environmentSlug,
      actorId,
      actor
    });

    if (isSoftEnforcement) {
      const cfg = getConfig();
      const project = await projectDAL.findProjectById(projectId);
      const env = await projectEnvDAL.findOne({ id: policy.envId });
      const requestedByUser = await userDAL.findOne({ id: actorId });
      const approverUsers = await userDAL.find({
        $in: {
          id: policy.approvers.map((approver: { userId: string }) => approver.userId)
        }
      });

      await smtpService.sendMail({
        recipients: approverUsers.filter((approver) => approver.email).map((approver) => approver.email!),
        subjectLine: "Infisical Secret Change Policy Bypassed",

        substitutions: {
          projectName: project.name,
          requesterFullName: `${requestedByUser.firstName} ${requestedByUser.lastName}`,
          requesterEmail: requestedByUser.email,
          bypassReason,
          secretPath: policy.secretPath,
          environment: env.name,
          approvalUrl: `${cfg.SITE_URL}/project/${project.id}/approval`
        },
        template: SmtpTemplates.AccessSecretRequestBypassed
      });
    }

    return mergeStatus;
  };

  // function to save secret change to secret approval
  // this will keep a copy to do merge later when accepting
  const generateSecretApprovalRequest = async ({
    data,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    policy,
    projectId,
    secretPath,
    environment
  }: TGenerateSecretApprovalRequestDTO) => {
    if (actor === ActorType.SERVICE) throw new BadRequestError({ message: "Cannot use service token" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new BadRequestError({
        message: "Folder not found for the given environment slug & secret path",
        name: "GenSecretApproval"
      });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg) throw new BadRequestError({ message: "Blind index not found", name: "Update secret" });

    const commits: Omit<TSecretApprovalRequestsSecretsInsert, "requestId">[] = [];
    const commitTagIds: Record<string, string[]> = {};
    // for created secret approval change
    const createdSecrets = data[SecretOperations.Create];
    if (createdSecrets && createdSecrets?.length) {
      const { keyName2BlindIndex } = await fnSecretBlindIndexCheck({
        inputSecrets: createdSecrets,
        folderId,
        isNew: true,
        blindIndexCfg,
        secretDAL
      });

      commits.push(
        ...createdSecrets.map(({ secretName, ...el }) => ({
          ...el,
          op: SecretOperations.Create as const,
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
    const updatedSecrets = data[SecretOperations.Update];
    if (updatedSecrets && updatedSecrets?.length) {
      // get all blind index
      // Find all those secrets
      // if not throw not found
      const { keyName2BlindIndex, secrets: secretsToBeUpdated } = await fnSecretBlindIndexCheck({
        inputSecrets: updatedSecrets,
        folderId,
        isNew: false,
        blindIndexCfg,
        secretDAL
      });

      // now find any secret that needs to update its name
      // same process as above
      const nameUpdatedSecrets = updatedSecrets.filter(({ newSecretName }) => Boolean(newSecretName));
      const { keyName2BlindIndex: newKeyName2BlindIndex } = await fnSecretBlindIndexCheck({
        inputSecrets: nameUpdatedSecrets.map(({ newSecretName }) => ({ secretName: newSecretName as string })),
        folderId,
        isNew: true,
        blindIndexCfg,
        secretDAL
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
              ? newKeyName2BlindIndex?.[newSecretName]
              : keyName2BlindIndex[secretName];
          // add tags
          if (tagIds?.length) commitTagIds[keyName2BlindIndex[secretName]] = tagIds;
          return {
            ...latestSecretVersions[secretId],
            ...el,
            op: SecretOperations.Update as const,
            secret: secretId,
            secretVersion: latestSecretVersions[secretId].id,
            secretBlindIndex,
            version: secsGroupedByBlindIndex[keyName2BlindIndex[secretName]][0].version || 1
          };
        })
      );
    }
    // deleted secrets
    const deletedSecrets = data[SecretOperations.Delete];
    if (deletedSecrets && deletedSecrets.length) {
      // get all blind index
      // Find all those secrets
      // if not throw not found
      const { keyName2BlindIndex, secrets } = await fnSecretBlindIndexCheck({
        inputSecrets: deletedSecrets,
        folderId,
        isNew: false,
        blindIndexCfg,
        secretDAL
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
            op: SecretOperations.Delete as const,
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
          committerUserId: actorId
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

    const env = await projectEnvDAL.findOne({ id: policy.envId });
    const user = await userDAL.findById(secretApprovalRequest.committerUserId);
    await triggerSlackNotification({
      projectId,
      projectDAL,
      kmsService,
      projectSlackConfigDAL,
      notification: {
        type: SlackTriggerFeature.SECRET_APPROVAL,
        payload: {
          userEmail: user.email as string,
          environment: env.name,
          secretPath,
          projectId,
          requestId: secretApprovalRequest.id
        }
      }
    });

    await sendApprovalEmailsFn({
      projectDAL,
      secretApprovalPolicyDAL,
      secretApprovalRequest,
      smtpService,
      projectId
    });

    return secretApprovalRequest;
  };

  const generateSecretApprovalRequestV2Bridge = async ({
    data,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    policy,
    projectId,
    secretPath,
    environment
  }: TGenerateSecretApprovalRequestV2BridgeDTO) => {
    if (actor === ActorType.SERVICE || actor === ActorType.Machine)
      throw new BadRequestError({ message: "Cannot use service token or machine token over protected branches" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new BadRequestError({
        message: "Folder not found for the given environment slug & secret path",
        name: "GenSecretApproval"
      });
    const folderId = folder.id;

    const commits: Omit<TSecretApprovalRequestsSecretsV2Insert, "requestId">[] = [];
    const commitTagIds: Record<string, string[]> = {};

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    // for created secret approval change
    const createdSecrets = data[SecretOperations.Create];
    if (createdSecrets && createdSecrets?.length) {
      const secrets = await secretV2BridgeDAL.findBySecretKeys(
        folderId,
        createdSecrets.map((el) => ({
          key: el.secretKey,
          type: SecretType.Shared
        }))
      );
      if (secrets.length)
        throw new BadRequestError({ message: `Secret already exist: ${secrets.map((el) => el.key).join(",")}` });

      commits.push(
        ...createdSecrets.map((createdSecret) => ({
          op: SecretOperations.Create,
          version: 1,
          encryptedComment: setKnexStringValue(
            createdSecret.secretComment,
            (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
          ),
          encryptedValue: setKnexStringValue(
            createdSecret.secretValue,
            (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
          ),
          skipMultilineEncoding: createdSecret.skipMultilineEncoding,
          key: createdSecret.secretKey,
          type: SecretType.Shared
        }))
      );
      createdSecrets.forEach(({ tagIds, secretKey }) => {
        if (tagIds?.length) commitTagIds[secretKey] = tagIds;
      });
    }
    // not secret approval for update operations
    const secretsToUpdate = data[SecretOperations.Update];
    if (secretsToUpdate && secretsToUpdate?.length) {
      const secretsToUpdateStoredInDB = await secretV2BridgeDAL.findBySecretKeys(
        folderId,
        secretsToUpdate.map((el) => ({
          key: el.secretKey,
          type: SecretType.Shared
        }))
      );
      if (secretsToUpdateStoredInDB.length !== secretsToUpdate.length)
        throw new BadRequestError({
          message: `Secret not exist: ${secretsToUpdateStoredInDB.map((el) => el.key).join(",")}`
        });

      // now find any secret that needs to update its name
      // same process as above
      const secretsWithNewName = secretsToUpdate.filter(({ newSecretName }) => Boolean(newSecretName));
      if (secretsWithNewName.length) {
        const secrets = await secretV2BridgeDAL.findBySecretKeys(
          folderId,
          secretsWithNewName.map((el) => ({
            key: el.secretKey,
            type: SecretType.Shared
          }))
        );
        if (secrets.length)
          throw new BadRequestError({
            message: `Secret not exist: ${secretsToUpdateStoredInDB.map((el) => el.key).join(",")}`
          });
      }

      const updatingSecretsGroupByKey = groupBy(secretsToUpdateStoredInDB, (el) => el.key);
      const latestSecretVersions = await secretVersionV2BridgeDAL.findLatestVersionMany(
        folderId,
        secretsToUpdateStoredInDB.map(({ id }) => id)
      );
      commits.push(
        ...secretsToUpdate.map(
          ({
            newSecretName,
            secretKey,
            tagIds,
            secretValue,
            reminderRepeatDays,
            reminderNote,
            secretComment,
            metadata,
            skipMultilineEncoding
          }) => {
            const secretId = updatingSecretsGroupByKey[secretKey][0].id;
            if (tagIds?.length) commitTagIds[secretKey] = tagIds;
            return {
              ...latestSecretVersions[secretId],
              key: newSecretName || secretKey,
              encryptedComment: setKnexStringValue(
                secretComment,
                (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
              ),
              encryptedValue: setKnexStringValue(
                secretValue,
                (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
              ),
              reminderRepeatDays,
              reminderNote,
              metadata,
              skipMultilineEncoding,
              op: SecretOperations.Update as const,
              secret: secretId,
              secretVersion: latestSecretVersions[secretId].id,
              version: updatingSecretsGroupByKey[secretKey][0].version || 1
            };
          }
        )
      );
    }
    // deleted secrets
    const deletedSecrets = data[SecretOperations.Delete];
    if (deletedSecrets && deletedSecrets.length) {
      const secretsToDeleteInDB = await secretV2BridgeDAL.findBySecretKeys(
        folderId,
        deletedSecrets.map((el) => ({
          key: el.secretKey,
          type: SecretType.Shared
        }))
      );
      if (secretsToDeleteInDB.length !== deletedSecrets.length)
        throw new BadRequestError({
          message: `Secret not exist: ${secretsToDeleteInDB.map((el) => el.key).join(",")}`
        });
      const secretsGroupedByKey = groupBy(secretsToDeleteInDB, (i) => i.key);
      const deletedSecretIds = deletedSecrets.map((el) => secretsGroupedByKey[el.secretKey][0].id);
      const latestSecretVersions = await secretVersionV2BridgeDAL.findLatestVersionMany(folderId, deletedSecretIds);
      commits.push(
        ...deletedSecrets.map(({ secretKey }) => {
          const secretId = secretsGroupedByKey[secretKey][0].id;
          return {
            op: SecretOperations.Delete as const,
            ...latestSecretVersions[secretId],
            key: secretKey,
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
          committerUserId: actorId
        },
        tx
      );
      const approvalCommits = await secretApprovalRequestSecretDAL.insertV2Bridge(
        commits.map(
          ({
            version,
            op,
            key,
            encryptedComment,
            skipMultilineEncoding,
            metadata,
            reminderNote,
            reminderRepeatDays,
            encryptedValue,
            secretId,
            secretVersion
          }) => ({
            version,
            requestId: doc.id,
            op,
            secretId,
            metadata,
            secretVersion,
            skipMultilineEncoding,
            encryptedValue,
            reminderRepeatDays,
            reminderNote,
            encryptedComment,
            key
          })
        ),
        tx
      );

      const commitsGroupByKey = groupBy(approvalCommits, (i) => i.key);
      if (tagIds.length) {
        await secretApprovalRequestSecretDAL.insertApprovalSecretV2Tags(
          Object.keys(commitTagIds).flatMap((blindIndex) =>
            commitTagIds[blindIndex]
              ? commitTagIds[blindIndex].map((tagId) => ({
                  secretId: commitsGroupByKey[blindIndex][0].id,
                  tagId
                }))
              : []
          ),
          tx
        );
      }

      return { ...doc, commits: approvalCommits };
    });

    const user = await userDAL.findById(secretApprovalRequest.committerUserId);
    const env = await projectEnvDAL.findOne({ id: policy.envId });
    await triggerSlackNotification({
      projectId,
      projectDAL,
      kmsService,
      projectSlackConfigDAL,
      notification: {
        type: SlackTriggerFeature.SECRET_APPROVAL,
        payload: {
          userEmail: user.email as string,
          environment: env.name,
          secretPath,
          projectId,
          requestId: secretApprovalRequest.id
        }
      }
    });

    await sendApprovalEmailsFn({
      projectDAL,
      secretApprovalPolicyDAL,
      secretApprovalRequest,
      smtpService,
      projectId
    });
    return secretApprovalRequest;
  };

  return {
    generateSecretApprovalRequest,
    generateSecretApprovalRequestV2Bridge,
    mergeSecretApprovalRequest,
    reviewApproval,
    updateApprovalStatus,
    getSecretApprovals,
    getSecretApprovalDetails,
    requestCount
  };
};
