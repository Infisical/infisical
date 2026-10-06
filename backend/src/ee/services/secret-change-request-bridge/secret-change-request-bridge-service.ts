import { Knex } from "knex";

import { ActionProjectType, ProjectMembershipRole } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy, unique } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { EnforcementLevel } from "@app/lib/types";
import { TQueueServiceFactory } from "@app/queue";
import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import {
  ApprovalPolicyType,
  ApprovalRequestApprovalDecision,
  ApprovalRequestStatus
} from "@app/services/approval-policy/approval-policy-enums";
import {
  TApprovalRequestApprovalsDALFactory,
  TApprovalRequestDALFactory,
  TApprovalRequestStepEligibleApproversDALFactory,
  TApprovalRequestStepsDALFactory
} from "@app/services/approval-policy/approval-request-dal";
import {
  createApprovalRequestWithSteps,
  isEligibleStepApprover,
  resolveStepApproverUserIds,
  upsertApprovalRequestStepDecision
} from "@app/services/approval-policy/approval-request-fns";
import { ActorType } from "@app/services/auth/auth-type";
import { TFolderCommitServiceFactory } from "@app/services/folder-commit/folder-commit-service";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMicrosoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import { TProjectMicrosoftTeamsConfigDALFactory } from "@app/services/microsoft-teams/project-microsoft-teams-config-dal";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { TSecretQueueFactory } from "@app/services/secret/secret-queue";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretVersionV2DALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "@app/services/secret-v2-bridge/secret-version-tag-dal";
import { TSecretValidationRuleServiceFactory } from "@app/services/secret-validation-rule/secret-validation-rule-service";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { ChangeRequestWebhookAction } from "@app/services/webhook/webhook-types";

import { BypasserType } from "../access-approval-policy/access-approval-policy-types";
import { TUserGroupMembershipDALFactory } from "../group/user-group-membership-dal";
import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import {
  pickApprovalCommitColumns,
  secretApprovalRequestCommitFnsFactory
} from "../secret-approval-request/secret-approval-request-commit-fns";
import {
  buildRequestedByActor,
  buildSecretMutationEvents,
  secretApprovalRequestMergeFnsFactory
} from "../secret-approval-request/secret-approval-request-merge-fns";
import { TSecretApprovalRequestSecretDALFactory } from "../secret-approval-request/secret-approval-request-secret-dal";
import { ApprovalStatus } from "../secret-approval-request/secret-approval-request-types";
import { TSecretChangePolicyBridgeServiceFactory } from "../secret-change-policy-bridge/secret-change-policy-bridge-service";
import {
  secretChangeRequestFnsFactory,
  toSecretChangeRequest,
  toSecretChangeRequestCommit,
  toSecretChangeRequestReview
} from "./secret-change-request-bridge-fns";
import { TSecretChangeRequestBridgeMethods } from "./secret-change-request-bridge-types";
import { TSecretChangeRequestDALFactory } from "./secret-change-request-dal";

type TSecretChangeRequestBridgeServiceFactoryDep = {
  approvalRequestDAL: Pick<
    TApprovalRequestDALFactory,
    "findById" | "findByIdForUpdate" | "findStepsByRequestId" | "create" | "updateById" | "transaction"
  >;
  approvalRequestStepsDAL: Pick<TApprovalRequestStepsDALFactory, "create">;
  approvalRequestStepEligibleApproversDAL: Pick<TApprovalRequestStepEligibleApproversDALFactory, "create">;
  approvalRequestApprovalsDAL: Pick<TApprovalRequestApprovalsDALFactory, "findOne" | "create" | "updateById">;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findStepsByPolicyId">;
  secretChangeRequestDAL: Pick<TSecretChangeRequestDALFactory, "create" | "findOne" | "updateById">;
  secretApprovalRequestSecretDAL: Pick<
    TSecretApprovalRequestSecretDALFactory,
    "insertV2Bridge" | "insertApprovalSecretV2Tags" | "updateV2ById" | "findBySecretChangeIdBridgeSecretV2"
  >;
  secretChangePolicyBridgeService: Pick<TSecretChangePolicyBridgeServiceFactory, "findSecretChangePolicyById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "findGroupMembershipsByUserIdInOrg" | "find">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findSecretPathByFolderIds">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findProjectWithOrg">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
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
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "findLatestVersionMany" | "insertMany">;
  secretVersionTagV2BridgeDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  secretTagDAL: Pick<TSecretTagDALFactory, "findManyTagsById" | "saveTagsToSecretV2" | "deleteTagsToSecretV2" | "find">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets" | "removeSecretReminder">;
  secretValidationRuleService: Pick<TSecretValidationRuleServiceFactory, "validateSecrets">;
  userDAL: Pick<TUserDALFactory, "findById" | "find" | "findOne">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  projectMicrosoftTeamsConfigDAL: Pick<TProjectMicrosoftTeamsConfigDALFactory, "getIntegrationDetailsByProject">;
  microsoftTeamsService: Pick<TMicrosoftTeamsServiceFactory, "sendNotification">;
  smtpService: Pick<TSmtpService, "sendMail">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  queueService: Pick<TQueueServiceFactory, "queue">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
};

export type TSecretChangeRequestBridgeServiceFactory = ReturnType<typeof secretChangeRequestBridgeServiceFactory>;

const notAvailable = () =>
  new BadRequestError({ message: "Secret change requests on the approval system are not available yet." });

export const secretChangeRequestBridgeServiceFactory = ({
  approvalRequestDAL,
  approvalRequestStepsDAL,
  approvalRequestStepEligibleApproversDAL,
  approvalRequestApprovalsDAL,
  approvalPolicyDAL,
  secretChangeRequestDAL,
  secretApprovalRequestSecretDAL,
  secretChangePolicyBridgeService,
  permissionService,
  licenseService,
  userGroupMembershipDAL,
  folderDAL,
  projectDAL,
  projectEnvDAL,
  kmsService,
  secretV2BridgeDAL,
  secretVersionV2BridgeDAL,
  secretVersionTagV2BridgeDAL,
  secretTagDAL,
  resourceMetadataDAL,
  folderCommitService,
  secretQueueService,
  secretValidationRuleService,
  userDAL,
  identityDAL,
  projectSlackConfigDAL,
  projectMicrosoftTeamsConfigDAL,
  microsoftTeamsService,
  smtpService,
  notificationService,
  queueService,
  telemetryService
}: TSecretChangeRequestBridgeServiceFactoryDep) => {
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

  const {
    detectSecretApprovalCommitConflicts,
    applySecretApprovalCommitsV2Bridge,
    findMergedFolder,
    syncMergedSecrets,
    notifySecretApprovalBypass
  } = secretApprovalRequestMergeFnsFactory({
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

  const { resolveRequester, queueChangeRequestWebhook, runSecretChangeRequestSideEffects } =
    secretChangeRequestFnsFactory({
      userDAL,
      identityDAL,
      projectDAL,
      projectEnvDAL,
      kmsService,
      projectSlackConfigDAL,
      projectMicrosoftTeamsConfigDAL,
      microsoftTeamsService,
      smtpService,
      notificationService,
      queueService,
      telemetryService
    });

  const findSecretChangeRequest = (requestId: string, tx?: Knex) => approvalRequestDAL.findById(requestId, tx);

  const $findSecretChangeRequestOrThrow = async (requestId: string) => {
    const approvalRequest = await approvalRequestDAL.findById(requestId);
    if (!approvalRequest || approvalRequest.type !== ApprovalPolicyType.SecretChange) {
      throw new NotFoundError({ message: `Secret approval request with ID '${requestId}' not found` });
    }
    const secretChangeRequest = await secretChangeRequestDAL.findOne({ approvalRequestId: approvalRequest.id });
    if (!secretChangeRequest) {
      throw new NotFoundError({ message: `Secret approval request with ID '${requestId}' not found` });
    }
    return { approvalRequest, secretChangeRequest };
  };

  const $findSecretChangePolicyOrThrow = async (policyId: string | null | undefined) => {
    const policy = policyId ? await secretChangePolicyBridgeService.findSecretChangePolicyById(policyId) : undefined;
    if (!policy) {
      throw new BadRequestError({
        message: "The policy associated with this secret approval request has been deleted."
      });
    }
    return policy;
  };

  const generateSecretChangeRequest: TSecretChangeRequestBridgeMethods["generateSecretChangeRequest"] = async (dto) => {
    const { actor, actorId, actorOrgId, projectId, environment, secretPath, commitMessage, trx, skipPostProcessing } =
      dto;
    const { folderId, project, commits, commitTagIds, tagIds, secretKeys } = await buildSecretApprovalCommits(dto);

    const write = async (tx: Knex) => {
      const policy = await secretChangePolicyBridgeService.findSecretChangePolicyById(dto.policy.id, tx);
      if (!policy) {
        throw new NotFoundError({ message: `Secret approval policy with ID '${dto.policy.id}' not found` });
      }

      const policySteps = await approvalPolicyDAL.findStepsByPolicyId(policy.id, tx);
      if (!policySteps.length) {
        throw new BadRequestError({
          message: `Secret approval policy '${policy.name}' has no approval step configured. Edit the policy and set its approvers before requesting changes.`
        });
      }

      const requester = await resolveRequester(actor, actorId, tx);

      const approvalRequest = await createApprovalRequestWithSteps(
        {
          projectId,
          organizationId: project.orgId,
          policyId: policy.id,
          policyType: ApprovalPolicyType.SecretChange,
          policySteps,
          requestData: {},
          status: ApprovalRequestStatus.Open,
          ...requester,
          scopeType: null,
          scopeId: null
        },
        { approvalRequestDAL, approvalRequestStepsDAL, approvalRequestStepEligibleApproversDAL },
        tx
      );

      const secretChangeRequest = await secretChangeRequestDAL.create(
        {
          approvalRequestId: approvalRequest.id,
          folderId,
          slug: alphaNumericNanoId(),
          hasMerged: false,
          commitMessage
        },
        tx
      );

      const approvalCommits = await secretApprovalRequestSecretDAL.insertV2Bridge(
        commits.map((commit) => ({ ...pickApprovalCommitColumns(commit), secretChangeId: secretChangeRequest.id })),
        tx
      );

      if (tagIds.length) {
        const commitsGroupByKey = groupBy(approvalCommits, (commit) => commit.key);
        await secretApprovalRequestSecretDAL.insertApprovalSecretV2Tags(
          Object.entries(commitTagIds).flatMap(([key, keyTagIds]) =>
            keyTagIds.map((tagId) => ({ secretId: commitsGroupByKey[key][0].id, tagId }))
          ),
          tx
        );
      }

      return { policy, approvalRequest, secretChangeRequest, commits: approvalCommits };
    };

    const created = trx ? await write(trx) : await approvalRequestDAL.transaction(write);
    const result = toSecretChangeRequest(created);

    if (!skipPostProcessing) {
      await runSecretChangeRequestSideEffects({
        ...created,
        project,
        environment,
        secretPath,
        secretKeys,
        actor,
        actorId,
        actorOrgId,
        tx: trx
      });
    }

    return result;
  };

  const createSecretChangeRequest: TSecretChangeRequestBridgeMethods["createSecretChangeRequest"] = async () => {
    throw notAvailable();
  };

  const mergeSecretChangeRequest: TSecretChangeRequestBridgeMethods["mergeSecretChangeRequest"] = async ({
    approvalId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    bypassReason
  }) => {
    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message:
          "Failed to merge secret approval request due to plan restriction. Upgrade plan to merge secret approval request."
      });
    }

    const { approvalRequest, secretChangeRequest } = await $findSecretChangeRequestOrThrow(approvalId);
    if (actor !== ActorType.USER) throw new BadRequestError({ message: "Must be a user" });

    if (secretChangeRequest.hasMerged) {
      throw new BadRequestError({ message: "This secret approval request has already been merged." });
    }
    if (approvalRequest.status !== ApprovalRequestStatus.Open) {
      throw new BadRequestError({ message: "You can only merge open approval requests" });
    }

    const policy = await $findSecretChangePolicyOrThrow(approvalRequest.policyId);
    const { projectId } = approvalRequest;

    const { hasRole, permission } = await permissionService.getProjectPermission({
      actor: ActorType.USER,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const steps = await approvalRequestDAL.findStepsByRequestId(approvalRequest.id);
    const currentStep = steps.find((step) => step.stepNumber === approvalRequest.currentStep);
    if (!currentStep) {
      throw new BadRequestError({
        message: `Secret approval request with ID '${approvalId}' has no approval step to merge.`
      });
    }

    const userGroups = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(actorId, actorOrgId);
    const userGroupIds = new Set(userGroups.map((group) => group.groupId));
    if (
      !hasRole(ProjectMembershipRole.Admin) &&
      approvalRequest.requesterId !== actorId &&
      !isEligibleStepApprover(currentStep, actorId, userGroupIds)
    ) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
    }

    const stepApprovals = await Promise.all(
      steps.map(async (step) => {
        const eligibleUserIds = await resolveStepApproverUserIds(step, userGroupMembershipDAL);
        const approvedCount = new Set(
          step.approvals
            .filter(
              (approval) =>
                approval.decision === ApprovalRequestApprovalDecision.Approved &&
                eligibleUserIds.has(approval.approverUserId)
            )
            .map((approval) => approval.approverUserId)
        ).size;
        return { step, approvedCount };
      })
    );
    const unmetStep = stepApprovals.find(({ step, approvedCount }) => approvedCount < step.requiredApprovals);
    const isSoftEnforcement = policy.enforcementLevel === EnforcementLevel.Soft;
    const canBypass =
      !policy.bypassers.length ||
      policy.bypassers.some(
        (bypasser) =>
          (bypasser.type === BypasserType.User && bypasser.id === actorId) ||
          (bypasser.type === BypasserType.Group && userGroupIds.has(bypasser.id))
      );

    if (unmetStep && !(isSoftEnforcement && canBypass)) {
      throw new BadRequestError({
        message: `Secret approval request '${secretChangeRequest.slug}' needs ${unmetStep.step.requiredApprovals} approval(s) on step ${unmetStep.step.stepNumber} and has ${unmetStep.approvedCount}.`
      });
    }
    const isMergedViaBypass = isSoftEnforcement && Boolean(unmetStep);

    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
    const folder = await findMergedFolder(projectId, secretChangeRequest.folderId);
    const commits = await secretApprovalRequestSecretDAL.findBySecretChangeIdBridgeSecretV2(secretChangeRequest.id);
    const { conflicts, creates, updates, deletes } = await detectSecretApprovalCommitConflicts({
      folderId: folder.id,
      commits
    });
    const cipher = await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

    const merged = await approvalRequestDAL.transaction(async (tx) => {
      const locked = await approvalRequestDAL.findByIdForUpdate(approvalRequest.id, tx);
      if (!locked || locked.status !== ApprovalRequestStatus.Open) {
        throw new BadRequestError({ message: "You can only merge open approval requests" });
      }

      const secrets = await applySecretApprovalCommitsV2Bridge({
        projectId,
        folderId: folder.id,
        environment: folder.environmentSlug,
        envId: folder.envId,
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

      const mergedChangeRequest = await secretChangeRequestDAL.updateById(
        secretChangeRequest.id,
        {
          conflicts: JSON.stringify(conflicts),
          hasMerged: true,
          statusChangedByUserId: actorId,
          bypassReason: isMergedViaBypass ? (bypassReason ?? null) : null
        },
        tx
      );
      const mergedApprovalRequest = await approvalRequestDAL.updateById(
        approvalRequest.id,
        { status: ApprovalRequestStatus.Closed },
        tx
      );
      await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId, tx);

      return { secrets, approvalRequest: mergedApprovalRequest, secretChangeRequest: mergedChangeRequest };
    });

    await syncMergedSecrets({ projectId, actorOrgId, actor, actorId, folder, secrets: merged.secrets });

    try {
      await queueChangeRequestWebhook({
        action: ChangeRequestWebhookAction.Merged,
        approvalRequest: merged.approvalRequest,
        secretChangeRequest: merged.secretChangeRequest,
        policy,
        project,
        environment: folder.environmentSlug,
        environmentName: folder.environmentName,
        secretPath: folder.path,
        isBypassed: isMergedViaBypass
      });
    } catch (error) {
      logger.error(
        error,
        `Failed to queue change request webhook [requestId=${approvalRequest.id}] [action=${ChangeRequestWebhookAction.Merged}]`
      );
    }

    if (isMergedViaBypass) {
      await notifySecretApprovalBypass({
        project,
        environmentName: folder.environmentName,
        secretPath: folder.path,
        actorId,
        approverUserIds: unique(policy.userApprovers.map((approver) => approver.userId)),
        bypassReason
      });
    }

    return {
      secrets: merged.secrets,
      approval: toSecretChangeRequest({
        approvalRequest: merged.approvalRequest,
        secretChangeRequest: merged.secretChangeRequest,
        commits: commits.map(toSecretChangeRequestCommit)
      }),
      projectId,
      secretMutationEvents: buildSecretMutationEvents({
        environment: folder.environmentSlug,
        secretPath: folder.path,
        secrets: merged.secrets
      }),
      isMergedViaBypass,
      requestedByActor: buildRequestedByActor({
        committerUserId: approvalRequest.requesterId,
        committerUser: { email: approvalRequest.requesterEmail, username: approvalRequest.requesterEmail },
        committerIdentity: approvalRequest.machineIdentityId
          ? { identityId: approvalRequest.machineIdentityId, name: approvalRequest.requesterName }
          : null
      })
    };
  };

  const reviewSecretChangeRequest: TSecretChangeRequestBridgeMethods["reviewSecretChangeRequest"] = async ({
    approvalId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    status,
    comment
  }) => {
    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message:
          "Failed to review secret approval request due to plan restriction. Upgrade plan to review secret approval request."
      });
    }

    const { approvalRequest, secretChangeRequest } = await $findSecretChangeRequestOrThrow(approvalId);
    if (actor !== ActorType.USER) throw new BadRequestError({ message: "Must be a user" });

    if (approvalRequest.status !== ApprovalRequestStatus.Open) {
      throw new BadRequestError({ message: "You can only review open approval requests" });
    }

    const policy = await $findSecretChangePolicyOrThrow(approvalRequest.policyId);
    if (!policy.allowedSelfApprovals && actorId === approvalRequest.requesterId) {
      throw new BadRequestError({
        message: "Failed to review secret approval request. Users are not authorized to review their own request."
      });
    }

    const { hasRole } = await permissionService.getProjectPermission({
      actor: ActorType.USER,
      actorId,
      projectId: approvalRequest.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const steps = await approvalRequestDAL.findStepsByRequestId(approvalRequest.id);
    const currentStep = steps.find((step) => step.stepNumber === approvalRequest.currentStep);
    if (!currentStep) {
      throw new BadRequestError({
        message: `Secret approval request with ID '${approvalId}' has no approval step to review.`
      });
    }

    const userGroups = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(actorId, actorOrgId);
    const userGroupIds = new Set(userGroups.map((group) => group.groupId));
    if (
      !hasRole(ProjectMembershipRole.Admin) &&
      approvalRequest.requesterId !== actorId &&
      !isEligibleStepApprover(currentStep, actorId, userGroupIds)
    ) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
    }

    const decision =
      status === ApprovalStatus.APPROVED
        ? ApprovalRequestApprovalDecision.Approved
        : ApprovalRequestApprovalDecision.Rejected;

    const review = await approvalRequestDAL.transaction(async (tx) => {
      const locked = await approvalRequestDAL.findByIdForUpdate(approvalRequest.id, tx);
      if (!locked || locked.status !== ApprovalRequestStatus.Open) {
        throw new BadRequestError({ message: "You can only review open approval requests" });
      }
      return upsertApprovalRequestStepDecision(
        { stepId: currentStep.id, approverUserId: actorId, decision, comment },
        { approvalRequestApprovalsDAL },
        tx
      );
    });

    try {
      const project = await projectDAL.findById(approvalRequest.projectId);
      const [folder] = await folderDAL.findSecretPathByFolderIds(approvalRequest.projectId, [
        secretChangeRequest.folderId
      ]);
      if (project && folder) {
        await queueChangeRequestWebhook({
          action: ChangeRequestWebhookAction.Reviewed,
          approvalRequest,
          secretChangeRequest,
          policy,
          project,
          environment: folder.environmentSlug,
          environmentName: folder.environmentName,
          secretPath: folder.path
        });
      } else {
        logger.warn(
          `Skipping change request webhook, project or folder not found [requestId=${approvalRequest.id}] [action=${ChangeRequestWebhookAction.Reviewed}]`
        );
      }
    } catch (error) {
      logger.error(
        error,
        `Failed to queue change request webhook [requestId=${approvalRequest.id}] [action=${ChangeRequestWebhookAction.Reviewed}]`
      );
    }

    return { ...toSecretChangeRequestReview(review, approvalRequest.id), projectId: approvalRequest.projectId };
  };

  const updateSecretChangeRequestStatus: TSecretChangeRequestBridgeMethods["updateSecretChangeRequestStatus"] =
    async () => {
      throw notAvailable();
    };

  const getSecretChangeRequestById: TSecretChangeRequestBridgeMethods["getSecretChangeRequestById"] = async () => {
    throw notAvailable();
  };

  return {
    findSecretChangeRequest,
    generateSecretChangeRequest,
    createSecretChangeRequest,
    mergeSecretChangeRequest,
    reviewSecretChangeRequest,
    updateSecretChangeRequestStatus,
    getSecretChangeRequestById
  };
};
