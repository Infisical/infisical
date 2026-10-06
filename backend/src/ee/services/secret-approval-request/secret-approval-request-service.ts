/* eslint-disable no-nested-ternary */
import { Knex } from "knex";

import {
  ActionProjectType,
  ProjectMembershipRole,
  SecretEncryptionAlgo,
  SecretKeyEncoding,
  SecretType,
  TSecretApprovalRequestsSecretsInsert
} from "@app/db/schemas";
import { Event, EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AUDIT_LOG_SENSITIVE_VALUE } from "@app/lib/config/const";
import { getConfig } from "@app/lib/config/env";
import { crypto, SymmetricKeySize } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy, pick, unique } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { EnforcementLevel } from "@app/lib/types";
import { triggerWorkflowIntegrationNotification } from "@app/lib/workflow-integrations/trigger-notification";
import { TriggerFeature } from "@app/lib/workflow-integrations/types";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";
import { TFolderCommitServiceFactory } from "@app/services/folder-commit/folder-commit-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMicrosoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import { TProjectMicrosoftTeamsConfigDALFactory } from "@app/services/microsoft-teams/project-microsoft-teams-config-dal";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
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
import { TSecretVersionV2DALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "@app/services/secret-v2-bridge/secret-version-tag-dal";
import { TSecretValidationRuleServiceFactory } from "@app/services/secret-validation-rule/secret-validation-rule-service";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { ChangeRequestWebhookAction, TWebhookActor, WebhookEvents } from "@app/services/webhook/webhook-types";

import { TLicenseServiceFactory } from "../license/license-service";
import { throwIfMissingSecretReadValueOrDescribePermission } from "../permission/permission-fns";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSecretApprovalRequestActions,
  ProjectPermissionSub
} from "../permission/project-permission";
import { ProjectEvents, TProjectEventPayload } from "../project-events/project-events-types";
import { TSecretApprovalPolicyDALFactory } from "../secret-approval-policy/secret-approval-policy-dal";
import { getCommitterIds } from "../secret-approval-policy/secret-approval-policy-fns";
import { TSecretChangePolicyBridgeServiceFactory } from "../secret-change-policy-bridge/secret-change-policy-bridge-service";
import { TSecretChangeRequestBridgeServiceFactory } from "../secret-change-request-bridge/secret-change-request-bridge-service";
import { TSecretChangeRequestListItem } from "../secret-change-request-bridge/secret-change-request-bridge-types";
import { pickApprovalCommitColumns, secretApprovalRequestCommitFnsFactory } from "./secret-approval-request-commit-fns";
import { TSecretApprovalRequestDALFactory } from "./secret-approval-request-dal";
import {
  buildSecretApprovalCommitValueAccess,
  formatSecretApprovalCommitsV2Bridge
} from "./secret-approval-request-details-fns";
import { mergeSecretApprovalRequestPages, sendApprovalEmailsFn } from "./secret-approval-request-fns";
import { buildRequestedByActor, secretApprovalRequestMergeFnsFactory } from "./secret-approval-request-merge-fns";
import { TSecretApprovalRequestReviewerDALFactory } from "./secret-approval-request-reviewer-dal";
import { TSecretApprovalRequestSecretDALFactory } from "./secret-approval-request-secret-dal";
import {
  ApprovalStatus,
  RequestState,
  TApprovalRequestCountDTO,
  TCreateSecretApprovalSideEffectsDTO,
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
    | "updateById"
    | "findReferencedSecretReferencesBySecretKey"
    | "updateSecretReferenceSecretKey"
    | "updateSecretReferenceEnvAndPath"
    | "findOne"
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
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
  queueService: Pick<TQueueServiceFactory, "queue">;
  secretValidationRuleService: Pick<TSecretValidationRuleServiceFactory, "validateSecrets">;
  secretChangePolicyBridgeService: Pick<TSecretChangePolicyBridgeServiceFactory, "findSecretChangePolicy">;
  secretChangeRequestBridgeService: Pick<
    TSecretChangeRequestBridgeServiceFactory,
    | "findSecretChangeRequest"
    | "findFolderIdsWithOpenSecretChangeRequests"
    | "generateSecretChangeRequest"
    | "mergeSecretChangeRequest"
    | "reviewSecretChangeRequest"
    | "updateSecretChangeRequestStatus"
    | "getSecretChangeRequestById"
    | "listSecretChangeRequests"
    | "countSecretChangeRequests"
    | "createSecretChangeRequestSideEffects"
  >;
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
  notificationService,
  telemetryService,
  queueService,
  secretValidationRuleService,
  secretChangePolicyBridgeService,
  secretChangeRequestBridgeService
}: TSecretApprovalRequestServiceFactoryDep) => {
  const { buildSecretApprovalCommits, validateSecrets } = secretApprovalRequestCommitFnsFactory({
    permissionService,
    folderDAL,
    projectDAL,
    kmsService,
    secretV2BridgeDAL,
    secretVersionV2BridgeDAL,
    secretTagDAL,
    secretValidationRuleService
  });

  const { detectSecretApprovalCommitConflicts, applySecretApprovalCommitsV2Bridge, notifySecretApprovalBypass } =
    secretApprovalRequestMergeFnsFactory({
      folderDAL,
      secretV2BridgeDAL,
      secretVersionV2BridgeDAL,
      secretVersionTagV2BridgeDAL,
      secretTagDAL,
      resourceMetadataDAL,
      folderCommitService,
      secretQueueService,
      secretApprovalRequestSecretDAL,
      validateSecrets,
      userDAL,
      notificationService,
      smtpService
    });

  const $useSecretChangeRequestBridge = async (requestId: string, tx?: Knex) =>
    Boolean(await secretChangeRequestBridgeService.findSecretChangeRequest(requestId, tx));

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

    // Check if user has SecretApprovalRequest.Read permission to list all requests
    const canReadAllApprovalRequests = permission.can(
      ProjectPermissionSecretApprovalRequestActions.Read,
      ProjectPermissionSub.SecretApprovalRequest
    );

    // If user has the permission, count all requests; otherwise count only their requests
    const userIdFilter = canReadAllApprovalRequests ? undefined : actorId;

    const [legacyCount, secretChangeCount] = await Promise.all([
      secretApprovalRequestDAL.findProjectRequestCount(projectId, userIdFilter, policyId),
      secretChangeRequestBridgeService.countSecretChangeRequests({ projectId, userId: userIdFilter, policyId })
    ]);
    return {
      open: legacyCount.open + secretChangeCount.open,
      closed: legacyCount.closed + secretChangeCount.closed
    };
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
    limit = 20,
    offset = 0,
    search,
    orderBy,
    orderDirection
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

    // Check if user has SecretApprovalRequest.Read permission to list all requests
    const canReadAllApprovalRequests = permission.can(
      ProjectPermissionSecretApprovalRequestActions.Read,
      ProjectPermissionSub.SecretApprovalRequest
    );

    // If user has the permission, don't filter by userId (they see all requests)
    // Otherwise, filter to only show requests where they are committer or approver
    const userIdFilter = canReadAllApprovalRequests ? undefined : actorId;

    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);

    if (shouldUseSecretV2Bridge) {
      // Policies on the global approval system only exist on upgraded projects, so only this branch has
      // requests on both systems. Each is asked for the head of the list up to the requested page.
      const headOfList = {
        projectId,
        committer,
        environment,
        status,
        userId: userIdFilter,
        search,
        orderBy,
        orderDirection,
        limit: offset + limit,
        offset: 0
      };
      const [legacyRequests, secretChangeRequests] = await Promise.all([
        secretApprovalRequestDAL.findByProjectIdBridgeSecretV2(headOfList),
        secretChangeRequestBridgeService.listSecretChangeRequests(headOfList)
      ]);
      type TListedRequest = (typeof legacyRequests)["approvals"][number] | TSecretChangeRequestListItem;
      return mergeSecretApprovalRequestPages<TListedRequest>({
        pages: [legacyRequests, secretChangeRequests],
        offset,
        limit,
        orderBy,
        orderDirection
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
      search,
      orderBy,
      orderDirection
    });
  };

  const getSecretApprovalDetails = async (dto: TSecretApprovalDetailsDTO) => {
    if (await $useSecretChangeRequestBridge(dto.id)) {
      return secretChangeRequestBridgeService.getSecretChangeRequestById(dto);
    }

    const { actor, actorId, actorOrgId, actorAuthMethod, id } = dto;
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

    // Check if user has SecretApprovalRequest.Read permission
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
      secretApprovalRequest.committerIdentityId !== actorId &&
      !policy.approvers.find(({ userId }) => userId === actorId)
    ) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
    }
    let secrets;
    const secretPath = await folderDAL.findSecretPathByFolderIds(secretApprovalRequest.projectId, [
      secretApprovalRequest.folderId
    ]);
    const canReadSecretValue = buildSecretApprovalCommitValueAccess({
      permission,
      isReviewer: policy.approvers.some(({ userId }) => userId === actorId),
      isRequestOpen: secretApprovalRequest.status === RequestState.Open,
      environment: secretApprovalRequest.environment,
      secretPath: secretPath?.[0]?.path
    });
    if (shouldUseSecretV2Bridge) {
      const { decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      const encryptedSecrets = await secretApprovalRequestSecretDAL.findByRequestIdBridgeSecretV2(
        secretApprovalRequest.id
      );
      secrets = formatSecretApprovalCommitsV2Bridge({ commits: encryptedSecrets, decryptor, canReadSecretValue });
    } else {
      if (!botKey) throw new NotFoundError({ message: `Project bot key not found`, name: "BotKeyNotFound" }); // CLI depends on this error message. TODO(daniel): Make API check for name BotKeyNotFound instead of message
      const encryptedSecrets = await secretApprovalRequestSecretDAL.findByRequestId(secretApprovalRequest.id);
      secrets = encryptedSecrets.map((el) => ({
        ...el,
        secretValueHidden: !canReadSecretValue(el.tags),
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

  const $queueChangeRequestWebhook = async ({
    action,
    secretApprovalRequest,
    projectId,
    environment,
    environmentName,
    secretPath,
    isBypassed,
    tx
  }: {
    action: ChangeRequestWebhookAction;
    secretApprovalRequest: NonNullable<Awaited<ReturnType<TSecretApprovalRequestDALFactory["findById"]>>>;
    projectId: string;
    environment: string;
    environmentName?: string;
    secretPath: string;
    isBypassed?: boolean;
    tx?: Knex;
  }) => {
    const project = await projectDAL.findById(projectId, tx);
    if (!project) {
      logger.warn(
        `Skipping change request webhook, project not found [projectId=${projectId}] [requestId=${secretApprovalRequest.id}] [action=${action}]`
      );
      return;
    }

    const cfg = getConfig();
    // Taking every mutable field from one source keeps a caller-supplied null from being read as
    // "not provided" and silently replaced by the replica's value.
    const { committerUser } = secretApprovalRequest;
    const requestedBy: TWebhookActor | null = secretApprovalRequest.committerUserId
      ? {
          type: ActorType.USER,
          id: secretApprovalRequest.committerUserId,
          name:
            [committerUser?.firstName, committerUser?.lastName].filter(Boolean).join(" ") ||
            committerUser?.username ||
            "Unknown",
          email: committerUser?.email ?? null
        }
      : null;

    await queueService.queue(
      QueueName.SecretWebhook,
      QueueJobs.SecWebhook,
      {
        type: WebhookEvents.ChangeRequestModified,
        payload: {
          projectId,
          projectName: project.name,
          environment,
          environmentName,
          secretPath,
          action,
          request: {
            id: secretApprovalRequest.id,
            slug: secretApprovalRequest.slug,
            url: `${cfg.SITE_URL}/organizations/${project.orgId}/projects/secret-management/${projectId}/approval?requestId=${secretApprovalRequest.id}`,
            status: secretApprovalRequest.status,
            hasMerged: secretApprovalRequest.hasMerged,
            isBypassed: isBypassed ?? Boolean(secretApprovalRequest.bypassReason),
            policy: {
              id: secretApprovalRequest.policy.id,
              name: secretApprovalRequest.policy.name,
              enforcementLevel: secretApprovalRequest.policy.enforcementLevel
            },
            requestedBy,
            createdAt: secretApprovalRequest.createdAt.toISOString(),
            updatedAt: secretApprovalRequest.updatedAt.toISOString()
          }
        }
      },
      {
        jobId: `change-request-webhook-${secretApprovalRequest.id}-${alphaNumericNanoId(6)}`,
        removeOnFail: { count: 5 },
        removeOnComplete: true,
        delay: 1000,
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 }
      }
    );
  };

  const reviewApproval = async (dto: TReviewRequestDTO) => {
    if (await $useSecretChangeRequestBridge(dto.approvalId)) {
      return secretChangeRequestBridgeService.reviewSecretChangeRequest(dto);
    }

    const { approvalId, actor, status, comment, actorId, actorAuthMethod, actorOrgId } = dto;
    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message:
          "Failed to review secret approval request due to plan restriction. Upgrade plan to review secret approval request."
      });
    }

    const secretApprovalRequest = await secretApprovalRequestDAL.findById(approvalId);
    if (!secretApprovalRequest) {
      throw new NotFoundError({ message: `Secret approval request with ID '${approvalId}' not found` });
    }
    if (actor !== ActorType.USER) throw new BadRequestError({ message: "Must be a user" });

    if (secretApprovalRequest.status !== RequestState.Open)
      throw new BadRequestError({ message: "You can only review open approval requests" });

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

    try {
      const reviewedRequest = await secretApprovalRequestDAL.transaction((tx) =>
        secretApprovalRequestDAL.findById(secretApprovalRequest.id, tx)
      );
      const [reviewedFolder] = await folderDAL.findSecretPathByFolderIds(secretApprovalRequest.projectId, [
        secretApprovalRequest.folderId
      ]);
      if (reviewedRequest && reviewedFolder) {
        await $queueChangeRequestWebhook({
          action: ChangeRequestWebhookAction.Reviewed,
          secretApprovalRequest: reviewedRequest,
          projectId: secretApprovalRequest.projectId,
          environment: reviewedFolder.environmentSlug,
          environmentName: reviewedFolder.environmentName,
          secretPath: reviewedFolder.path
        });
      } else {
        logger.warn(
          `Skipping change request webhook, request or folder not found [requestId=${secretApprovalRequest.id}] [action=${ChangeRequestWebhookAction.Reviewed}]`
        );
      }
    } catch (error) {
      logger.error(
        error,
        `Failed to queue change request webhook [requestId=${secretApprovalRequest.id}] [action=${ChangeRequestWebhookAction.Reviewed}]`
      );
    }

    return { ...reviewStatus, projectId: secretApprovalRequest.projectId };
  };

  const updateApprovalStatus = async (dto: TStatusChangeDTO) => {
    if (await $useSecretChangeRequestBridge(dto.approvalId)) {
      return secretChangeRequestBridgeService.updateSecretChangeRequestStatus(dto);
    }

    const { actorId, status, approvalId, actor, actorOrgId, actorAuthMethod } = dto;
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

    const statusAction =
      status === RequestState.Open ? ChangeRequestWebhookAction.Reopened : ChangeRequestWebhookAction.Closed;
    try {
      const changedRequest = await secretApprovalRequestDAL.transaction((tx) =>
        secretApprovalRequestDAL.findById(secretApprovalRequest.id, tx)
      );
      const [statusFolder] = await folderDAL.findSecretPathByFolderIds(secretApprovalRequest.projectId, [
        secretApprovalRequest.folderId
      ]);
      if (changedRequest && statusFolder) {
        await $queueChangeRequestWebhook({
          action: statusAction,
          secretApprovalRequest: changedRequest,
          projectId: secretApprovalRequest.projectId,
          environment: statusFolder.environmentSlug,
          environmentName: statusFolder.environmentName,
          secretPath: statusFolder.path
        });
      } else {
        logger.warn(
          `Skipping change request webhook, request or folder not found [requestId=${secretApprovalRequest.id}] [action=${statusAction}]`
        );
      }
    } catch (error) {
      logger.error(
        error,
        `Failed to queue change request webhook [requestId=${secretApprovalRequest.id}] [action=${statusAction}]`
      );
    }

    return { ...secretApprovalRequest, ...updatedRequest };
  };

  const mergeSecretApprovalRequest = async (dto: TMergeSecretApprovalRequestDTO) => {
    if (await $useSecretChangeRequestBridge(dto.approvalId)) {
      return secretChangeRequestBridgeService.mergeSecretChangeRequest(dto);
    }

    const { approvalId, actor, actorId, actorOrgId, actorAuthMethod, bypassReason } = dto;
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
    const { envId: policyEnvId } = policy;
    if (!policyEnvId) {
      throw new BadRequestError({
        message: "The policy associated with this secret approval request is not linked to the environment."
      });
    }

    if (secretApprovalRequest.hasMerged) throw new BadRequestError({ message: "Approval request has been merged" });
    if (secretApprovalRequest.status !== RequestState.Open)
      throw new BadRequestError({ message: "You can only approve or reject open approval requests" });

    const { hasRole, permission } = await permissionService.getProjectPermission({
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
    const reviewers = secretApprovalRequest.reviewers.reduce<Record<string, ApprovalStatus>>((prev, curr) => {
      // eslint-disable-next-line no-param-reassign
      prev[curr.userId.toString()] = curr.status as ApprovalStatus;
      return prev;
    }, {});
    const hasMinApproval =
      secretApprovalRequest.policy.approvals <=
      secretApprovalRequest.policy.approvers.filter(({ userId: approverId }) =>
        approverId ? reviewers[approverId] === ApprovalStatus.APPROVED : false
      ).length;
    const isSoftEnforcement = secretApprovalRequest.policy.enforcementLevel === EnforcementLevel.Soft;
    const canBypass = !bypassers.length || bypassers.some((bypasser) => bypasser.userId === actorId);

    if (!hasMinApproval && !(isSoftEnforcement && canBypass))
      throw new BadRequestError({ message: "Doesn't have minimum approvals needed" });

    // A bypass merge applies the changes without satisfying the policy's required approvals.
    // Persist the reason so it can be surfaced in the UI and distinguished from a normal merge.
    const isMergedViaBypass = isSoftEnforcement && !hasMinApproval;

    const { botKey, shouldUseSecretV2Bridge, project } = await projectBotService.getBotKey(projectId);
    const [folder] = await folderDAL.findSecretPathByFolderIds(projectId, [folderId]);
    if (!folder) {
      throw new NotFoundError({ message: `Folder with ID '${folderId}' not found in project with ID '${projectId}'` });
    }

    let mergeStatus;
    if (shouldUseSecretV2Bridge) {
      const secretApprovalSecrets = await secretApprovalRequestSecretDAL.findByRequestIdBridgeSecretV2(
        secretApprovalRequest.id
      );
      const { conflicts, creates, updates, deletes } = await detectSecretApprovalCommitConflicts({
        folderId,
        commits: secretApprovalSecrets
      });
      const cipher = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });

      mergeStatus = await secretApprovalRequestDAL.transaction(async (tx) => {
        const secrets = await applySecretApprovalCommitsV2Bridge({
          projectId,
          folderId,
          environment,
          envId: policyEnvId,
          secretPath: folder.path,
          actor,
          actorId,
          actorOrgId,
          permission,
          cipher,
          creates,
          updates,
          deletes,
          tx
        });

        const updatedSecretApproval = await secretApprovalRequestDAL.updateById(
          secretApprovalRequest.id,
          {
            conflicts: JSON.stringify(conflicts),
            hasMerged: true,
            status: RequestState.Closed,
            statusChangedByUserId: actorId,
            bypassReason: isMergedViaBypass ? bypassReason || null : null
          },
          tx
        );
        await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId, tx);
        return { secrets, approval: updatedSecretApproval };
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
            statusChangedByUserId: actorId,
            bypassReason: isMergedViaBypass ? bypassReason || null : null
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
      environmentName: folder.environmentName,
      actorId,
      actor,
      events
    });

    try {
      const mergedRequest = await secretApprovalRequestDAL.transaction((tx) =>
        secretApprovalRequestDAL.findById(secretApprovalRequest.id, tx)
      );
      if (mergedRequest) {
        await $queueChangeRequestWebhook({
          action: ChangeRequestWebhookAction.Merged,
          secretApprovalRequest: mergedRequest,
          projectId,
          environment: folder.environmentSlug,
          environmentName: folder.environmentName,
          secretPath: folder.path,
          isBypassed: isMergedViaBypass
        });
      } else {
        logger.warn(
          `Skipping change request webhook, request not found [requestId=${secretApprovalRequest.id}] [action=${ChangeRequestWebhookAction.Merged}]`
        );
      }
    } catch (error) {
      logger.error(
        error,
        `Failed to queue change request webhook [requestId=${secretApprovalRequest.id}] [action=${ChangeRequestWebhookAction.Merged}]`
      );
    }

    if (isSoftEnforcement && !hasMinApproval) {
      const env = await projectEnvDAL.findOne({ slug: environment, projectId });
      await notifySecretApprovalBypass({
        project,
        environmentName: env.name,
        secretPath: policy.secretPath,
        actorId,
        approverUserIds: policy.approvers.map((approver: { userId: string | null | undefined }) => approver.userId!),
        bypassReason
      });
    }

    const { created, updated, deleted } = mergeStatus.secrets;

    const requestedByActor = buildRequestedByActor(secretApprovalRequest);

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

    return { ...mergeStatus, projectId, secretMutationEvents, isMergedViaBypass, requestedByActor };
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

    if (await secretChangePolicyBridgeService.findSecretChangePolicy(policy.id)) {
      throw new BadRequestError({
        message: `Secret approval policy with ID '${policy.id}' is on the global approval system, which does not support projects that have not been upgraded to the latest secrets version.`
      });
    }

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
          ...getCommitterIds(actor, actorId)
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

    const env = await projectEnvDAL.findOne({ slug: environment, projectId });
    const user =
      actor === ActorType.IDENTITY
        ? undefined
        : await requestMemoize(requestMemoKeys.userFindById(actorId), () => userDAL.findById(actorId));

    const projectPath = `/organizations/${actorOrgId}/projects/secret-management/${projectId}`;
    const approvalPath = `${projectPath}/approval`;
    const cfg = getConfig();
    const approvalUrl = `${cfg.SITE_URL}${approvalPath}?requestId=${secretApprovalRequest.id}`;

    const project = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
      projectDAL.findById(projectId)
    );
    await triggerWorkflowIntegrationNotification({
      input: {
        projectId,
        notification: {
          type: TriggerFeature.SECRET_APPROVAL,
          payload: {
            userEmail: user?.email ?? undefined,
            machineIdentityId: actor === ActorType.IDENTITY ? actorId : undefined,
            environment: env.name,
            secretPath,
            projectId,
            projectName: project.name,
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

    try {
      const createdRequest = await secretApprovalRequestDAL.transaction((tx) =>
        secretApprovalRequestDAL.findById(secretApprovalRequest.id, tx)
      );
      if (createdRequest) {
        await $queueChangeRequestWebhook({
          action: ChangeRequestWebhookAction.Created,
          secretApprovalRequest: createdRequest,
          projectId,
          environment,
          environmentName: env.name,
          secretPath
        });
      } else {
        logger.warn(
          `Skipping change request webhook, request not found [requestId=${secretApprovalRequest.id}] [action=${ChangeRequestWebhookAction.Created}]`
        );
      }
    } catch (error) {
      logger.error(
        error,
        `Failed to queue change request webhook [requestId=${secretApprovalRequest.id}] [action=${ChangeRequestWebhookAction.Created}]`
      );
    }

    void telemetryService
      .sendPostHogEvents({
        event: PostHogEventTypes.SecretApprovalRequestSubmitted,
        distinctId: user?.username ?? user?.email ?? actorId,
        organizationId: actorOrgId,
        properties: {
          requestId: secretApprovalRequest.id,
          policyId: policy.id,
          projectId,
          environment,
          secretPath,
          numberOfCommits: commits.length,
          actorType: actor as string
        }
      })
      .catch(() => {});

    return secretApprovalRequest;
  };

  const createSecretApprovalSideEffects = async (dto: TCreateSecretApprovalSideEffectsDTO) => {
    if (await $useSecretChangeRequestBridge(dto.secretApprovalRequest.id, dto.tx)) {
      return secretChangeRequestBridgeService.createSecretChangeRequestSideEffects(dto);
    }

    const { secretApprovalRequest, projectId, environment, secretPath, secretKeys, actor, actorId, actorOrgId, tx } =
      dto;
    const user =
      actor === ActorType.IDENTITY
        ? undefined
        : await requestMemoize(requestMemoKeys.userFindById(actorId), () => userDAL.findById(actorId));
    const project = await projectDAL.findById(projectId);
    const env = await projectEnvDAL.findOne({ slug: environment, projectId });

    const projectPath = `/organizations/${actorOrgId}/projects/secret-management/${project.id}`;
    const approvalPath = `${projectPath}/approval`;
    const cfg = getConfig();
    const approvalUrl = `${cfg.SITE_URL}${approvalPath}?requestId=${secretApprovalRequest.id}`;

    await triggerWorkflowIntegrationNotification({
      input: {
        projectId,
        notification: {
          type: TriggerFeature.SECRET_APPROVAL,
          payload: {
            machineIdentityId: actor === ActorType.IDENTITY ? actorId : undefined,
            userEmail: user?.email ?? undefined,
            environment: env.name,
            secretPath,
            projectId,
            projectName: project.name,
            requestId: secretApprovalRequest.id,
            secretKeys,
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

    try {
      // A caller-supplied transaction has not committed yet, so the reads have to go through it
      // to see the request at all, and to avoid checking out a second connection while it is open.
      const createdRequest = tx
        ? await secretApprovalRequestDAL.findById(secretApprovalRequest.id, tx)
        : await secretApprovalRequestDAL.transaction((innerTx) =>
            secretApprovalRequestDAL.findById(secretApprovalRequest.id, innerTx)
          );
      if (createdRequest) {
        await $queueChangeRequestWebhook({
          action: ChangeRequestWebhookAction.Created,
          secretApprovalRequest: createdRequest,
          projectId,
          environment,
          environmentName: env.name,
          secretPath,
          tx
        });
      } else {
        logger.warn(
          `Skipping change request webhook, request not found [requestId=${secretApprovalRequest.id}] [action=${ChangeRequestWebhookAction.Created}]`
        );
      }
    } catch (error) {
      if (tx) throw error;

      logger.error(
        error,
        `Failed to queue change request webhook [requestId=${secretApprovalRequest.id}] [action=${ChangeRequestWebhookAction.Created}]`
      );
    }

    void telemetryService
      .sendPostHogEvents({
        event: PostHogEventTypes.SecretApprovalRequestSubmitted,
        distinctId: user?.username ?? user?.email ?? actorId,
        organizationId: actorOrgId,
        properties: {
          requestId: secretApprovalRequest.id,
          policyId: secretApprovalRequest.policyId,
          projectId,
          environment,
          secretPath,
          numberOfCommits: secretApprovalRequest.commits.length,
          actorType: actor as string
        }
      })
      .catch(() => {});
  };

  const generateSecretApprovalRequestV2Bridge = async (
    dto: TGenerateSecretApprovalRequestV2BridgeDTO & { trx?: Knex; skipPostProcessing?: boolean }
  ) => {
    if (await secretChangePolicyBridgeService.findSecretChangePolicy(dto.policy.id, dto.trx)) {
      return secretChangeRequestBridgeService.generateSecretChangeRequest(dto);
    }

    const {
      actorId,
      actor,
      actorOrgId,
      policy,
      projectId,
      secretPath,
      environment,
      commitMessage,
      trx: providedTx,
      skipPostProcessing
    } = dto;

    const { folderId, commits, commitTagIds, tagIds, secretKeys } = await buildSecretApprovalCommits(dto);

    const executeApprovalRequestCreation = async (tx: Knex) => {
      const doc = await secretApprovalRequestDAL.create(
        {
          folderId,
          slug: alphaNumericNanoId(),
          policyId: policy.id,
          status: "open",
          hasMerged: false,
          ...getCommitterIds(actor, actorId),
          commitMessage
        },
        tx
      );
      const approvalCommits = await secretApprovalRequestSecretDAL.insertV2Bridge(
        commits.map((commit) => ({ ...pickApprovalCommitColumns(commit), requestId: doc.id })),
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

    if (!skipPostProcessing) {
      await createSecretApprovalSideEffects({
        secretApprovalRequest,
        projectId,
        environment,
        secretPath,
        secretKeys,
        actor,
        actorId,
        actorOrgId,
        tx: providedTx
      });
    }

    return secretApprovalRequest;
  };

  const findFolderIdsWithOpenRequests = async (folderIds: string[], tx?: Knex) => {
    if (!folderIds.length) return [];

    const legacyRequests = await secretApprovalRequestDAL.find(
      { $in: { folderId: folderIds }, status: RequestState.Open },
      { tx }
    );
    const secretChangeFolderIds = await secretChangeRequestBridgeService.findFolderIdsWithOpenSecretChangeRequests(
      folderIds,
      tx
    );

    return [...new Set([...legacyRequests.map((request) => request.folderId), ...secretChangeFolderIds])];
  };

  return {
    generateSecretApprovalRequest,
    generateSecretApprovalRequestV2Bridge,
    createSecretApprovalSideEffects,
    mergeSecretApprovalRequest,
    reviewApproval,
    updateApprovalStatus,
    getSecretApprovals,
    getSecretApprovalDetails,
    requestCount,
    findFolderIdsWithOpenRequests
  };
};
