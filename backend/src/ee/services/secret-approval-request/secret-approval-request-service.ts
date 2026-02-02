/* eslint-disable no-nested-ternary */
import { ForbiddenError, subject } from "@casl/ability";
import { Knex } from "knex";

import {
  ActionProjectType,
  ProjectMembershipRole,
  SecretEncryptionAlgo,
  SecretKeyEncoding,
  SecretType,
  TableName,
  TSecretApprovalRequestsSecretsInsert,
  TSecretApprovalRequestsSecretsV2Insert
} from "@app/db/schemas";
import { Event, EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AUDIT_LOG_SENSITIVE_VALUE } from "@app/lib/config/const";
import { getConfig } from "@app/lib/config/env";
import { crypto, SymmetricKeySize } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy, pick, unique } from "@app/lib/fn";
import { setKnexStringValue } from "@app/lib/knex";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { EnforcementLevel } from "@app/lib/types";
import { triggerWorkflowIntegrationNotification } from "@app/lib/workflow-integrations/trigger-notification";
import { TriggerFeature } from "@app/lib/workflow-integrations/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TFolderCommitServiceFactory } from "@app/services/folder-commit/folder-commit-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMicrosoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import { TProjectMicrosoftTeamsConfigDALFactory } from "@app/services/microsoft-teams/project-microsoft-teams-config-dal";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { TSecretDALFactory } from "@app/services/secret/secret-dal";
import {
  decryptSecretWithBot,
  fnSecretBlindIndexCheck,
  fnSecretBlindIndexCheckV2,
  fnSecretBulkDelete,
  fnSecretBulkInsert,
  fnSecretBulkUpdate,
  getAllNestedSecretReferences,
  INFISICAL_SECRET_VALUE_HIDDEN_MASK
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
  getAllSecretReferences as getAllSecretReferencesV2Bridge
} from "@app/services/secret-v2-bridge/secret-v2-bridge-fns";
import { TSecretVersionV2DALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "@app/services/secret-v2-bridge/secret-version-tag-dal";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import {
  hasSecretReadValueOrDescribePermission,
  throwIfMissingSecretReadValueOrDescribePermission
} from "../permission/permission-fns";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSecretApprovalRequestActions,
  ProjectPermissionSub
} from "../permission/project-permission";
import { ProjectEvents, TProjectEventPayload } from "../project-events/project-events-types";
import { TSecretApprovalPolicyDALFactory } from "../secret-approval-policy/secret-approval-policy-dal";
import { scanSecretPolicyViolations } from "../secret-scanning-v2/secret-scanning-v2-fns";
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
    | "findManyTagsById"
    | "saveTagsToSecret"
    | "deleteTagsManySecret"
    | "saveTagsToSecretV2"
    | "deleteTagsToSecretV2"
    | "find"
  >;
  secretBlindIndexDAL: Pick<TSecretBlindIndexDALFactory, "findOne">;
  snapshotService: Pick<TSecretSnapshotServiceFactory, "performSnapshot">;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "findLatestVersionMany" | "insertMany">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
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
    | "insertMany"
    | "upsertSecretReferences"
    | "findBySecretKeys"
    | "bulkUpdate"
    | "deleteMany"
    | "find"
    | "invalidateSecretCacheByProjectId"
  >;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionMany">;
  secretVersionTagV2BridgeDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  secretApprovalPolicyDAL: Pick<TSecretApprovalPolicyDALFactory, "findById">;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  projectMicrosoftTeamsConfigDAL: Pick<TProjectMicrosoftTeamsConfigDALFactory, "getIntegrationDetailsByProject">;
  microsoftTeamsService: Pick<TMicrosoftTeamsServiceFactory, "sendNotification">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
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
  projectSlackConfigDAL,
  resourceMetadataDAL,
  projectMicrosoftTeamsConfigDAL,
  microsoftTeamsService,
  folderCommitService,
  notificationService
}: TSecretApprovalRequestServiceFactoryDep) => {
  const requestCount = async ({
    projectId,
    policyId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TApprovalRequestCountDTO) => {
    if (actor === ActorType.SERVICE) throw new BadRequestError({ message: "Cannot use service token" });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    // Check if user has Read permission to list all requests
    const canReadAllApprovalRequests = permission.can(
      ProjectPermissionSecretApprovalRequestActions.Read,
      ProjectPermissionSub.SecretApprovalRequest
    );

    // If user has the permission, count all requests; otherwise count only their requests
    const userIdFilter = canReadAllApprovalRequests ? undefined : actorId;

    const count = await secretApprovalRequestDAL.findProjectRequestCount(projectId, userIdFilter, policyId);
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
    offset,
    search
  }: TListApprovalsDTO) => {
    if (actor === ActorType.SERVICE) throw new BadRequestError({ message: "Cannot use service token" });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    // Check if user has Read permission to list all requests
    const canReadAllApprovalRequests = permission.can(
      ProjectPermissionSecretApprovalRequestActions.Read,
      ProjectPermissionSub.SecretApprovalRequest
    );

    // If user has the permission, don't filter by userId (they see all requests)
    // Otherwise, filter to only show requests where they are committer or approver
    const userIdFilter = canReadAllApprovalRequests ? undefined : actorId;

    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);

    if (shouldUseSecretV2Bridge) {
      return secretApprovalRequestDAL.findByProjectIdBridgeSecretV2({
        projectId,
        committer,
        environment,
        status,
        userId: userIdFilter,
        limit,
        offset,
        search
      });
    }

    return secretApprovalRequestDAL.findByProjectId({
      projectId,
      committer,
      environment,
      status,
      userId: userIdFilter,
      limit,
      offset,
      search
    });
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

    if (!secretApprovalRequest)
      throw new NotFoundError({ message: `Secret approval request with ID '${id}' not found` });

    const { projectId } = secretApprovalRequest;
    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);

    const { policy } = secretApprovalRequest;
    const { hasRole, permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    // Check if user has the SecretApprovalRequest.Read permission
    // Secret values are controlled by underlying secret.ReadValue permissions
    const canReadApprovalRequests = permission.can(
      ProjectPermissionSecretApprovalRequestActions.Read,
      ProjectPermissionSub.SecretApprovalRequest
    );

    // User can view details if they have Read permission, are admin, committer, or approver
    if (
      !canReadApprovalRequests &&
      !hasRole(ProjectMembershipRole.Admin) &&
      secretApprovalRequest.committerUserId !== actorId &&
      !policy.approvers.find(({ userId }) => userId === actorId)
    ) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
    }
    const getHasSecretReadAccess = (environment: string, tags: { slug: string }[], secretPath?: string) => {
      const isReviewer = policy.approvers.some(({ userId }) => userId === actorId);

      if (!isReviewer) {
        const canRead = hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
          environment,
          secretPath: secretPath || "/",
          secretTags: tags.map((i) => i.slug)
        });
        return canRead;
      }

      return true;
    };

    let secrets;
    const secretPath = await folderDAL.findSecretPathByFolderIds(secretApprovalRequest.projectId, [
      secretApprovalRequest.folderId
    ]);
    if (shouldUseSecretV2Bridge) {
      const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      const encryptedSecrets = await secretApprovalRequestSecretDAL.findByRequestIdBridgeSecretV2(
        secretApprovalRequest.id
      );
      secrets = encryptedSecrets.map((el) => ({
        ...el,
        secretKey: el.key,
        id: el.id,
        version: el.version,
        secretMetadata: (
          el.secretMetadata as { key: string; value?: string | null; encryptedValue?: string | null }[] | null
        )?.map((meta) => ({
          key: meta.key,
          isEncrypted: Boolean(meta.encryptedValue),
          value: meta.encryptedValue
            ? secretManagerDecryptor({ cipherTextBlob: Buffer.from(meta.encryptedValue, "base64") }).toString()
            : meta.value || ""
        })),
        isRotatedSecret: el.secret?.isRotatedSecret ?? false,
        secretValueHidden: !getHasSecretReadAccess(secretApprovalRequest.environment, el.tags, secretPath?.[0]?.path),
        secretValue: !getHasSecretReadAccess(secretApprovalRequest.environment, el.tags, secretPath?.[0]?.path)
          ? INFISICAL_SECRET_VALUE_HIDDEN_MASK
          : el.secret && el.secret.isRotatedSecret
            ? undefined
            : el.encryptedValue !== undefined && el.encryptedValue !== null
              ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString()
              : undefined,
        secretComment:
          el.encryptedComment !== undefined && el.encryptedComment !== null
            ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString()
            : undefined,
        skipMultilineEncoding:
          el.skipMultilineEncoding !== undefined && el.skipMultilineEncoding !== null
            ? el.skipMultilineEncoding
            : undefined,
        secret: el.secret
          ? {
              secretKey: el.secret.key,
              id: el.secret.id,
              version: el.secret.version,
              secretValueHidden: !getHasSecretReadAccess(
                secretApprovalRequest.environment,
                el.tags,
                secretPath?.[0]?.path
              ),
              secretValue: !getHasSecretReadAccess(secretApprovalRequest.environment, el.tags, secretPath?.[0]?.path)
                ? INFISICAL_SECRET_VALUE_HIDDEN_MASK
                : el.secret.encryptedValue
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
              secretValueHidden: !getHasSecretReadAccess(
                secretApprovalRequest.environment,
                el.tags,
                secretPath?.[0]?.path
              ),
              secretValue: !getHasSecretReadAccess(secretApprovalRequest.environment, el.tags, secretPath?.[0]?.path)
                ? INFISICAL_SECRET_VALUE_HIDDEN_MASK
                : el.secretVersion.encryptedValue
                  ? secretManagerDecryptor({ cipherTextBlob: el.secretVersion.encryptedValue }).toString()
                  : "",
              secretComment: el.secretVersion.encryptedComment
                ? secretManagerDecryptor({ cipherTextBlob: el.secretVersion.encryptedComment }).toString()
                : "",
              tags: el.secretVersion.tags,
              secretMetadata: el.oldSecretMetadata?.map((meta) => ({
                key: meta.key,
                isEncrypted: Boolean(meta.encryptedValue),
                value: meta.encryptedValue
                  ? secretManagerDecryptor({ cipherTextBlob: Buffer.from(meta.encryptedValue) }).toString()
                  : meta.value || ""
              })),
              skipMultilineEncoding: el.secretVersion.skipMultilineEncoding
            }
          : undefined
      }));
    } else {
      if (!botKey) throw new NotFoundError({ message: `Project bot key not found`, name: "BotKeyNotFound" }); // CLI depends on this error message. TODO(daniel): Make API check for name BotKeyNotFound instead of message
      const encryptedSecrets = await secretApprovalRequestSecretDAL.findByRequestId(secretApprovalRequest.id);
      secrets = encryptedSecrets.map((el) => ({
        ...el,
        secretValueHidden: !getHasSecretReadAccess(secretApprovalRequest.environment, el.tags, secretPath?.[0]?.path),
        ...decryptSecretWithBot(el, botKey),
        secret: el.secret
          ? {
              id: el.secret.id,
              version: el.secret.version,
              secretValueHidden: false,
              ...decryptSecretWithBot(el.secret, botKey)
            }
          : undefined,
        secretVersion: el.secretVersion
          ? {
              id: el.secretVersion.id,
              version: el.secretVersion.version,
              secretValueHidden: false,
              ...decryptSecretWithBot(el.secretVersion, botKey)
            }
          : undefined
      }));
    }

    return { ...secretApprovalRequest, secretPath: secretPath?.[0]?.path || "/", commits: secrets };
  };

  const reviewApproval = async ({
    approvalId,
    actor,
    status,
    comment,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TReviewRequestDTO) => {
    const secretApprovalRequest = await secretApprovalRequestDAL.findById(approvalId);
    if (!secretApprovalRequest) {
      throw new NotFoundError({ message: `Secret approval request with ID '${approvalId}' not found` });
    }
    if (actor !== ActorType.USER) throw new BadRequestError({ message: "Must be a user" });

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message:
          "Failed to review secret approval request due to plan restriction. Upgrade plan to review secret approval request."
      });
    }

    const { policy } = secretApprovalRequest;
    if (policy.deletedAt) {
      throw new BadRequestError({
        message: "The policy associated with this secret approval request has been deleted."
      });
    }
    if (!policy.allowedSelfApprovals && actorId === secretApprovalRequest.committerUserId) {
      throw new BadRequestError({
        message: "Failed to review secret approval request. Users are not authorized to review their own request."
      });
    }

    const { hasRole } = await permissionService.getProjectPermission({
      actor: ActorType.USER,
      actorId,
      projectId: secretApprovalRequest.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    if (
      !hasRole(ProjectMembershipRole.Admin) &&
      secretApprovalRequest.committerUserId !== actorId &&
      !policy.approvers.find(({ userId }) => userId === actorId)
    ) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
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
            comment,
            requestId: secretApprovalRequest.id,
            reviewerUserId: actorId
          },
          tx
        );
      }

      return secretApprovalRequestReviewerDAL.updateById(review.id, { status, comment }, tx);
    });

    return { ...reviewStatus, projectId: secretApprovalRequest.projectId };
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
    if (!secretApprovalRequest) {
      throw new NotFoundError({ message: `Secret approval request with ID '${approvalId}' not found` });
    }
    if (actor !== ActorType.USER) throw new BadRequestError({ message: "Must be a user" });

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message:
          "Failed to update secret approval request due to plan restriction. Upgrade plan to update secret approval request."
      });
    }

    const { policy } = secretApprovalRequest;
    if (policy.deletedAt) {
      throw new BadRequestError({
        message: "The policy associated with this secret approval request has been deleted."
      });
    }

    const { hasRole } = await permissionService.getProjectPermission({
      actor: ActorType.USER,
      actorId,
      projectId: secretApprovalRequest.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    if (
      !hasRole(ProjectMembershipRole.Admin) &&
      secretApprovalRequest.committerUserId !== actorId &&
      !policy.approvers.find(({ userId }) => userId === actorId)
    ) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
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
    if (!secretApprovalRequest)
      throw new NotFoundError({ message: `Secret approval request with ID '${approvalId}' not found` });
    if (actor !== ActorType.USER) throw new BadRequestError({ message: "Must be a user" });

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message:
          "Failed to merge secret approval request due to plan restriction. Upgrade plan to merge secret approval request."
      });
    }

    const { policy, folderId, projectId, bypassers, environment } = secretApprovalRequest;
    if (policy.deletedAt) {
      throw new BadRequestError({
        message: "The policy associated with this secret approval request has been deleted."
      });
    }
    if (!policy.envId) {
      throw new BadRequestError({
        message: "The policy associated with this secret approval request is not linked to the environment."
      });
    }

    const { hasRole } = await permissionService.getProjectPermission({
      actor: ActorType.USER,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    if (
      !hasRole(ProjectMembershipRole.Admin) &&
      secretApprovalRequest.committerUserId !== actorId &&
      !policy.approvers.find(({ userId }) => userId === actorId)
    ) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
    }
    const reviewers = secretApprovalRequest.reviewers.reduce<Record<string, ApprovalStatus>>(
      (prev, curr) => ({ ...prev, [curr.userId.toString()]: curr.status as ApprovalStatus }),
      {}
    );
    const hasMinApproval =
      secretApprovalRequest.policy.approvals <=
      secretApprovalRequest.policy.approvers.filter(({ userId: approverId }) =>
        approverId ? reviewers[approverId] === ApprovalStatus.APPROVED : false
      ).length;
    const isSoftEnforcement = secretApprovalRequest.policy.enforcementLevel === EnforcementLevel.Soft;
    const canBypass = !bypassers.length || bypassers.some((bypasser) => bypasser.userId === actorId);

    if (!hasMinApproval && !(isSoftEnforcement && canBypass))
      throw new BadRequestError({ message: "Doesn't have minimum approvals needed" });

    const { botKey, shouldUseSecretV2Bridge, project } = await projectBotService.getBotKey(projectId);
    let mergeStatus;
    if (shouldUseSecretV2Bridge) {
      // this cycle if for bridged secrets
      const secretApprovalSecrets = await secretApprovalRequestSecretDAL.findByRequestIdBridgeSecretV2(
        secretApprovalRequest.id
      );
      if (!secretApprovalSecrets) {
        throw new NotFoundError({ message: `No secrets found in secret change request with ID '${approvalId}'` });
      }

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
              actor: {
                actorId,
                type: actor
              },
              orgId: actorOrgId,
              inputSecrets: secretCreationCommits.map((el) => ({
                tagIds: el?.tags.map(({ id }) => id),
                version: 1,
                encryptedComment: el.encryptedComment,
                encryptedValue: el.encryptedValue,
                skipMultilineEncoding: el.skipMultilineEncoding,
                key: el.key,
                secretMetadata: (
                  el.secretMetadata as { key: string; value?: string | null; encryptedValue?: string | null }[]
                )?.map((meta) => ({
                  key: meta.key,
                  [meta.encryptedValue ? "encryptedValue" : "value"]: meta.encryptedValue
                    ? Buffer.from(meta.encryptedValue, "base64")
                    : meta.value || ""
                })),
                references: el.encryptedValue
                  ? getAllSecretReferencesV2Bridge(
                      secretManagerDecryptor({
                        cipherTextBlob: el.encryptedValue
                      }).toString()
                    ).nestedReferences
                  : [],
                type: SecretType.Shared
              })),
              resourceMetadataDAL,
              secretDAL: secretV2BridgeDAL,
              secretVersionDAL: secretVersionV2BridgeDAL,
              secretTagDAL,
              secretVersionTagDAL: secretVersionTagV2BridgeDAL,
              folderCommitService
            })
          : [];
        const updatedSecrets = secretUpdationCommits.length
          ? await fnSecretV2BridgeBulkUpdate({
              folderId,
              orgId: actorOrgId,
              actor: {
                actorId,
                type: actor
              },
              tx,
              inputSecrets: secretUpdationCommits.map((el) => {
                const encryptedValue =
                  !el.secret?.isRotatedSecret && el.encryptedValue !== null && el.encryptedValue !== undefined
                    ? {
                        encryptedValue: el.encryptedValue,
                        references: el.encryptedValue
                          ? getAllSecretReferencesV2Bridge(
                              secretManagerDecryptor({
                                cipherTextBlob: el.encryptedValue
                              }).toString()
                            ).nestedReferences
                          : []
                      }
                    : {};
                return {
                  filter: { id: el.secretId as string, type: SecretType.Shared },
                  data: {
                    reminderRepeatDays: el.reminderRepeatDays,
                    encryptedComment: el.encryptedComment !== null ? el.encryptedComment : undefined,
                    reminderNote: el.reminderNote,
                    skipMultilineEncoding: el.skipMultilineEncoding !== null ? el.skipMultilineEncoding : undefined,
                    key: el.key,
                    tags: el?.tags.map(({ id }) => id),
                    secretMetadata: (
                      el.secretMetadata as { key: string; value?: string | null; encryptedValue?: string | null }[]
                    )?.map((meta) => ({
                      key: meta.key,
                      [meta.encryptedValue ? "encryptedValue" : "value"]: meta.encryptedValue
                        ? Buffer.from(meta.encryptedValue, "base64")
                        : meta.value || ""
                    })),
                    ...encryptedValue
                  }
                };
              }),
              secretDAL: secretV2BridgeDAL,
              secretVersionDAL: secretVersionV2BridgeDAL,
              secretTagDAL,
              secretVersionTagDAL: secretVersionTagV2BridgeDAL,
              resourceMetadataDAL,
              folderCommitService
            })
          : [];
        const deletedSecret = secretDeletionCommits.length
          ? await fnSecretV2BridgeBulkDelete({
              projectId,
              folderId,
              tx,
              actorId,
              actorType: actor,
              secretDAL: secretV2BridgeDAL,
              secretQueueService,
              inputSecrets: secretDeletionCommits.map(({ key }) => ({ secretKey: key, type: SecretType.Shared })),
              folderCommitService,
              secretVersionDAL: secretVersionV2BridgeDAL
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
        await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId, tx);
        return {
          secrets: { created: newSecrets, updated: updatedSecrets, deleted: deletedSecret },
          approval: updatedSecretApproval
        };
      });
    } else {
      const secretApprovalSecrets = await secretApprovalRequestSecretDAL.findByRequestId(secretApprovalRequest.id);
      if (!secretApprovalSecrets) {
        throw new NotFoundError({ message: `No secrets found in secret change request with ID '${approvalId}'` });
      }

      const conflicts: Array<{ secretId: string; op: SecretOperations }> = [];
      let secretCreationCommits = secretApprovalSecrets.filter(({ op }) => op === SecretOperations.Create);
      if (secretCreationCommits.length) {
        const { secsGroupedByBlindIndex: conflictGroupByBlindIndex } = await fnSecretBlindIndexCheckV2({
          folderId,
          secretDAL,
          inputSecrets: secretCreationCommits.map(({ secretBlindIndex, secret }) => {
            if (!secretBlindIndex) {
              throw new NotFoundError({
                message: `Secret blind index not found on secret with ID '${secret.id}`
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
            .map(({ secretBlindIndex, secret }) => {
              if (!secretBlindIndex) {
                throw new NotFoundError({
                  message: `Secret blind index not found on secret with ID '${secret.id}`
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
                      crypto.encryption().symmetric().decrypt({
                        ciphertext: el.secretValueCiphertext,
                        iv: el.secretValueIV,
                        tag: el.secretValueTag,
                        key: botKey,
                        keySize: SymmetricKeySize.Bits128
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
                        crypto.encryption().symmetric().decrypt({
                          ciphertext: el.secretValueCiphertext,
                          iv: el.secretValueIV,
                          tag: el.secretValueTag,
                          key: botKey,
                          keySize: SymmetricKeySize.Bits128
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
              inputSecrets: secretDeletionCommits.map(({ secretBlindIndex, secret }) => {
                if (!secretBlindIndex) {
                  throw new NotFoundError({
                    message: `Secret blind index not found on secret with ID '${secret.id}`
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
        await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId, tx);
        return {
          secrets: { created: newSecrets, updated: updatedSecrets, deleted: deletedSecret },
          approval: updatedSecretApproval
        };
      });
    }

    await snapshotService.performSnapshot(folderId);
    const [folder] = await folderDAL.findSecretPathByFolderIds(projectId, [folderId]);
    if (!folder) {
      throw new NotFoundError({ message: `Folder with ID '${folderId}' not found in project with ID '${projectId}'` });
    }

    const { secrets } = mergeStatus;
    const events: TProjectEventPayload[] = [];
    if (secrets.created.length > 0) {
      events.push({
        type: ProjectEvents.SecretCreate,
        projectId,
        environment: folder.environmentSlug,
        secretPath: folder.path,
        // @ts-expect-error - not present on V1 secrets
        secretKeys: secrets.created.map((el) => el.key as string)
      });
    }

    if (secrets.updated.length > 0) {
      events.push({
        type: ProjectEvents.SecretUpdate,
        projectId,
        environment: folder.environmentSlug,
        secretPath: folder.path,
        // @ts-expect-error - not present on V1 secrets
        secretKeys: secrets.updated.map((el) => el.key as string)
      });
    }

    if (secrets.deleted.length > 0) {
      events.push({
        type: ProjectEvents.SecretDelete,
        projectId,
        environment: folder.environmentSlug,
        secretPath: folder.path,
        // @ts-expect-error - not present on V1 secrets
        secretKeys: secrets.deleted.map((el) => el.key as string)
      });
    }

    await secretQueueService.syncSecrets({
      projectId,
      orgId: actorOrgId,
      secretPath: folder.path,
      environmentSlug: folder.environmentSlug,
      actorId,
      actor,
      events
    });

    if (isSoftEnforcement) {
      const cfg = getConfig();
      const env = await projectEnvDAL.findOne({ id: policy.envId });
      const requestedByUser = await userDAL.findOne({ id: actorId });
      const approverUsers = await userDAL.find({
        $in: {
          id: policy.approvers.map((approver: { userId: string | null | undefined }) => approver.userId!)
        }
      });

      await notificationService.createUserNotifications(
        approverUsers.map((approver) => ({
          userId: approver.id,
          orgId: project.orgId,
          type: NotificationType.SECRET_CHANGE_POLICY_BYPASSED,
          title: "Secret Change Policy Bypassed",
          body: `**${requestedByUser.firstName} ${requestedByUser.lastName}** (${requestedByUser.email}) has merged a secret to **${policy.secretPath}** in the **${env.name}** environment for project **${project.name}** without obtaining the required approval.`,
          link: `/projects/secret-management/${project.id}/approval`
        }))
      );

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
          approvalUrl: `${cfg.SITE_URL}/organizations/${project.orgId}/projects/secret-management/${project.id}/approval`
        },
        template: SmtpTemplates.AccessSecretRequestBypassed
      });
    }

    const { created, updated, deleted } = mergeStatus.secrets;

    const secretMutationEvents: Event[] = [];

    if (created.length) {
      if (created.length > 1) {
        secretMutationEvents.push({
          type: EventType.CREATE_SECRETS,
          metadata: {
            environment,
            secretPath: folder.path,
            secrets: created.map((secret) => ({
              secretId: secret.id,
              secretVersion: 1,
              // @ts-expect-error not present on v1 secrets
              secretKey: secret.key as string,
              // @ts-expect-error not present on v1 secrets
              secretMetadata: (secret.secretMetadata as { key: string; encryptedValue: string; value: string }[])?.map(
                (meta) => ({
                  key: meta.key,
                  isEncrypted: Boolean(meta.encryptedValue),
                  value: meta.encryptedValue ? AUDIT_LOG_SENSITIVE_VALUE : meta.value || ""
                })
              ),
              // @ts-expect-error not present on v1 secrets
              secretTags: (secret.tags as { name: string }[])?.map((tag) => tag.name)
            }))
          }
        });
      } else {
        const [secret] = created;
        secretMutationEvents.push({
          type: EventType.CREATE_SECRET,
          metadata: {
            environment,
            secretPath: folder.path,
            secretId: secret.id,
            secretVersion: 1,
            // @ts-expect-error not present on v1 secrets
            secretKey: secret.key as string,
            // @ts-expect-error not present on v1 secrets
            secretMetadata: (secret.secretMetadata as { key: string; encryptedValue: string; value: string }[])?.map(
              (meta) => ({
                key: meta.key,
                isEncrypted: Boolean(meta.encryptedValue),
                value: meta.encryptedValue ? AUDIT_LOG_SENSITIVE_VALUE : meta.value || ""
              })
            ),
            // @ts-expect-error not present on v1 secrets
            secretTags: (secret.tags as { name: string }[])?.map((tag) => tag.name)
          }
        });
      }
    }

    if (updated.length) {
      if (updated.length > 1) {
        secretMutationEvents.push({
          type: EventType.UPDATE_SECRETS,
          metadata: {
            environment,
            secretPath: folder.path,
            secrets: updated.map((secret) => ({
              secretId: secret.id,
              secretVersion: secret.version,
              // @ts-expect-error not present on v1 secrets
              secretKey: secret.key as string,
              // @ts-expect-error not present on v1 secrets
              secretMetadata: (secret.secretMetadata as { key: string; encryptedValue: string; value: string }[])?.map(
                (meta) => ({
                  key: meta.key,
                  isEncrypted: Boolean(meta.encryptedValue),
                  value: meta.encryptedValue ? AUDIT_LOG_SENSITIVE_VALUE : meta.value || ""
                })
              ),
              // @ts-expect-error not present on v1 secrets
              secretTags: (secret.tags as { name: string }[])?.map((tag) => tag.name)
            }))
          }
        });
      } else {
        const [secret] = updated;
        secretMutationEvents.push({
          type: EventType.UPDATE_SECRET,
          metadata: {
            environment,
            secretPath: folder.path,
            secretId: secret.id,
            secretVersion: secret.version,
            // @ts-expect-error not present on v1 secrets
            secretKey: secret.key as string,
            // @ts-expect-error not present on v1 secrets
            secretMetadata: (secret.secretMetadata as { key: string; encryptedValue: string; value: string }[])?.map(
              (meta) => ({
                key: meta.key,
                isEncrypted: Boolean(meta.encryptedValue),
                value: meta.encryptedValue ? AUDIT_LOG_SENSITIVE_VALUE : meta.value || ""
              })
            ),
            // @ts-expect-error not present on v1 secrets
            secretTags: (secret.tags as { name: string }[])?.map((tag) => tag.name)
          }
        });
      }
    }

    if (deleted.length) {
      if (deleted.length > 1) {
        secretMutationEvents.push({
          type: EventType.DELETE_SECRETS,
          metadata: {
            environment,
            secretPath: folder.path,
            secrets: deleted.map((secret) => ({
              secretId: secret.id,
              secretVersion: secret.version,
              // @ts-expect-error not present on v1 secrets
              secretKey: secret.key as string
            }))
          }
        });
      } else {
        const [secret] = deleted;
        secretMutationEvents.push({
          type: EventType.DELETE_SECRET,
          metadata: {
            environment,
            secretPath: folder.path,
            secretId: secret.id,
            secretVersion: secret.version,
            // @ts-expect-error not present on v1 secrets
            secretKey: secret.key as string
          }
        });
      }
    }

    return { ...mergeStatus, projectId, secretMutationEvents };
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

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
      environment,
      secretPath
    });

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: `Folder not found for environment with slug '${environment}' & secret path '${secretPath}'`,
        name: "GenSecretApproval"
      });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg) {
      throw new NotFoundError({
        message: `Blind index not found for project with ID '${projectId}'`,
        name: "Update secret"
      });
    }
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
        if (!i.secretBlindIndex) {
          throw new NotFoundError({ message: `Secret blind index not found for secret with ID '${i.id}'` });
        }
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
            throw new NotFoundError({ message: `Secret blind index not found for secret with ID '${secretId}'` });
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
    if (tagIds.length !== tags.length) throw new NotFoundError({ message: "One or more tags not found" });

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
          throw new NotFoundError({ message: `Secret blind index not found for secret with ID '${i.id}'` });
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
    const user = await userDAL.findById(actorId);

    const projectPath = `/organizations/${actorOrgId}/projects/secret-management/${projectId}`;
    const approvalPath = `${projectPath}/approval`;
    const cfg = getConfig();
    const approvalUrl = `${cfg.SITE_URL}${approvalPath}`;

    await triggerWorkflowIntegrationNotification({
      input: {
        projectId,
        notification: {
          type: TriggerFeature.SECRET_APPROVAL,
          payload: {
            userEmail: user.email as string,
            environment: env.name,
            secretPath,
            projectId,
            requestId: secretApprovalRequest.id,
            secretKeys: [...new Set(Object.values(data).flatMap((arr) => arr?.map((item) => item.secretName) ?? []))],
            approvalUrl
          }
        }
      },
      dependencies: {
        projectDAL,
        projectSlackConfigDAL,
        kmsService,
        projectMicrosoftTeamsConfigDAL,
        microsoftTeamsService
      }
    });

    await sendApprovalEmailsFn({
      projectDAL,
      secretApprovalPolicyDAL,
      secretApprovalRequest,
      smtpService,
      projectId,
      notificationService
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
    environment,
    trx: providedTx
  }: TGenerateSecretApprovalRequestV2BridgeDTO & { trx?: Knex }) => {
    if (actor === ActorType.SERVICE || actor === ActorType.IDENTITY)
      throw new BadRequestError({ message: "Cannot use service token or machine token over protected branches" });

    const { permission, hasProjectEnforcement } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: `Folder not found for the environment slug '${environment}' & secret path '${secretPath}'`,
        name: "GenSecretApproval"
      });
    const folderId = folder.id;

    if (hasProjectEnforcement("enforceEncryptedSecretManagerSecretMetadata")) {
      const hasMissingEncryptedMetadataInCreate = data[SecretOperations.Create]?.some((secret) =>
        secret.secretMetadata?.some((meta) => !meta.isEncrypted)
      );
      const hasMissingEncryptedMetadataInUpdate = data[SecretOperations.Update]?.some((secret) =>
        secret.secretMetadata?.some((meta) => !meta.isEncrypted)
      );

      if (hasMissingEncryptedMetadataInCreate || hasMissingEncryptedMetadataInUpdate) {
        throw new BadRequestError({
          message:
            "One or more secrets has non-encrypted metadata values. Project requires all metadata to be encrypted."
        });
      }
    }

    const commits: Omit<TSecretApprovalRequestsSecretsV2Insert, "requestId">[] = [];
    const commitTagIds: Record<string, string[]> = {};
    const existingTagIds: Record<string, string[]> = {};

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const project = await projectDAL.findById(projectId);
    await scanSecretPolicyViolations(
      projectId,
      secretPath,
      [
        ...(data[SecretOperations.Create] || []),
        ...(data[SecretOperations.Update] || []).filter((el) => el.secretValue)
      ].map((el) => ({
        secretKey: el.secretKey,
        secretValue: el.secretValue as string
      })),
      project.secretDetectionIgnoreValues || []
    );

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
        throw new BadRequestError({ message: `Secret already exists: ${secrets.map((el) => el.key).join(",")}` });

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
          secretMetadata: JSON.stringify(
            (createdSecret.secretMetadata || [])?.map((meta) => ({
              key: meta.key,
              [meta.isEncrypted ? "encryptedValue" : "value"]: meta.isEncrypted
                ? secretManagerEncryptor({ plainText: Buffer.from(meta.value) }).cipherTextBlob.toString("base64")
                : meta.value
            }))
          ),
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

      secretsToUpdateStoredInDB.forEach((el) => {
        if (el.tags?.length) existingTagIds[el.key] = el.tags.map((i) => i.id);
      });

      if (secretsToUpdateStoredInDB.length !== secretsToUpdate.length)
        throw new NotFoundError({
          message: `Secret does not exist: ${secretsToUpdateStoredInDB.map((el) => el.key).join(",")}`
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

        if (secrets.length !== secretsWithNewName.length)
          throw new NotFoundError({
            message: `Secret does not exist: ${secrets.map((el) => el.key).join(",")}`
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
            skipMultilineEncoding,
            secretMetadata
          }) => {
            const secretId = updatingSecretsGroupByKey[secretKey][0].id;
            if (tagIds?.length || existingTagIds[secretKey]?.length) {
              commitTagIds[newSecretName ?? secretKey] = tagIds || existingTagIds[secretKey];
            }

            const { metadata, ...el } = latestSecretVersions[secretId];
            return {
              ...el,
              secretMetadata: JSON.stringify(
                (secretMetadata || [])?.map((meta) => ({
                  key: meta.key,
                  [meta.isEncrypted ? "encryptedValue" : "value"]: meta.isEncrypted
                    ? secretManagerEncryptor({ plainText: Buffer.from(meta.value) }).cipherTextBlob.toString("base64")
                    : meta.value
                }))
              ),
              key: newSecretName || secretKey,
              encryptedComment: setKnexStringValue(
                secretComment,
                (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob,
                true // scott: we need to encrypt empty string on update to differentiate not updating comment vs clearing comment
              ),
              encryptedValue: setKnexStringValue(
                secretValue,
                (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob,
                true // scott: we need to encrypt empty string on update to differentiate not updating value vs clearing value
              ),
              reminderRepeatDays,
              reminderNote,
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
      const secretsToDeleteInDB = await secretV2BridgeDAL.find({
        folderId,
        $complex: {
          operator: "and",
          value: [
            {
              operator: "or",
              value: deletedSecrets.map((el) => ({
                operator: "and",
                value: [
                  {
                    operator: "eq",
                    field: `${TableName.SecretV2}.key` as "key",
                    value: el.secretKey
                  },
                  {
                    operator: "eq",
                    field: "type",
                    value: SecretType.Shared
                  }
                ]
              }))
            }
          ]
        }
      });
      if (secretsToDeleteInDB.length !== deletedSecrets.length)
        throw new NotFoundError({
          message: `Secret does not exist: ${secretsToDeleteInDB.map((el) => el.key).join(",")}`
        });
      secretsToDeleteInDB.forEach((el) => {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionSecretActions.Delete,
          subject(ProjectPermissionSub.Secrets, {
            environment,
            secretPath,
            secretName: el.key,
            secretTags: el.tags?.map((i) => i.slug)
          })
        );
      });

      const secretsGroupedByKey = groupBy(secretsToDeleteInDB, (i) => i.key);
      const deletedSecretIds = deletedSecrets.map((el) => secretsGroupedByKey[el.secretKey][0].id);
      const latestSecretVersions = await secretVersionV2BridgeDAL.findLatestVersionMany(folderId, deletedSecretIds);
      commits.push(
        ...deletedSecrets.map(({ secretKey }) => {
          const secretId = secretsGroupedByKey[secretKey][0].id;
          const { metadata, ...el } = latestSecretVersions[secretId];
          return {
            op: SecretOperations.Delete as const,
            ...el,
            secretMetadata: JSON.stringify(metadata || []),
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
    if (tagIds.length !== tags.length) throw new NotFoundError({ message: "Tag not found" });
    const tagsGroupById = groupBy(tags, (i) => i.id);

    commits.forEach((commit) => {
      let action = ProjectPermissionSecretActions.Create;
      if (commit.op === SecretOperations.Update) action = ProjectPermissionSecretActions.Edit;
      if (commit.op === SecretOperations.Delete) return; // we do the validation on top

      ForbiddenError.from(permission).throwUnlessCan(
        action,
        subject(ProjectPermissionSub.Secrets, {
          environment,
          secretPath,
          secretName: commit.key,
          secretTags: commitTagIds?.[commit.key]?.map((secretTagId) => tagsGroupById[secretTagId][0].slug)
        })
      );
    });

    const executeApprovalRequestCreation = async (tx: Knex) => {
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
            secretVersion,
            secretMetadata
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
            key,
            secretMetadata
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
    };

    const secretApprovalRequest = providedTx
      ? await executeApprovalRequestCreation(providedTx)
      : await secretApprovalRequestDAL.transaction(executeApprovalRequestCreation);

    const user = await userDAL.findById(actorId);
    const env = await projectEnvDAL.findOne({ id: policy.envId });

    const projectPath = `/organizations/${actorOrgId}/projects/secret-management/${project.id}`;
    const approvalPath = `${projectPath}/approval`;
    const cfg = getConfig();
    const approvalUrl = `${cfg.SITE_URL}${approvalPath}`;

    await triggerWorkflowIntegrationNotification({
      input: {
        projectId,
        notification: {
          type: TriggerFeature.SECRET_APPROVAL,
          payload: {
            userEmail: user.email as string,
            environment: env.name,
            secretPath,
            projectId,
            requestId: secretApprovalRequest.id,
            secretKeys: [...new Set(Object.values(data).flatMap((arr) => arr?.map((item) => item.secretKey) ?? []))],
            approvalUrl
          }
        }
      },
      dependencies: {
        projectDAL,
        kmsService,
        projectSlackConfigDAL,
        microsoftTeamsService,
        projectMicrosoftTeamsConfigDAL
      }
    });

    await sendApprovalEmailsFn({
      projectDAL,
      secretApprovalPolicyDAL,
      secretApprovalRequest,
      smtpService,
      projectId,
      notificationService
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
