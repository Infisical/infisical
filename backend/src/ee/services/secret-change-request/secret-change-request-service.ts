import { Knex } from "knex";

import { AccessScope, ActionProjectType, ProjectMembershipRole, TApprovalRequests } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy, groupByUnique, unique } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { EnforcementLevel } from "@app/lib/types";
import {
  ApprovalPolicyType,
  ApprovalRequestApprovalDecision,
  ApprovalRequestStatus
} from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalRequestDALFactory } from "@app/services/approval-policy/approval-request-dal";
import {
  createApprovalRequestWithSteps,
  isEligibleStepApprover,
  resolveStepApproverUserIds,
  upsertApprovalRequestStepDecision
} from "@app/services/approval-policy/approval-request-fns";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { createSecretBlindIndexer } from "@app/services/secret-v2-bridge/secret-blind-index-fns";
import { ChangeRequestWebhookAction } from "@app/services/webhook/webhook-types";

import { BypasserType } from "../access-approval-policy/access-approval-policy-types";
import { ProjectPermissionSecretApprovalRequestActions, ProjectPermissionSub } from "../permission/project-permission";
import { pickApprovalCommitColumns, secretApprovalRequestCommitFnsFactory } from "./secret-change-request-commit-fns";
import {
  buildSecretApprovalCommitValueAccess,
  formatSecretApprovalCommitsV2Bridge
} from "./secret-change-request-details-fns";
import {
  groupUserIdsByGroupId,
  isGroupActor,
  resolveActorUserIds,
  secretChangeRequestFnsFactory,
  toApprovalRequestUser,
  toDeletedSecretChangePolicyStub,
  toSecretChangeRequest,
  toSecretChangeRequestBase,
  toSecretChangeRequestCommit,
  toSecretChangeRequestListItem,
  toSecretChangeRequestReview
} from "./secret-change-request-fns";
import {
  buildRequestedByActor,
  buildSecretMutationEvents,
  secretApprovalRequestMergeFnsFactory
} from "./secret-change-request-merge-fns";
import {
  ApprovalStatus,
  RequestState,
  TApprovalRequestCountDTO,
  TApprovalRequestUser,
  TListApprovalsDTO,
  TSecretChangeRequestCommitInsert,
  TSecretChangeRequestMethods,
  TSecretChangeRequestPolicySummary,
  TSecretChangeRequestServiceFactoryDep
} from "./secret-change-request-types";

type TRequestSteps = Awaited<ReturnType<TApprovalRequestDALFactory["findStepsByRequestId"]>>;

const POLICY_DELETED_MESSAGE = "The policy associated with this secret approval request has been deleted.";

export type TSecretChangeRequestServiceFactory = ReturnType<typeof secretChangeRequestServiceFactory>;

export const secretChangeRequestServiceFactory = ({
  approvalRequestDAL,
  approvalRequestStepsDAL,
  approvalRequestStepEligibleApproversDAL,
  approvalRequestApprovalsDAL,
  approvalPolicyDAL,
  secretChangeRequestDAL,
  membershipUserDAL,
  secretChangePolicyService,
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
  eventEmitter,
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
}: TSecretChangeRequestServiceFactoryDep) => {
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
    eventEmitter,
    secretQueueService,
    secretChangeRequestDAL,
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

  const findFolderIdsWithOpenRequests = async (folderIds: string[], tx?: Knex) => {
    if (!folderIds.length) return [];

    const secretChangeRequests = await secretChangeRequestDAL.find({ $in: { folderId: folderIds } }, { tx });
    if (!secretChangeRequests.length) return [];

    const openRequests = await approvalRequestDAL.find(
      { $in: { id: secretChangeRequests.map((request) => request.approvalRequestId) }, status: RequestState.Open },
      { tx }
    );
    const openRequestIds = new Set(openRequests.map((request) => request.id));

    return secretChangeRequests
      .filter((request) => openRequestIds.has(request.approvalRequestId))
      .map((request) => request.folderId);
  };

  const $findSecretChangeRequestOrThrow = async (requestId: string, tx?: Knex) => {
    const approvalRequest = await approvalRequestDAL.findById(requestId, tx);
    if (!approvalRequest || approvalRequest.type !== ApprovalPolicyType.SecretChange) {
      throw new NotFoundError({ message: `Secret approval request with ID '${requestId}' not found` });
    }
    const secretChangeRequest = await secretChangeRequestDAL.findOne({ approvalRequestId: approvalRequest.id }, tx);
    if (!secretChangeRequest) {
      throw new NotFoundError({ message: `Secret approval request with ID '${requestId}' not found` });
    }
    return { approvalRequest, secretChangeRequest };
  };

  const $findSecretChangePolicyOrThrow = async (policyId: string | null | undefined, tx?: Knex) => {
    const policy = policyId ? await secretChangePolicyService.findSecretChangePolicyById(policyId, tx) : undefined;
    if (!policy) {
      throw new BadRequestError({ message: POLICY_DELETED_MESSAGE });
    }
    return policy;
  };

  const $assertCanActOnRequest = async ({
    approvalRequest,
    actorId,
    actorAuthMethod,
    actorOrgId,
    action
  }: {
    approvalRequest: TApprovalRequests;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    action: "review" | "merge" | "update";
  }) => {
    const { hasRole, permission } = await permissionService.getProjectPermission({
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
        message: `Secret approval request with ID '${approvalRequest.id}' has no approval step to ${action}.`
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

    return { hasRole, permission, steps, currentStep, userGroupIds };
  };

  const $findUnmetStep = (steps: TRequestSteps, eligibleByStepId: Map<string, Set<string>>) =>
    steps
      .map((step) => {
        const eligibleUserIds = eligibleByStepId.get(step.id) ?? new Set<string>();
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
      .find(({ step, approvedCount }) => approvedCount < step.requiredApprovals);

  const $resolveMergeBypass = ({
    unmetStep,
    slug,
    isSoftEnforcement,
    canBypass,
    bypassReason
  }: {
    unmetStep: ReturnType<typeof $findUnmetStep>;
    slug: string;
    isSoftEnforcement: boolean;
    canBypass: boolean;
    bypassReason?: string;
  }): { isMergedViaBypass: true; bypassReason: string } | { isMergedViaBypass: false; bypassReason: null } => {
    if (!unmetStep) return { isMergedViaBypass: false, bypassReason: null };
    if (!(isSoftEnforcement && canBypass)) {
      throw new BadRequestError({
        message: `Secret approval request '${slug}' needs ${unmetStep.step.requiredApprovals} approval(s) on step ${unmetStep.step.stepNumber} and has ${unmetStep.approvedCount}.`
      });
    }
    const trimmed = bypassReason?.trim() ?? "";
    if (trimmed.length < 10) {
      throw new BadRequestError({
        message: "A bypass reason of at least 10 characters is required to bypass approvals"
      });
    }
    return { isMergedViaBypass: true, bypassReason: trimmed };
  };

  const $writeSecretChangeRequest = async (
    {
      policyId,
      folderId,
      projectId,
      orgId,
      actor,
      actorId,
      commitMessage,
      isReplicated,
      commits,
      commitTags
    }: {
      policyId: string;
      folderId: string;
      projectId: string;
      orgId: string;
      actor: ActorType;
      actorId: string;
      commitMessage?: string | null;
      isReplicated?: boolean | null;
      commits: TSecretChangeRequestCommitInsert[];
      commitTags: Record<string, string[]>;
    },
    tx: Knex
  ) => {
    const lockedPolicy = await approvalPolicyDAL.findByIdForShare(policyId, tx);
    const policy = lockedPolicy ? await secretChangePolicyService.findSecretChangePolicyById(policyId, tx) : null;
    if (!policy) {
      throw new NotFoundError({ message: `Secret approval policy with ID '${policyId}' not found` });
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
        organizationId: orgId,
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
        commitMessage,
        isReplicated
      },
      tx
    );

    const approvalCommits = await secretChangeRequestDAL.insertV2Bridge(
      commits.map((commit) => ({ ...commit, secretChangeId: secretChangeRequest.id })),
      tx
    );

    const commitsGroupByKey = groupBy(approvalCommits, (commit) => commit.key);
    const approvalSecretTags = Object.entries(commitTags).flatMap(([key, keyTagIds]) =>
      keyTagIds.map((tagId) => ({ secretId: commitsGroupByKey[key][0].id, tagId }))
    );
    if (approvalSecretTags.length) {
      await secretChangeRequestDAL.insertApprovalSecretV2Tags(approvalSecretTags, tx);
    }

    return { policy, approvalRequest, secretChangeRequest, commits: approvalCommits };
  };

  const generateSecretApprovalRequestV2Bridge: TSecretChangeRequestMethods["generateSecretApprovalRequestV2Bridge"] =
    async (dto) => {
      const { actor, actorId, actorOrgId, projectId, environment, secretPath, commitMessage, trx, skipPostProcessing } =
        dto;
      const { folderId, project, commits, commitTagIds, secretKeys } = await buildSecretApprovalCommits(dto);

      const write = (tx: Knex) =>
        $writeSecretChangeRequest(
          {
            policyId: dto.policy.id,
            folderId,
            projectId,
            orgId: project.orgId,
            actor,
            actorId,
            commitMessage,
            commits: commits.map((commit) => pickApprovalCommitColumns(commit)),
            commitTags: commitTagIds
          },
          tx
        );

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

  const createSecretApprovalRequestV2Bridge: TSecretChangeRequestMethods["createSecretApprovalRequestV2Bridge"] =
    async (dto, trx) => {
      const commitTags = dto.commits.reduce<Record<string, string[]>>((acc, { key, tagIds }) => {
        if (tagIds?.length) acc[key] = [...(acc[key] ?? []), ...tagIds];
        return acc;
      }, {});

      const write = async (tx: Knex) => {
        const policy = await secretChangePolicyService.findSecretChangePolicyById(dto.policy.id, tx);
        if (!policy) {
          throw new NotFoundError({ message: `Secret approval policy with ID '${dto.policy.id}' not found` });
        }
        const project = await projectDAL.findById(policy.projectId, tx);
        if (!project) throw new NotFoundError({ message: `Project with ID '${policy.projectId}' not found` });

        return $writeSecretChangeRequest(
          {
            policyId: policy.id,
            folderId: dto.folderId,
            projectId: project.id,
            orgId: project.orgId,
            actor: dto.actor,
            actorId: dto.actorId,
            commitMessage: dto.commitMessage,
            isReplicated: dto.isReplicated,
            commits: dto.commits.map(({ tagIds, ...commit }) => commit),
            commitTags
          },
          tx
        );
      };

      const created = trx ? await write(trx) : await approvalRequestDAL.transaction(write);
      return toSecretChangeRequest(created);
    };

  const createSecretApprovalSideEffects: TSecretChangeRequestMethods["createSecretApprovalSideEffects"] = async ({
    secretApprovalRequest,
    projectId,
    environment,
    secretPath,
    secretKeys,
    actor,
    actorId,
    actorOrgId,
    tx
  }) => {
    const { approvalRequest, secretChangeRequest } = await $findSecretChangeRequestOrThrow(
      secretApprovalRequest.id,
      tx
    );
    const policy = await $findSecretChangePolicyOrThrow(approvalRequest.policyId, tx);
    const project = await projectDAL.findById(projectId, tx);
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });

    await runSecretChangeRequestSideEffects({
      approvalRequest,
      secretChangeRequest,
      policy,
      project,
      commits: secretApprovalRequest.commits,
      environment,
      secretPath,
      secretKeys,
      actor,
      actorId,
      actorOrgId,
      tx
    });
  };

  const mergeSecretApprovalRequest: TSecretChangeRequestMethods["mergeSecretApprovalRequest"] = async ({
    approvalId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    bypassReason,
    requireApprovals
  }) => {
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

    const { permission, steps, userGroupIds } = await $assertCanActOnRequest({
      approvalRequest,
      actorId,
      actorAuthMethod,
      actorOrgId,
      action: "merge"
    });

    const eligibleByStepId = new Map(
      await Promise.all(
        steps.map(async (step) => [step.id, await resolveStepApproverUserIds(step, userGroupMembershipDAL)] as const)
      )
    );
    const isSoftEnforcement = policy.enforcementLevel === EnforcementLevel.Soft;
    const canBypass =
      !policy.bypassers.length ||
      policy.bypassers.some(
        (bypasser) =>
          (bypasser.type === BypasserType.User && bypasser.id === actorId) ||
          (bypasser.type === BypasserType.Group && userGroupIds.has(bypasser.id))
      );
    const resolveBypass = (requestSteps: TRequestSteps) =>
      $resolveMergeBypass({
        unmetStep: $findUnmetStep(requestSteps, eligibleByStepId),
        slug: secretChangeRequest.slug,
        isSoftEnforcement: isSoftEnforcement && !requireApprovals,
        canBypass,
        bypassReason
      });
    resolveBypass(steps);

    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
    const folder = await findMergedFolder(projectId, secretChangeRequest.folderId);
    if (!policy.environments.some((env) => env.id === folder.envId)) {
      throw new BadRequestError({
        message: "The policy associated with this secret approval request is not linked to the environment."
      });
    }
    const commits = await secretChangeRequestDAL.findBySecretChangeIdBridgeSecretV2(secretChangeRequest.id);
    const { conflicts, creates, updates, deletes } = await detectSecretApprovalCommitConflicts({
      folderId: folder.id,
      commits
    });
    const cipher = await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
    const blindIndexer = await createSecretBlindIndexer({ projectId, orgId: actorOrgId, kmsService });

    const merged = await approvalRequestDAL.transaction(async (tx) => {
      const locked = await approvalRequestDAL.findByIdForUpdate(approvalRequest.id, tx);
      if (!locked || locked.status !== ApprovalRequestStatus.Open) {
        throw new BadRequestError({ message: "You can only merge open approval requests" });
      }
      const lockedSteps = await approvalRequestDAL.findStepsByRequestId(approvalRequest.id, tx);
      const bypass = resolveBypass(lockedSteps);

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
        blindIndexer,
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
          bypassReason: bypass.bypassReason
        },
        tx
      );
      const mergedApprovalRequest = await approvalRequestDAL.updateById(
        approvalRequest.id,
        { status: ApprovalRequestStatus.Closed },
        tx
      );
      await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId, tx);

      return { secrets, approvalRequest: mergedApprovalRequest, secretChangeRequest: mergedChangeRequest, bypass };
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
        isBypassed: merged.bypass.isMergedViaBypass
      });
    } catch (error) {
      logger.error(
        error,
        `Failed to queue change request webhook [requestId=${approvalRequest.id}] [action=${ChangeRequestWebhookAction.Merged}]`
      );
    }

    if (merged.bypass.isMergedViaBypass) {
      await notifySecretApprovalBypass({
        project,
        environmentName: folder.environmentName,
        secretPath: folder.path,
        actorId,
        approverUserIds: unique(policy.userApprovers.map((approver) => approver.userId)),
        bypassReason: merged.bypass.bypassReason
      });
    }

    return {
      secrets: merged.secrets,
      approval: toSecretChangeRequest({
        policy,
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
      isMergedViaBypass: merged.bypass.isMergedViaBypass,
      requestedByActor: buildRequestedByActor({
        committerUserId: approvalRequest.requesterId,
        committerUser: { email: approvalRequest.requesterEmail, username: approvalRequest.requesterEmail },
        committerIdentity: approvalRequest.machineIdentityId
          ? { identityId: approvalRequest.machineIdentityId, name: approvalRequest.requesterName }
          : null
      })
    };
  };

  const reviewApproval: TSecretChangeRequestMethods["reviewApproval"] = async ({
    approvalId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    status,
    comment
  }) => {
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

    const { currentStep } = await $assertCanActOnRequest({
      approvalRequest,
      actorId,
      actorAuthMethod,
      actorOrgId,
      action: "review"
    });

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

  const updateApprovalStatus: TSecretChangeRequestMethods["updateApprovalStatus"] = async ({
    approvalId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    status
  }) => {
    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval && status === RequestState.Open) {
      throw new BadRequestError({
        message:
          "Failed to update secret approval request due to plan restriction. Upgrade plan to update secret approval request."
      });
    }

    const { approvalRequest, secretChangeRequest } = await $findSecretChangeRequestOrThrow(approvalId);
    if (actor !== ActorType.USER) throw new BadRequestError({ message: "Must be a user" });

    const policy = await $findSecretChangePolicyOrThrow(approvalRequest.policyId);
    await $assertCanActOnRequest({ approvalRequest, actorId, actorAuthMethod, actorOrgId, action: "update" });

    const alreadyInStatusMessage =
      status === RequestState.Open ? "Approval request is already open" : "Approval request is already closed";
    if (secretChangeRequest.hasMerged) throw new BadRequestError({ message: "Approval request has been merged" });
    if (approvalRequest.status === status) throw new BadRequestError({ message: alreadyInStatusMessage });

    const updated = await approvalRequestDAL.transaction(async (tx) => {
      const lockedPolicy = await approvalPolicyDAL.findByIdForShare(policy.id, tx);
      if (!lockedPolicy) throw new BadRequestError({ message: POLICY_DELETED_MESSAGE });

      const locked = await approvalRequestDAL.findByIdForUpdate(approvalRequest.id, tx);
      if (!locked || locked.status !== approvalRequest.status) {
        throw new BadRequestError({ message: alreadyInStatusMessage });
      }
      if (locked.policyId !== policy.id) throw new BadRequestError({ message: POLICY_DELETED_MESSAGE });
      const lockedChangeRequest = await secretChangeRequestDAL.findOne({ approvalRequestId: approvalRequest.id }, tx);
      if (!lockedChangeRequest || lockedChangeRequest.hasMerged) {
        throw new BadRequestError({ message: "Approval request has been merged" });
      }

      const updatedApprovalRequest = await approvalRequestDAL.updateById(approvalRequest.id, { status }, tx);
      const updatedChangeRequest = await secretChangeRequestDAL.updateById(
        lockedChangeRequest.id,
        { statusChangedByUserId: actorId },
        tx
      );
      return { approvalRequest: updatedApprovalRequest, secretChangeRequest: updatedChangeRequest };
    });

    const action =
      status === RequestState.Open ? ChangeRequestWebhookAction.Reopened : ChangeRequestWebhookAction.Closed;
    try {
      const project = await projectDAL.findById(approvalRequest.projectId);
      const [folder] = await folderDAL.findSecretPathByFolderIds(approvalRequest.projectId, [
        secretChangeRequest.folderId
      ]);
      if (project && folder) {
        await queueChangeRequestWebhook({
          action,
          approvalRequest: updated.approvalRequest,
          secretChangeRequest: updated.secretChangeRequest,
          policy,
          project,
          environment: folder.environmentSlug,
          environmentName: folder.environmentName,
          secretPath: folder.path
        });
      } else {
        logger.warn(
          `Skipping change request webhook, project or folder not found [requestId=${approvalRequest.id}] [action=${action}]`
        );
      }
    } catch (error) {
      logger.error(
        error,
        `Failed to queue change request webhook [requestId=${approvalRequest.id}] [action=${action}]`
      );
    }

    return { ...toSecretChangeRequestBase(updated), policyId: policy.id, projectId: approvalRequest.projectId };
  };

  const getSecretApprovalDetails: TSecretChangeRequestMethods["getSecretApprovalDetails"] = async ({
    id,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }) => {
    if (actor === ActorType.SERVICE) throw new BadRequestError({ message: "Cannot use service token" });

    const { approvalRequest, secretChangeRequest } = await $findSecretChangeRequestOrThrow(id);
    const { projectId } = approvalRequest;
    const [folder] = await folderDAL.findSecretPathByFolderIds(projectId, [secretChangeRequest.folderId]);
    if (!folder) throw new NotFoundError({ message: `Secret approval request with ID '${id}' not found` });

    const { hasRole, permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const steps = await approvalRequestDAL.findStepsByRequestId(approvalRequest.id);
    const policy = approvalRequest.policyId
      ? await secretChangePolicyService.findSecretChangePolicyById(approvalRequest.policyId)
      : undefined;
    const bypassers = policy?.bypassers ?? [];
    const groupIds = unique(
      [...steps.flatMap((step) => step.approvers), ...bypassers].filter(isGroupActor).map((actorRef) => actorRef.id)
    );
    const groupMembers = groupIds.length ? await userGroupMembershipDAL.find({ $in: { groupId: groupIds } }) : [];
    const userIdsByGroupId = groupUserIdsByGroupId(groupMembers);
    // The approvers are the ones recorded on the request's steps when it was opened, which is what reviews and
    // merges are gated on and what remains once the policy has been deleted.
    const approverUserIds = resolveActorUserIds(
      steps.flatMap((step) => step.approvers),
      userIdsByGroupId
    );
    const bypasserUserIds = resolveActorUserIds(bypassers, userIdsByGroupId);
    const isReviewer = approverUserIds.includes(actorId);

    const canReadApprovalRequests = permission.can(
      ProjectPermissionSecretApprovalRequestActions.Read,
      ProjectPermissionSub.SecretApprovalRequest
    );
    if (
      !canReadApprovalRequests &&
      !hasRole(ProjectMembershipRole.Admin) &&
      approvalRequest.requesterId !== actorId &&
      approvalRequest.machineIdentityId !== actorId &&
      !isReviewer
    ) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
    }

    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });

    const reviews = steps.flatMap((step) => step.approvals);
    const userIds = unique(
      [
        ...approverUserIds,
        ...bypasserUserIds,
        ...reviews.map((review) => review.approverUserId),
        secretChangeRequest.statusChangedByUserId,
        approvalRequest.requesterId
      ].filter((userId): userId is string => Boolean(userId))
    );
    const [users, memberships] = userIds.length
      ? await Promise.all([
          userDAL.find({ $in: { id: userIds } }),
          membershipUserDAL.find({
            scope: AccessScope.Organization,
            scopeOrgId: project.orgId,
            $in: { actorUserId: userIds }
          })
        ])
      : [[], []];
    const usersById = new Map(users.map((user) => [user.id, user]));
    const membershipActiveByUserId = new Map(
      memberships.flatMap((membership) =>
        membership.actorUserId ? [[membership.actorUserId, membership.isActive] as const] : []
      )
    );
    const findUser = (userId: string): TApprovalRequestUser | undefined => {
      const user = usersById.get(userId);
      return user ? toApprovalRequestUser(user) : undefined;
    };
    const withOrgMembership = (user: TApprovalRequestUser) => ({
      ...user,
      isOrgMembershipActive: membershipActiveByUserId.get(user.userId) ?? null
    });

    const policySummary: TSecretChangeRequestPolicySummary = policy
      ? {
          id: policy.id,
          name: policy.name,
          approvals: steps[0]?.requiredApprovals ?? 1,
          secretPath: policy.secretPath ?? null,
          enforcementLevel: policy.enforcementLevel,
          allowedSelfApprovals: policy.allowedSelfApprovals,
          deletedAt: null
        }
      : toDeletedSecretChangePolicyStub(approvalRequest, steps);

    const commits = await secretChangeRequestDAL.findBySecretChangeIdBridgeSecretV2(secretChangeRequest.id);
    const { decryptor } = await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

    return {
      ...toSecretChangeRequestBase({ approvalRequest, secretChangeRequest }),
      projectId,
      environment: folder.environmentSlug,
      secretPath: folder.path,
      policy: {
        ...policySummary,
        approvers: approverUserIds.flatMap((userId) => {
          const user = findUser(userId);
          return user ? [withOrgMembership(user)] : [];
        }),
        bypassers: bypasserUserIds.flatMap((userId) => {
          const user = findUser(userId);
          return user ? [user] : [];
        })
      },
      statusChangedByUser: secretChangeRequest.statusChangedByUserId
        ? findUser(secretChangeRequest.statusChangedByUserId)
        : undefined,
      committerUser: approvalRequest.requesterId
        ? (findUser(approvalRequest.requesterId) ?? {
            userId: approvalRequest.requesterId,
            email: approvalRequest.requesterEmail,
            username: approvalRequest.requesterEmail,
            firstName: approvalRequest.requesterName,
            lastName: null
          })
        : null,
      committerIdentity: approvalRequest.machineIdentityId
        ? { identityId: approvalRequest.machineIdentityId, name: approvalRequest.requesterName }
        : null,
      reviewers: reviews.flatMap((review) => {
        const user = findUser(review.approverUserId);
        return user
          ? [
              {
                ...withOrgMembership(user),
                status: review.decision,
                comment: review.comment ?? "",
                createdAt: review.createdAt ?? new Date()
              }
            ]
          : [];
      }),
      commits: formatSecretApprovalCommitsV2Bridge({
        commits,
        decryptor,
        canReadSecretValue: buildSecretApprovalCommitValueAccess({
          permission,
          isReviewer,
          isRequestOpen: approvalRequest.status === ApprovalRequestStatus.Open,
          environment: folder.environmentSlug,
          secretPath: folder.path
        })
      })
    };
  };

  const listSecretChangeRequests: TSecretChangeRequestMethods["listSecretChangeRequests"] = async (filter) => {
    const { rows, totalCount } = await secretChangeRequestDAL.findByProjectId(filter);
    if (!rows.length) return { approvals: [], totalCount };

    const [stepsByRequestId, commits, bypassersByPolicyId] = await Promise.all([
      approvalRequestDAL.findStepsByRequestIds(rows.map((row) => row.id)),
      secretChangeRequestDAL.findCommitsBySecretChangeIds(rows.map((row) => row.secretChangeId)),
      approvalPolicyDAL.findBypassersByPolicyIds(
        unique(rows.map((row) => row.policyId).filter((policyId): policyId is string => Boolean(policyId)))
      )
    ]);
    const steps = Object.values(stepsByRequestId).flat();
    const groupIds = unique(
      [...steps.flatMap((step) => step.approvers), ...Object.values(bypassersByPolicyId).flat()]
        .filter(isGroupActor)
        .map((actorRef) => actorRef.id)
    );
    const groupMembers = groupIds.length ? await userGroupMembershipDAL.find({ $in: { groupId: groupIds } }) : [];
    const userIdsByGroupId = groupUserIdsByGroupId(groupMembers);
    const commitsBySecretChangeId = groupBy(commits, (commit) => commit.secretChangeId);

    return {
      approvals: rows.map((row) =>
        toSecretChangeRequestListItem({
          row,
          steps: stepsByRequestId[row.id] ?? [],
          commits: commitsBySecretChangeId[row.secretChangeId] ?? [],
          bypassers: row.policyId ? (bypassersByPolicyId[row.policyId] ?? []) : [],
          userIdsByGroupId
        })
      ),
      totalCount
    };
  };

  const countSecretChangeRequests: TSecretChangeRequestMethods["countSecretChangeRequests"] = ({
    projectId,
    userId,
    policyId
  }) => secretChangeRequestDAL.countByProjectId(projectId, userId, policyId);

  const $resolveRequestAccessFilter = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: Pick<TListApprovalsDTO, "projectId" | "actor" | "actorId" | "actorAuthMethod" | "actorOrgId">) => {
    if (actor === ActorType.SERVICE) throw new BadRequestError({ message: "Cannot use service token" });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const canReadAllApprovalRequests = permission.can(
      ProjectPermissionSecretApprovalRequestActions.Read,
      ProjectPermissionSub.SecretApprovalRequest
    );
    return canReadAllApprovalRequests ? undefined : actorId;
  };

  const requestCount = async ({ projectId, policyId, ...actorDto }: TApprovalRequestCountDTO) => {
    const userId = await $resolveRequestAccessFilter({ projectId, ...actorDto });
    return countSecretChangeRequests({ projectId, userId, policyId });
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
    const userId = await $resolveRequestAccessFilter({ projectId, actor, actorId, actorAuthMethod, actorOrgId });

    const page = await listSecretChangeRequests({
      projectId,
      committer,
      environment,
      status,
      userId,
      search,
      orderBy,
      orderDirection,
      limit,
      offset
    });

    const folderIds = unique(page.approvals.map((el) => el.folderId));
    const folders = folderIds.length ? await folderDAL.findSecretPathByFolderIds(projectId, folderIds) : [];
    const folderById = groupByUnique(
      folders.filter((el) => el !== undefined),
      (el) => el.id
    );

    return {
      ...page,
      approvals: page.approvals.map((el) => ({
        ...el,
        secretPath: folderById[el.folderId]?.path ?? "/"
      }))
    };
  };

  return {
    findFolderIdsWithOpenRequests,
    generateSecretApprovalRequestV2Bridge,
    createSecretApprovalRequestV2Bridge,
    createSecretApprovalSideEffects,
    mergeSecretApprovalRequest,
    reviewApproval,
    updateApprovalStatus,
    getSecretApprovalDetails,
    getSecretApprovals,
    requestCount
  };
};
