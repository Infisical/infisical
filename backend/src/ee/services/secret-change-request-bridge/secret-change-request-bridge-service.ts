import { Knex } from "knex";

import { ActionProjectType, ProjectMembershipRole } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
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
  upsertApprovalRequestStepDecision
} from "@app/services/approval-policy/approval-request-fns";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TMicrosoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import { TProjectMicrosoftTeamsConfigDALFactory } from "@app/services/microsoft-teams/project-microsoft-teams-config-dal";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretVersionV2DALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { TSecretValidationRuleServiceFactory } from "@app/services/secret-validation-rule/secret-validation-rule-service";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { ChangeRequestWebhookAction } from "@app/services/webhook/webhook-types";

import { TUserGroupMembershipDALFactory } from "../group/user-group-membership-dal";
import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import {
  pickApprovalCommitColumns,
  secretApprovalRequestCommitFnsFactory
} from "../secret-approval-request/secret-approval-request-commit-fns";
import { TSecretApprovalRequestSecretDALFactory } from "../secret-approval-request/secret-approval-request-secret-dal";
import { ApprovalStatus } from "../secret-approval-request/secret-approval-request-types";
import { TSecretChangePolicyBridgeServiceFactory } from "../secret-change-policy-bridge/secret-change-policy-bridge-service";
import {
  secretChangeRequestFnsFactory,
  toSecretChangeRequest,
  toSecretChangeRequestReview
} from "./secret-change-request-bridge-fns";
import { TSecretChangeRequestBridgeMethods } from "./secret-change-request-bridge-types";
import { TSecretChangeRequestDALFactory } from "./secret-change-request-dal";

type TSecretChangeRequestBridgeServiceFactoryDep = {
  approvalRequestDAL: Pick<
    TApprovalRequestDALFactory,
    "findById" | "findByIdForUpdate" | "findStepsByRequestId" | "create" | "transaction"
  >;
  approvalRequestStepsDAL: Pick<TApprovalRequestStepsDALFactory, "create">;
  approvalRequestStepEligibleApproversDAL: Pick<TApprovalRequestStepEligibleApproversDALFactory, "create">;
  approvalRequestApprovalsDAL: Pick<TApprovalRequestApprovalsDALFactory, "findOne" | "create" | "updateById">;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findStepsByPolicyId">;
  secretChangeRequestDAL: Pick<TSecretChangeRequestDALFactory, "create" | "findOne">;
  secretApprovalRequestSecretDAL: Pick<
    TSecretApprovalRequestSecretDALFactory,
    "insertV2Bridge" | "insertApprovalSecretV2Tags"
  >;
  secretChangePolicyBridgeService: Pick<TSecretChangePolicyBridgeServiceFactory, "findSecretChangePolicyById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "findGroupMembershipsByUserIdInOrg">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findSecretPathByFolderIds">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findProjectWithOrg">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "findBySecretKeys" | "find">;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "findLatestVersionMany">;
  secretTagDAL: Pick<TSecretTagDALFactory, "findManyTagsById">;
  secretValidationRuleService: Pick<TSecretValidationRuleServiceFactory, "validateSecrets">;
  userDAL: Pick<TUserDALFactory, "findById" | "find">;
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
  secretTagDAL,
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
  const { buildSecretApprovalCommits } = secretApprovalRequestCommitFnsFactory({
    permissionService,
    folderDAL,
    projectDAL,
    kmsService,
    secretV2BridgeDAL,
    secretVersionV2BridgeDAL,
    secretTagDAL,
    secretValidationRuleService
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

  const mergeSecretChangeRequest: TSecretChangeRequestBridgeMethods["mergeSecretChangeRequest"] = async () => {
    throw notAvailable();
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
    mergeSecretChangeRequest,
    reviewSecretChangeRequest,
    updateSecretChangeRequestStatus,
    getSecretChangeRequestById
  };
};
