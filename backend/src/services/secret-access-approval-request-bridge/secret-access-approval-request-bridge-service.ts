import { subject } from "@casl/ability";

import { ActionProjectType, ProjectMembershipRole } from "@app/db/schemas";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { verifyRequestedPermissions } from "@app/ee/services/access-approval-request/access-approval-request-fns";
import { ApprovalStatus } from "@app/ee/services/access-approval-request/access-approval-request-types";
import { flattenActiveRolesFromMemberships } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionMemberActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { isGlobSubsetOfGlob } from "@app/lib/casl/glob-subset";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { QueueJobs, QueueName } from "@app/queue";
import {
  ApprovalPolicyType,
  ApprovalRequestApprovalDecision,
  ApprovalRequestGrantStatus,
  ApprovalRequestStatus,
  ApprovalRequestStepStatus
} from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalRequest } from "@app/services/approval-policy/approval-policy-types";
import { createApprovalRequestWithSteps } from "@app/services/approval-policy/approval-request-fns";
import {
  getSecretAccessRequestData,
  hasSameAccessCriteria,
  parseSecretAccessRequestData,
  validateSecretAccessConstraints
} from "@app/services/approval-policy/secret-access/secret-access-policy-fns";
import { TSecretAccessRequestData } from "@app/services/approval-policy/secret-access/secret-access-policy-types";
import { ActorType } from "@app/services/auth/auth-type";
import { AccessRequestWebhookAction, WebhookEvents } from "@app/services/webhook/webhook-types";

import {
  collectSecretAccessPolicyGroupIds,
  collectSecretAccessRequestUserIds,
  composeSecretAccessRequestRows,
  isPolicySubjectMatch,
  notifySecretAccessBypass,
  notifySecretAccessStepApprovers,
  toLegacyAccessApprovalRequest
} from "./secret-access-approval-request-bridge-fns";
import {
  TCountSecretAccessApprovalRequestsDTO,
  TCreateSecretAccessApprovalRequestDTO,
  TListSecretAccessApprovalRequestsDTO,
  TReviewSecretAccessApprovalRequestDTO,
  TRevokeSecretAccessApprovalRequestDTO,
  TSecretAccessApprovalRequestBridgeServiceFactoryDep
} from "./secret-access-approval-request-bridge-types";

export type TSecretAccessApprovalRequestBridgeServiceFactory = ReturnType<
  typeof secretAccessApprovalRequestBridgeServiceFactory
>;

export const secretAccessApprovalRequestBridgeServiceFactory = ({
  projectDAL,
  permissionService,
  userDAL,
  userGroupMembershipDAL,
  approvalRequestDAL,
  approvalRequestStepsDAL,
  approvalRequestStepEligibleApproversDAL,
  approvalRequestApprovalsDAL,
  approvalRequestGrantsDAL,
  additionalPrivilegeDAL,
  secretAccessApprovalPolicyBridgeDAL,
  secretAccessApprovalRequestBridgeDAL,
  smtpService,
  notificationService,
  kmsService,
  projectSlackConfigDAL,
  microsoftTeamsService,
  projectMicrosoftTeamsConfigDAL,
  queueService,
  secretAccessApprovalResource
}: TSecretAccessApprovalRequestBridgeServiceFactoryDep) => {
  const $findPolicyById = async (policyId: string, message: string) => {
    const [policy] = await secretAccessApprovalPolicyBridgeDAL.findSecretAccessPolicies({ policyId });
    if (!policy) throw new NotFoundError({ message });
    return policy;
  };

  const $findRequestById = async (requestId: string) => {
    const request = await secretAccessApprovalRequestBridgeDAL.findSecretAccessRequestById(requestId);
    if (!request) throw new NotFoundError({ message: `Access request with ID '${requestId}' not found` });
    return request;
  };

  const $findRequestByIdFromPrimary = async (requestId: string) => {
    const request = await approvalRequestDAL.transaction((tx) =>
      secretAccessApprovalRequestBridgeDAL.findSecretAccessRequestById(requestId, tx)
    );
    if (!request) throw new NotFoundError({ message: `Access request with ID '${requestId}' not found` });
    return request;
  };

  const $getActorGroupIds = async (actorId: string, orgId: string) => {
    const groups = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(actorId, orgId);
    return new Set(groups.map((group) => group.groupId));
  };

  const $loadRequestRows = async (filter: { projectId: string; policyId?: string; requesterId?: string }) => {
    const requests = await secretAccessApprovalRequestBridgeDAL.findSecretAccessRequests(filter);
    if (!requests.length) return [];

    const requestIds = requests.map((request) => request.id);
    const [policies, grants, approvals] = await Promise.all([
      secretAccessApprovalPolicyBridgeDAL.findSecretAccessPolicies({ projectId: filter.projectId }),
      secretAccessApprovalRequestBridgeDAL.findGrantsByRequestIds(requestIds),
      secretAccessApprovalRequestBridgeDAL.findApprovalsByRequestIds(requestIds)
    ]);

    const [privileges, groupMembers] = await Promise.all([
      secretAccessApprovalRequestBridgeDAL.findPrivilegesByGrantIds(grants.map((grant) => grant.id)),
      secretAccessApprovalRequestBridgeDAL.findGroupMembers(collectSecretAccessPolicyGroupIds(policies))
    ]);

    const userIds = collectSecretAccessRequestUserIds({ requests, policies, grants, approvals, groupMembers });
    const [users, orgMemberships] = await Promise.all([
      secretAccessApprovalRequestBridgeDAL.findUsersByIds(userIds),
      secretAccessApprovalRequestBridgeDAL.findOrgMembershipActivity(requests[0].organizationId, userIds)
    ]);

    return composeSecretAccessRequestRows({
      requests,
      policies,
      grants,
      privileges,
      approvals,
      groupMembers,
      users,
      orgMemberships
    });
  };

  const listAccessApprovalRequests = async ({ projectId }: TListSecretAccessApprovalRequestsDTO) => {
    const rows = await $loadRequestRows({ projectId });

    return rows.flatMap((row) => {
      if (!row.policy || !row.environment || !row.requestedByUser) return [];
      const data = parseSecretAccessRequestData(row.request.requestData);
      if (!data) return [];

      const legacy = toLegacyAccessApprovalRequest(
        { ...row.request, grant: row.grant, privilegeId: row.privilegeId },
        row.approvedByUser?.userId ?? null
      );
      const { approvers, bypassers, ...policy } = row.policy;

      return [
        {
          ...legacy,
          projectId,
          environment: row.environment.slug,
          environmentName: row.environment.name,
          policy: { ...policy, approvers, bypassers },
          requestedByUser: row.requestedByUser,
          approvedByUser: row.approvedByUser,
          revokedByUser: row.revokedByUser,
          privilege: legacy.privilegeId ? row.privilege : null,
          isApproved: legacy.status === ApprovalStatus.APPROVED,
          reviewers: row.reviewers,
          approvers,
          bypassers
        }
      ];
    });
  };

  const countAccessApprovalRequests = async ({
    projectId,
    policyId,
    requesterId
  }: TCountSecretAccessApprovalRequestsDTO) => {
    const rows = await $loadRequestRows({ projectId, policyId, requesterId });
    const now = new Date();

    const isPending = (row: (typeof rows)[number]) =>
      Boolean(row.policy) &&
      row.request.status === ApprovalRequestStatus.Pending &&
      !row.reviewers.some((reviewer) => reviewer.status === ApprovalRequestApprovalDecision.Rejected) &&
      !(row.request.expiresAt && new Date(row.request.expiresAt) < now);

    const pendingCount = rows.filter(isPending).length;
    return { pendingCount, finalizedCount: rows.length - pendingCount };
  };

  const $queueAccessRequestWebhook = async ({
    action,
    request,
    project,
    policy,
    requestedByUser,
    envName,
    isBypassed = false
  }: {
    action: AccessRequestWebhookAction;
    request: ReturnType<typeof toLegacyAccessApprovalRequest>;
    project: { id: string; name: string; orgId: string };
    policy: { id: string; name: string; enforcementLevel: string; hasSequencedApprovers: boolean };
    requestedByUser: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      username: string;
      email?: string | null;
    };
    envName: string;
    isBypassed?: boolean;
  }) => {
    try {
      const { envSlug, secretPath, requestedPermissions } = verifyRequestedPermissions({
        permissions: request.permissions
      });
      const cfg = getConfig();

      await queueService.queue(
        QueueName.SecretWebhook,
        QueueJobs.SecWebhook,
        {
          type: WebhookEvents.AccessRequestModified,
          payload: {
            projectId: project.id,
            projectName: project.name,
            environment: envSlug,
            environmentName: envName,
            secretPath,
            action,
            request: {
              id: request.id,
              url: `${cfg.SITE_URL}/organizations/${project.orgId}/projects/secret-management/${project.id}/approval?selectedTab=resource-requests&requestId=${request.id}`,
              status: request.status,
              isBypassed,
              policy: {
                id: policy.id,
                name: policy.name,
                enforcementLevel: policy.enforcementLevel,
                hasSequencedApprovers: policy.hasSequencedApprovers
              },
              requestedAccess: {
                isTemporary: request.isTemporary,
                temporaryRange: request.temporaryRange,
                permissions: requestedPermissions
              },
              requestedBy: {
                type: ActorType.USER,
                id: requestedByUser.id,
                name:
                  [requestedByUser.firstName, requestedByUser.lastName].filter(Boolean).join(" ") ||
                  requestedByUser.username,
                email: requestedByUser.email ?? null
              },
              expiresAt: request.expiresAt?.toISOString() ?? null,
              approvedAt: request.approvedAt?.toISOString() ?? null,
              revokedAt: request.revokedAt?.toISOString() ?? null,
              createdAt: request.createdAt.toISOString(),
              updatedAt: request.updatedAt.toISOString()
            }
          }
        },
        {
          jobId: `access-request-webhook-${request.id}-${alphaNumericNanoId(6)}`,
          removeOnFail: { count: 5 },
          removeOnComplete: true,
          delay: 1000,
          attempts: 5,
          backoff: { type: "exponential", delay: 3000 }
        }
      );
    } catch (error) {
      logger.error(error, `Failed to queue access request webhook [requestId=${request.id}] [action=${action}]`);
    }
  };

  const isGlobalAccessApprovalRequest = async (requestId: string) =>
    Boolean(await approvalRequestDAL.findOne({ id: requestId, type: ApprovalPolicyType.SecretAccess }));

  const createAccessApprovalRequest = async ({
    policy,
    projectId,
    envId,
    envSlug,
    envName,
    secretPath,
    requestedByUserId,
    actorOrgId,
    permissions,
    isTemporary,
    temporaryRange,
    note
  }: TCreateSecretAccessApprovalRequestDTO) => {
    const requestData: TSecretAccessRequestData = {
      permissions,
      isTemporary,
      temporaryRange: temporaryRange || null
    };

    if (isTemporary && !temporaryRange) {
      throw new BadRequestError({ message: "A temporary range is required for temporary requests" });
    }

    const constraintValidation = secretAccessApprovalResource.validateConstraints(policy, requestData);
    if (!constraintValidation.valid) {
      throw new BadRequestError({ message: constraintValidation.errors?.join("; ") ?? "Policy constraints not met" });
    }

    const [requestedByUser, project] = await Promise.all([
      userDAL.findById(requestedByUserId),
      projectDAL.findById(projectId)
    ]);
    if (!requestedByUser) throw new ForbiddenRequestError({ message: "User not found" });
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
    if (!policy.steps.length) {
      throw new BadRequestError({ message: `Policy '${policy.name}' has no approvers configured` });
    }

    const activeGrant = await secretAccessApprovalResource.canAccess(projectId, requestedByUserId, {
      envId,
      secretPath,
      permissions,
      isTemporary
    });
    if (activeGrant) {
      throw new BadRequestError({ message: "You already have an active privilege with the same criteria" });
    }

    const pendingRequests = await secretAccessApprovalRequestBridgeDAL.findPendingRequests({
      policyId: policy.id,
      requesterId: requestedByUserId
    });
    const pendingDuplicate = pendingRequests.find((request) =>
      hasSameAccessCriteria(parseSecretAccessRequestData(request.requestData), { permissions, isTemporary })
    );
    if (pendingDuplicate) {
      throw new BadRequestError({ message: "You already have a pending access request with the same criteria" });
    }

    const { requestExpirationTime } = policy.constraints.constraints;
    const parsedMs = requestExpirationTime ? ms(requestExpirationTime) : null;
    const expiresAt = parsedMs && !Number.isNaN(parsedMs) ? new Date(Date.now() + parsedMs) : null;

    const created = await approvalRequestDAL.transaction((tx) =>
      createApprovalRequestWithSteps(
        {
          projectId,
          organizationId: actorOrgId,
          policyId: policy.id,
          policyType: ApprovalPolicyType.SecretAccess,
          policySteps: policy.steps,
          requestData,
          justification: note || null,
          expiresAt,
          requesterUserId: requestedByUserId,
          requesterName:
            `${requestedByUser.firstName ?? ""} ${requestedByUser.lastName ?? ""}`.trim() || requestedByUser.username,
          requesterEmail: requestedByUser.email || requestedByUser.username
        },
        { approvalRequestDAL, approvalRequestStepsDAL, approvalRequestStepEligibleApproversDAL },
        tx
      )
    );

    const request = await $findRequestById(created.id);
    await notifySecretAccessStepApprovers(
      {
        step: policy.steps[0],
        request,
        project,
        requestedByUser,
        data: requestData,
        environment: { slug: envSlug },
        secretPath
      },
      {
        userDAL,
        userGroupMembershipDAL,
        projectDAL,
        projectSlackConfigDAL,
        kmsService,
        microsoftTeamsService,
        projectMicrosoftTeamsConfigDAL,
        notificationService,
        smtpService
      }
    );

    const legacyRequest = toLegacyAccessApprovalRequest(request);

    await $queueAccessRequestWebhook({
      action: AccessRequestWebhookAction.Created,
      request: legacyRequest,
      project,
      policy: { ...policy, hasSequencedApprovers: policy.steps.length > 1 },
      requestedByUser,
      envName
    });

    return { request: legacyRequest, projectId };
  };

  const reviewAccessApprovalRequest = async ({
    requestId,
    status,
    bypassReason,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TReviewSecretAccessApprovalRequestDTO) => {
    const request = await $findRequestById(requestId);
    if (!request.policyId) {
      throw new BadRequestError({ message: "The policy associated with this access request has been deleted." });
    }
    const policy = await $findPolicyById(
      request.policyId,
      "The policy associated with this access request has been deleted."
    );
    if (!request.requesterId) {
      throw new NotFoundError({ message: "The user who created this access request no longer exists" });
    }

    const { memberships } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: request.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    // A user whose only active project role is NoAccess is not authorized to review the request,
    // even with a break-glass approval. If they also hold another active role (e.g. via a group),
    // allow the review to proceed.
    const activeRoles = flattenActiveRolesFromMemberships(memberships, ProjectMembershipRole.Custom);
    const hasOnlyNoAccessRole =
      activeRoles.length > 0 && activeRoles.every((r) => r.role === ProjectMembershipRole.NoAccess);
    if (hasOnlyNoAccessRole) {
      throw new ForbiddenRequestError({ message: "You are not authorized to review this request" });
    }

    if (request.status !== ApprovalRequestStatus.Pending) {
      throw new BadRequestError({ message: "The request has been closed" });
    }
    if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
      await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Expired });
      throw new BadRequestError({ message: "This access request has expired and can no longer be reviewed" });
    }

    const data = getSecretAccessRequestData(request);
    if (status === ApprovalStatus.APPROVED) {
      const { envSlug, secretPath } = verifyRequestedPermissions({ permissions: data.permissions });
      if (!policy.environments.some((environment) => environment.slug === envSlug)) {
        throw new BadRequestError({
          message: `The policy is no longer attached to environment '${envSlug}'.`
        });
      }
      // picomatch treats the requested glob as a literal path, so "/apps/**" would look covered by "/apps/*".
      if (!isGlobSubsetOfGlob(policy.secretPath, secretPath)) {
        throw new BadRequestError({
          message: `The policy no longer covers secret path '${secretPath}'.`
        });
      }
    }

    const isSelfReview = actorId === request.requesterId;
    const isApproving = status === ApprovalStatus.APPROVED;
    const isBreakGlassAttempt = bypassReason !== undefined;
    if (isBreakGlassAttempt && !isApproving) {
      throw new BadRequestError({ message: "A bypass reason can only be provided when approving a request" });
    }
    if (isSelfReview && isApproving && !policy.allowedSelfApprovals && !isBreakGlassAttempt) {
      throw new BadRequestError({
        message: "Failed to review access approval request. Users are not authorized to review their own request."
      });
    }

    const actorGroupIds = await $getActorGroupIds(actorId, actorOrgId);

    const [project, requestedByUser] = await Promise.all([
      projectDAL.findById(request.projectId),
      userDAL.findById(request.requesterId)
    ]);
    if (!project) {
      throw new NotFoundError({ message: "The project associated with this access request was not found." });
    }

    const $queueReviewedWebhook = async (isBypassed: boolean) => {
      if (!requestedByUser) {
        logger.warn(
          `Skipping access request webhook, requester not found [requestId=${requestId}] [action=${AccessRequestWebhookAction.Reviewed}]`
        );
        return;
      }
      try {
        const reviewed = await $findRequestByIdFromPrimary(requestId);
        await $queueAccessRequestWebhook({
          action: AccessRequestWebhookAction.Reviewed,
          request: toLegacyAccessApprovalRequest(reviewed),
          project,
          policy: { ...policy, hasSequencedApprovers: policy.approvers.some((a) => (a.sequence ?? 1) > 1) },
          requestedByUser,
          envName: policy.environment.name,
          isBypassed
        });
      } catch (error) {
        logger.error(
          error,
          `Failed to queue access request webhook [requestId=${requestId}] [action=${AccessRequestWebhookAction.Reviewed}]`
        );
      }
    };

    if (isBreakGlassAttempt) {
      const trimmedBypassReason = bypassReason.trim();
      if (trimmedBypassReason.length < 10) {
        throw new BadRequestError({
          message: "A bypass reason of at least 10 characters is required to bypass approvals"
        });
      }

      const isEligible =
        actor === ActorType.USER &&
        isSelfReview &&
        (await secretAccessApprovalResource.isBreakGlassEligible({
          policy,
          bypassers: policy.bypassers,
          actor: { id: actorId },
          userGroupIds: actorGroupIds
        }));
      if (!isEligible) {
        throw new ForbiddenRequestError({ message: "You are not permitted to bypass approval on this request" });
      }

      const constraintValidation = validateSecretAccessConstraints({ maxTimePeriod: policy.maxTimePeriod }, data);
      if (!constraintValidation.valid) {
        throw new BadRequestError({
          message: `Policy constraints not met: ${constraintValidation.errors?.join("; ") ?? "unknown"}`
        });
      }

      const approval = await approvalRequestDAL.transaction(async (tx) => {
        const locked = await approvalRequestDAL.findByIdForUpdate(requestId, tx);
        if (!locked || locked.status !== ApprovalRequestStatus.Pending) {
          throw new BadRequestError({ message: "The request has been closed" });
        }
        if (locked.expiresAt && new Date(locked.expiresAt) < new Date()) {
          throw new BadRequestError({ message: "This access request has expired and can no longer be reviewed" });
        }

        const steps = await approvalRequestStepsDAL.find({ requestId }, { tx, sort: [["stepNumber", "asc"]] });
        const currentStep = steps.find((step) => step.stepNumber === locked.currentStep);
        if (!currentStep) throw new BadRequestError({ message: "Current step not found" });

        const completedAt = new Date();
        await Promise.all(
          steps.map((step) =>
            approvalRequestStepsDAL.updateById(
              step.id,
              { status: ApprovalRequestStepStatus.Completed, completedAt },
              tx
            )
          )
        );

        const stepApprovals = await approvalRequestApprovalsDAL.find({ stepId: currentStep.id }, { tx });
        const bypassApproval =
          stepApprovals.find((a) => a.approverUserId === actorId) ??
          (await approvalRequestApprovalsDAL.create(
            {
              stepId: currentStep.id,
              approverUserId: actorId,
              decision: ApprovalRequestApprovalDecision.Approved
            },
            tx
          ));

        const approved = await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Approved }, tx);
        await secretAccessApprovalResource.postApprovalTxRoutine(approved as TApprovalRequest, tx, {
          bypassReason: trimmedBypassReason
        });

        return bypassApproval;
      });

      const actingUser = await userDAL.findById(actorId);
      if (actingUser) {
        await notifySecretAccessBypass(
          {
            request,
            project,
            policy,
            actingUser,
            environmentName: policy.environment.name,
            bypassReason: trimmedBypassReason
          },
          { userDAL, userGroupMembershipDAL, notificationService, smtpService }
        );
      }

      await $queueReviewedWebhook(true);

      const createdAt = approval.createdAt ?? new Date();
      return {
        id: approval.id,
        requestId,
        reviewerUserId: approval.approverUserId,
        status: approval.decision,
        createdAt,
        updatedAt: createdAt,
        projectId: request.projectId,
        policyId: policy.id,
        isBypass: true
      };
    }

    const { approval, nextStep } = await approvalRequestDAL.transaction(async (tx) => {
      const locked = await approvalRequestDAL.findByIdForUpdate(requestId, tx);
      if (!locked || locked.status !== ApprovalRequestStatus.Pending) {
        throw new BadRequestError({ message: "The request has been closed" });
      }

      if (locked.expiresAt && new Date(locked.expiresAt) < new Date()) {
        throw new BadRequestError({ message: "This access request has expired and can no longer be reviewed" });
      }

      const steps = await approvalRequestStepsDAL.find({ requestId }, { tx, sort: [["stepNumber", "asc"]] });
      const currentStepIndex = steps.findIndex((step) => step.stepNumber === locked.currentStep);
      const currentStep = steps[currentStepIndex];
      if (!currentStep) throw new BadRequestError({ message: "Current step not found" });

      const eligibleApprovers = await approvalRequestStepEligibleApproversDAL.find({ stepId: currentStep.id }, { tx });
      const stepApprovers = eligibleApprovers.map((approver) => ({
        type: approver.userId ? ApproverType.User : ApproverType.Group,
        id: (approver.userId || approver.groupId) as string
      }));

      const isSelfRejection = isSelfReview && !isApproving;
      if (!isSelfRejection && !isPolicySubjectMatch(stepApprovers, actorId, actorGroupIds)) {
        throw new BadRequestError({ message: "You are not a reviewer in this step" });
      }

      const stepApprovals = await approvalRequestApprovalsDAL.find({ stepId: currentStep.id }, { tx });
      if (stepApprovals.some((a) => a.approverUserId === actorId)) {
        throw new BadRequestError({ message: "You have already reviewed this request" });
      }

      const createdApproval = await approvalRequestApprovalsDAL.create(
        {
          stepId: currentStep.id,
          approverUserId: actorId,
          decision: isApproving ? ApprovalRequestApprovalDecision.Approved : ApprovalRequestApprovalDecision.Rejected
        },
        tx
      );

      if (!isApproving) {
        await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Rejected }, tx);
        return { approval: createdApproval, nextStep: null };
      }

      const approvedCount =
        stepApprovals.filter((a) => a.decision === ApprovalRequestApprovalDecision.Approved).length + 1;
      if (approvedCount < currentStep.requiredApprovals) {
        return { approval: createdApproval, nextStep: null };
      }

      await approvalRequestStepsDAL.updateById(
        currentStep.id,
        { status: ApprovalRequestStepStatus.Completed, completedAt: new Date() },
        tx
      );

      const upcomingStep = steps[currentStepIndex + 1];
      if (upcomingStep) {
        await approvalRequestDAL.updateById(requestId, { currentStep: locked.currentStep + 1 }, tx);
        await approvalRequestStepsDAL.updateById(
          upcomingStep.id,
          { status: ApprovalRequestStepStatus.InProgress, startedAt: new Date() },
          tx
        );
        const upcomingApprovers = await approvalRequestStepEligibleApproversDAL.find(
          { stepId: upcomingStep.id },
          { tx }
        );
        return {
          approval: createdApproval,
          nextStep: {
            requiredApprovals: upcomingStep.requiredApprovals,
            approvers: upcomingApprovers.map((approver) => ({
              type: approver.userId ? ApproverType.User : ApproverType.Group,
              id: (approver.userId || approver.groupId) as string
            }))
          }
        };
      }

      await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Approved }, tx);
      await secretAccessApprovalResource.postApprovalTxRoutine(locked as TApprovalRequest, tx);

      return { approval: createdApproval, nextStep: null };
    });

    if (nextStep) {
      if (requestedByUser) {
        await notifySecretAccessStepApprovers(
          {
            step: nextStep,
            request,
            project,
            requestedByUser,
            data,
            environment: policy.environment,
            secretPath: policy.secretPath
          },
          {
            userDAL,
            userGroupMembershipDAL,
            projectDAL,
            projectSlackConfigDAL,
            kmsService,
            microsoftTeamsService,
            projectMicrosoftTeamsConfigDAL,
            notificationService,
            smtpService
          }
        );
      }
    }

    await $queueReviewedWebhook(false);

    const createdAt = approval.createdAt ?? new Date();
    return {
      id: approval.id,
      requestId,
      reviewerUserId: approval.approverUserId,
      status: approval.decision,
      createdAt,
      updatedAt: createdAt,
      projectId: request.projectId,
      policyId: policy.id,
      isBypass: false
    };
  };

  const revokeAccessApprovalRequest = async ({
    requestId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TRevokeSecretAccessApprovalRequestDTO) => {
    const request = await $findRequestById(requestId);
    if (!request.requesterId) {
      throw new NotFoundError({ message: "The user who created this access request no longer exists" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: request.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const targetUser = await userDAL.findById(request.requesterId);
    if (!targetUser) throw new NotFoundError({ message: "Target user not found" });

    const memberSubject = subject(ProjectPermissionSub.Member, { userEmail: targetUser.email ?? undefined });
    const canAssignAdditionalPrivileges = permission.can(
      ProjectPermissionMemberActions.AssignAdditionalPrivileges,
      memberSubject
    );
    const canGrantPrivilegesLegacy = permission.can(ProjectPermissionMemberActions.GrantPrivileges, memberSubject);

    const [policy] = request.policyId
      ? await secretAccessApprovalPolicyBridgeDAL.findSecretAccessPolicies({ policyId: request.policyId })
      : [];

    let isApprover = false;
    if (!canAssignAdditionalPrivileges && !canGrantPrivilegesLegacy && policy) {
      const actorGroupIds = await $getActorGroupIds(actorId, actorOrgId);
      isApprover = isPolicySubjectMatch(policy.approvers, actorId, actorGroupIds);
    }

    if (!canAssignAdditionalPrivileges && !canGrantPrivilegesLegacy && !isApprover) {
      throw new ForbiddenRequestError({
        message: "You do not have permission to revoke additional privileges for this user"
      });
    }

    const { grant } = request;
    if (
      request.status !== ApprovalRequestStatus.Approved ||
      !grant ||
      grant.status !== ApprovalRequestGrantStatus.Active
    ) {
      throw new BadRequestError({ message: "Only approved requests can be revoked" });
    }

    await approvalRequestDAL.transaction(async (tx) => {
      const locked = await approvalRequestGrantsDAL.findByIdForUpdate(grant.id, tx);
      if (!locked || locked.status !== ApprovalRequestGrantStatus.Active) {
        throw new BadRequestError({ message: "Only approved requests can be revoked" });
      }
      await approvalRequestGrantsDAL.updateById(
        grant.id,
        { status: ApprovalRequestGrantStatus.Revoked, revokedAt: new Date(), revokedByUserId: actorId },
        tx
      );
      await additionalPrivilegeDAL.delete({ grantId: grant.id }, tx);
    });

    const revoked = toLegacyAccessApprovalRequest(await $findRequestByIdFromPrimary(requestId));

    const project = await projectDAL.findById(request.projectId);
    if (policy && project) {
      await $queueAccessRequestWebhook({
        action: AccessRequestWebhookAction.Revoked,
        request: revoked,
        project,
        policy: { ...policy, hasSequencedApprovers: policy.approvers.some((a) => (a.sequence ?? 1) > 1) },
        requestedByUser: targetUser,
        envName: policy.environment.name
      });
    } else {
      logger.warn(
        `Skipping access request webhook, policy or project not found [requestId=${requestId}] [action=${AccessRequestWebhookAction.Revoked}]`
      );
    }

    return { request: revoked, projectId: request.projectId };
  };

  return {
    isGlobalAccessApprovalRequest,
    listAccessApprovalRequests,
    countAccessApprovalRequests,
    createAccessApprovalRequest,
    reviewAccessApprovalRequest,
    revokeAccessApprovalRequest
  };
};
