import { ForbiddenError } from "@casl/ability";

import { TApprovalRequestGrants } from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ResourcePermissionPamResourceActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { OrgServiceActor } from "@app/lib/types";
import {
  TApprovalPolicyDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "@app/services/approval-policy/approval-policy-dal";
import {
  ApprovalPolicyType,
  ApprovalRequestApprovalDecision,
  ApprovalRequestGrantStatus,
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  ApproverType
} from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalRequestData } from "@app/services/approval-policy/approval-policy-types";
import {
  TApprovalRequestApprovalsDALFactory,
  TApprovalRequestDALFactory,
  TApprovalRequestGrantsDALFactory,
  TApprovalRequestStepEligibleApproversDALFactory,
  TApprovalRequestStepsDALFactory
} from "@app/services/approval-policy/approval-request-dal";
import {
  createApprovalRequestWithSteps,
  notifyApproversForStep
} from "@app/services/approval-policy/approval-request-fns";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { PamProductRole } from "../pam/pam-enums";
import { checkAccountAccess, checkFolderPermission, TActorContext, verifyProductMembership } from "../pam/pam-permission";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { TPamAccountTemplateDALFactory } from "../pam-account-template/pam-account-template-dal";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import {
  TCheckGrantDTO,
  TCreateAccessRequestDTO,
  TGetAccessRequestCountDTO,
  TGetApprovalConfigurationDTO,
  TListAccessRequestsDTO,
  TListPendingMyApprovalDTO,
  TPamAccessRequestData,
  TReviewAccessRequestDTO,
  TRevokeAccessRequestDTO,
  TSetApprovalConfigurationDTO
} from "./pam-access-request-types";

const PAM_FOLDER_SCOPE_TYPE = "pam-folder";

type TPamAccessRequestServiceFactoryDep = {
  approvalPolicyDAL: Pick<
    TApprovalPolicyDALFactory,
    | "find"
    | "findOne"
    | "create"
    | "updateById"
    | "deleteById"
    | "transaction"
    | "findStepsByPolicyId"
    | "isProjectApprover"
    | "findScopeIdsWithApprovers"
  >;
  approvalPolicyStepsDAL: Pick<TApprovalPolicyStepsDALFactory, "create" | "delete">;
  approvalPolicyStepApproversDAL: Pick<TApprovalPolicyStepApproversDALFactory, "create" | "delete">;
  approvalRequestDAL: Pick<
    TApprovalRequestDALFactory,
    | "find"
    | "findOne"
    | "findById"
    | "create"
    | "updateById"
    | "transaction"
    | "findStepsByRequestId"
    | "findByProjectId"
  >;
  approvalRequestStepsDAL: Pick<TApprovalRequestStepsDALFactory, "create" | "updateById">;
  approvalRequestStepEligibleApproversDAL: Pick<TApprovalRequestStepEligibleApproversDALFactory, "create">;
  approvalRequestApprovalsDAL: Pick<TApprovalRequestApprovalsDALFactory, "create">;
  approvalRequestGrantsDAL: Pick<TApprovalRequestGrantsDALFactory, "find" | "findOne" | "create" | "updateById">;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findByIdWithDetails" | "find">;
  pamAccountTemplateDAL: Pick<TPamAccountTemplateDALFactory, "find">;
  pamFolderDAL: Pick<TPamFolderDALFactory, "findById" | "find">;
  pamSessionDAL: Pick<TPamSessionDALFactory, "find" | "terminateSessionById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  smtpService: Pick<TSmtpService, "sendMail">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "findGroupMembershipsByUserIdInOrg">;
  userDAL: Pick<TUserDALFactory, "findById" | "find">;
};

export type TPamAccessRequestServiceFactory = ReturnType<typeof pamAccessRequestServiceFactory>;

export const pamAccessRequestServiceFactory = ({
  approvalPolicyDAL,
  approvalPolicyStepsDAL,
  approvalPolicyStepApproversDAL,
  approvalRequestDAL,
  approvalRequestStepsDAL,
  approvalRequestStepEligibleApproversDAL,
  approvalRequestApprovalsDAL,
  approvalRequestGrantsDAL,
  pamAccountDAL,
  pamAccountTemplateDAL,
  pamFolderDAL,
  pamSessionDAL,
  permissionService,
  notificationService,
  smtpService,
  userGroupMembershipDAL,
  userDAL
}: TPamAccessRequestServiceFactoryDep) => {
  const findFolderPolicy = async (folderId: string) => {
    const policy = await approvalPolicyDAL.findOne({
      type: ApprovalPolicyType.PamAccess,
      scopeType: PAM_FOLDER_SCOPE_TYPE,
      scopeId: folderId
    });
    return policy ?? null;
  };

  // Confirms the folder belongs to the project (guards cross-project IDOR) and that the actor may
  // manage its approval configuration. Used by every folder-scoped approval admin surface.
  const assertFolderPolicyManagement = async (folderId: string, projectId: string, ctx: TActorContext) => {
    const folder = await pamFolderDAL.findById(folderId);
    if (!folder || folder.projectId !== projectId) {
      throw new NotFoundError({ message: "Folder not found" });
    }
    const { permission } = await checkFolderPermission(permissionService, folderId, projectId, ctx);
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionPamResourceActions.ManagePolicies,
      ResourcePermissionSub.PamResource
    );
    return folder;
  };

  const getUserGroupIds = async (userId: string, orgId: string): Promise<Set<string>> => {
    const memberships = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(userId, orgId);
    return new Set(memberships.map((m) => m.groupId));
  };

  const enrichRequestsWithNames = async <T extends { requestData?: unknown }>(requests: T[]) => {
    const accountIds = new Set<string>();
    const folderIds = new Set<string>();
    for (const r of requests) {
      const data = r.requestData as { version: number; requestData: TPamAccessRequestData } | null;
      if (data?.requestData?.accountId) accountIds.add(data.requestData.accountId);
      if (data?.requestData?.folderId) folderIds.add(data.requestData.folderId);
    }

    const [accounts, folders] = await Promise.all([
      accountIds.size > 0 ? pamAccountDAL.find({ $in: { id: [...accountIds] } }) : [],
      folderIds.size > 0 ? pamFolderDAL.find({ $in: { id: [...folderIds] } }) : []
    ]);
    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const folderMap = new Map(folders.map((f) => [f.id, f]));

    const templateIds = [...new Set(accounts.map((a) => a.templateId).filter(Boolean))];
    const templates = templateIds.length > 0 ? await pamAccountTemplateDAL.find({ $in: { id: templateIds } }) : [];
    const templateTypeMap = new Map(templates.map((t) => [t.id, t.type]));

    return requests.map((r) => {
      const data = r.requestData as { version: number; requestData: TPamAccessRequestData } | null;
      const account = data?.requestData?.accountId ? accountMap.get(data.requestData.accountId) : null;
      const folder = data?.requestData?.folderId ? folderMap.get(data.requestData.folderId) : null;
      return {
        ...r,
        accountName: account?.name ?? null,
        accountType: account?.templateId ? (templateTypeMap.get(account.templateId) ?? null) : null,
        folderName: folder?.name ?? null
      };
    });
  };

  // Attach the access grant's expiry (when granted access ends) to each request. Requests
  // themselves carry no expiry; the meaningful "expires" is the grant created on approval.
  const attachGrantExpiry = async <T extends { id: string }>(requests: T[]) => {
    if (requests.length === 0) return requests.map((r) => ({ ...r, grantExpiresAt: null as Date | null }));

    const grants = await approvalRequestGrantsDAL.find({ $in: { requestId: requests.map((r) => r.id) } });
    const grantExpiryByRequestId = new Map<string, Date | null>(
      grants.filter((g) => g.requestId).map((g) => [g.requestId as string, g.expiresAt ?? null])
    );

    return requests.map((r) => ({ ...r, grantExpiresAt: grantExpiryByRequestId.get(r.id) ?? null }));
  };

  const isUserEligibleApprover = (
    approvers: { type: string; id: string }[],
    userId: string,
    userGroupIds: Set<string>
  ): boolean => {
    return approvers.some(
      (a) =>
        (a.type === ApproverType.User && a.id === userId) || (a.type === ApproverType.Group && userGroupIds.has(a.id))
    );
  };

  const getApprovalConfiguration = async ({ folderId, projectId, ...ctx }: TGetApprovalConfigurationDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);
    await assertFolderPolicyManagement(folderId, projectId, ctx);

    const policy = await findFolderPolicy(folderId);
    if (!policy) {
      return { policy: null, steps: [] };
    }

    const steps = await approvalPolicyDAL.findStepsByPolicyId(policy.id);
    return { policy, steps };
  };

  const setApprovalConfiguration = async ({ folderId, projectId, steps, ...ctx }: TSetApprovalConfigurationDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);
    await assertFolderPolicyManagement(folderId, projectId, ctx);

    if (steps.length > 1) {
      throw new BadRequestError({ message: "Phase 1 only supports a single approval step" });
    }

    const existingPolicy = await findFolderPolicy(folderId);

    const hasApprovers = steps.length === 1 && steps[0].approvers.length > 0;
    if (!hasApprovers && existingPolicy) {
      await approvalPolicyDAL.transaction(async (tx) => {
        await approvalPolicyStepsDAL.delete({ policyId: existingPolicy.id }, tx);
        await approvalPolicyDAL.deleteById(existingPolicy.id, tx);
      });
      return { policyId: existingPolicy.id };
    }

    if (!hasApprovers) {
      return { policyId: null };
    }

    if (existingPolicy) {
      await approvalPolicyDAL.transaction(async (tx) => {
        await approvalPolicyStepsDAL.delete({ policyId: existingPolicy.id }, tx);

        for (let i = 0; i < steps.length; i++) {
          const newStep = await approvalPolicyStepsDAL.create(
            {
              policyId: existingPolicy.id,
              stepNumber: i + 1,
              requiredApprovals: 1,
              notifyApprovers: true
            },
            tx
          );

          for (const approver of steps[i].approvers) {
            await approvalPolicyStepApproversDAL.create(
              {
                policyStepId: newStep.id,
                userId: approver.type === ApproverType.User ? approver.id : null,
                groupId: approver.type === ApproverType.Group ? approver.id : null
              },
              tx
            );
          }
        }
      });

      return { policyId: existingPolicy.id };
    }

    const newPolicy = await approvalPolicyDAL.transaction(async (tx) => {
      const policy = await approvalPolicyDAL.create(
        {
          projectId,
          organizationId: ctx.actorOrgId,
          type: ApprovalPolicyType.PamAccess,
          name: `PAM Folder Approval - ${folder.name}`,
          scopeType: PAM_FOLDER_SCOPE_TYPE,
          scopeId: folderId,
          enforcementLevel: "hard",
          conditions: { version: 1, conditions: [] },
          constraints: { version: 1, constraints: { accessDuration: { min: "30s", max: "7d" } } }
        },
        tx
      );

      for (let i = 0; i < steps.length; i++) {
        const step = await approvalPolicyStepsDAL.create(
          {
            policyId: policy.id,
            stepNumber: i + 1,
            requiredApprovals: 1,
            notifyApprovers: true
          },
          tx
        );

        for (const approver of steps[i].approvers) {
          await approvalPolicyStepApproversDAL.create(
            {
              policyStepId: step.id,
              userId: approver.type === ApproverType.User ? approver.id : null,
              groupId: approver.type === ApproverType.Group ? approver.id : null
            },
            tx
          );
        }
      }

      return policy;
    });

    return { policyId: newPolicy.id };
  };

  const createRequest = async ({ accountId, projectId, note, duration, ...ctx }: TCreateAccessRequestDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: "Account not found" });
    }

    await checkAccountAccess(
      permissionService,
      accountId,
      account.folderId,
      projectId,
      ResourcePermissionPamResourceActions.RequestAccess,
      ctx
    );

    const templateSettings = account.templateSettings as { requiresApproval?: boolean } | null;
    if (!templateSettings?.requiresApproval) {
      throw new BadRequestError({ message: "This account does not require approval" });
    }

    if (!account.folderId) {
      throw new BadRequestError({ message: "Account must be in a folder to require approval" });
    }

    const policy = await findFolderPolicy(account.folderId);
    if (!policy) {
      throw new BadRequestError({ message: "No approval configuration found for this folder" });
    }

    const existingPending = await approvalRequestDAL.find({
      requesterId: ctx.actorId,
      type: ApprovalPolicyType.PamAccess,
      status: ApprovalRequestStatus.Pending,
      projectId
    });

    const hasPendingForAccount = existingPending.some((r) => {
      const data = r.requestData as { version: number; requestData: TPamAccessRequestData } | null;
      return data?.requestData?.accountId === accountId;
    });

    if (hasPendingForAccount) {
      throw new BadRequestError({ message: "You already have a pending request for this account" });
    }

    const policySteps = await approvalPolicyDAL.findStepsByPolicyId(policy.id);
    const stepsForRequest = policySteps.map((s) => ({
      name: s.name ?? null,
      requiredApprovals: s.requiredApprovals,
      notifyApprovers: s.notifyApprovers ?? true,
      approvers: s.approvers
    }));

    const user = await userDAL.findById(ctx.actorId);
    const requesterName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || user.email;

    const requestData = {
      accountId,
      folderId: account.folderId,
      note,
      duration
    } as unknown as TApprovalRequestData;

    const request = await createApprovalRequestWithSteps(
      {
        projectId,
        organizationId: ctx.actorOrgId,
        policyId: policy.id,
        policyType: ApprovalPolicyType.PamAccess,
        policySteps: stepsForRequest,
        requestData,
        justification: note,
        requesterUserId: ctx.actorId,
        requesterName: requesterName || "Unknown",
        requesterEmail: user.email || "",
        scopeType: PAM_FOLDER_SCOPE_TYPE,
        scopeId: account.folderId
      },
      {
        approvalRequestDAL,
        approvalRequestStepsDAL,
        approvalRequestStepEligibleApproversDAL
      }
    );

    const firstStep = stepsForRequest[0];
    if (firstStep) {
      try {
        await notifyApproversForStep(firstStep, request, {
          userGroupMembershipDAL,
          notificationService
        });
      } catch (err) {
        logger.error(err, `Failed to send in-app notifications for PAM access request [requestId=${request.id}]`);
      }
    }

    return { request };
  };

  const listRequests = async ({ projectId, folderId, status, offset, limit, ...ctx }: TListAccessRequestsDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    // This is the folder admin audit view (all requesters' requests), so it requires folder-level
    // approval management. An approver's own queue is served by listPendingMyApproval instead.
    if (!folderId) {
      throw new BadRequestError({ message: "folderId is required" });
    }
    await assertFolderPolicyManagement(folderId, projectId, ctx);

    const filter: Record<string, unknown> = {
      type: ApprovalPolicyType.PamAccess,
      projectId
    };

    if (status) filter.status = status;
    // PAM requests store their folder as scopeId, so pagination/filtering happens at the DB level.
    filter.scopeType = PAM_FOLDER_SCOPE_TYPE;
    filter.scopeId = folderId;

    const requests = await approvalRequestDAL.find(filter, {
      sort: [["createdAt", "desc"]],
      offset,
      limit,
      count: true
    });
    const totalCount = Number(requests[0]?.count ?? 0);

    return {
      requests: await attachGrantExpiry(await enrichRequestsWithNames(requests)),
      totalCount
    };
  };

  const listPendingMyApproval = async ({ projectId, folderId, ...ctx }: TListPendingMyApprovalDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    const userGroupIds = await getUserGroupIds(ctx.actorId, ctx.actorOrgId);

    // Only requests still awaiting a response belong in an approver's queue.
    const filter: Record<string, unknown> = {
      type: ApprovalPolicyType.PamAccess,
      projectId,
      status: ApprovalRequestStatus.Pending
    };

    const requests = await approvalRequestDAL.find(filter);

    const result = [];
    for (const request of requests) {
      if (folderId) {
        const data = request.requestData as { version: number; requestData: TPamAccessRequestData } | null;
        if (data?.requestData?.folderId !== folderId) continue;
      }

      const steps = await approvalRequestDAL.findStepsByRequestId(request.id);
      const currentStep = steps.find((s) => s.stepNumber === request.currentStep);
      if (!currentStep) continue;

      if (isUserEligibleApprover(currentStep.approvers, ctx.actorId, userGroupIds)) {
        result.push({ ...request, steps });
      }
    }

    return { requests: await attachGrantExpiry(await enrichRequestsWithNames(result)) };
  };

  const getCount = async ({ projectId, ...ctx }: TGetAccessRequestCountDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    const userGroupIds = await getUserGroupIds(ctx.actorId, ctx.actorOrgId);

    const isApprover = await approvalPolicyDAL.isProjectApprover({
      projectId,
      userId: ctx.actorId,
      groupIds: [...userGroupIds],
      type: ApprovalPolicyType.PamAccess,
      scopeType: PAM_FOLDER_SCOPE_TYPE
    });

    // A non-approver can never have requests awaiting their approval.
    if (!isApprover) {
      return { pendingCount: 0, isApprover: false };
    }

    const requests = await approvalRequestDAL.findByProjectId(ApprovalPolicyType.PamAccess, projectId);

    // Phase 1 enforces a single approval step, so matching any step is equivalent to the current step.
    const pendingCount = requests.filter(
      (request) =>
        request.status === ApprovalRequestStatus.Pending &&
        request.steps.some((step) => isUserEligibleApprover(step.approvers, ctx.actorId, userGroupIds))
    ).length;

    return { pendingCount, isApprover: true };
  };

  const reviewRequest = async ({ requestId, projectId, status, comment, ...ctx }: TReviewAccessRequestDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    const request = await approvalRequestDAL.findById(requestId);
    if (!request || request.projectId !== projectId || request.type !== ApprovalPolicyType.PamAccess) {
      throw new NotFoundError({ message: "Request not found" });
    }

    if (request.status !== ApprovalRequestStatus.Pending) {
      throw new BadRequestError({ message: "Request is not pending" });
    }

    if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
      await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Expired });
      throw new BadRequestError({ message: "Request has expired" });
    }

    if (request.requesterId === ctx.actorId) {
      throw new ForbiddenRequestError({ message: "You cannot approve your own request" });
    }

    const requestData = request.requestData as { version: number; requestData: TPamAccessRequestData } | null;
    const folderId = requestData?.requestData?.folderId;

    const steps = await approvalRequestDAL.findStepsByRequestId(requestId);
    const currentStepIndex = steps.findIndex((s) => s.stepNumber === request.currentStep);
    if (currentStepIndex === -1) {
      throw new BadRequestError({ message: "Current step not found" });
    }

    const currentStep = steps[currentStepIndex];

    const userGroupIds = await getUserGroupIds(ctx.actorId, ctx.actorOrgId);

    // The actor must have been an eligible approver on this request's current step (snapshot at creation).
    if (!isUserEligibleApprover(currentStep.approvers, ctx.actorId, userGroupIds)) {
      throw new ForbiddenRequestError({ message: "You are not an eligible approver for this request" });
    }

    // And must still be an approver on the folder's live policy. A missing policy means no one is
    // currently authorized to review, so this is a denial rather than a skip.
    if (folderId) {
      const currentPolicy = await findFolderPolicy(folderId);
      if (!currentPolicy) {
        throw new ForbiddenRequestError({ message: "Approval policy no longer exists for this folder" });
      }
      const currentSteps = await approvalPolicyDAL.findStepsByPolicyId(currentPolicy.id);
      const isCurrentApprover = currentSteps.some((step) =>
        isUserEligibleApprover(step.approvers, ctx.actorId, userGroupIds)
      );
      if (!isCurrentApprover) {
        throw new ForbiddenRequestError({ message: "You are no longer an eligible approver for this folder" });
      }
    }

    const hasAlreadyReviewed = currentStep.approvals.some(
      (a: { approverUserId: string }) => a.approverUserId === ctx.actorId
    );
    if (hasAlreadyReviewed) {
      throw new BadRequestError({ message: "You have already reviewed this request" });
    }

    if (status === "rejected") {
      await approvalRequestDAL.transaction(async (tx) => {
        await approvalRequestApprovalsDAL.create(
          {
            stepId: currentStep.id,
            approverUserId: ctx.actorId,
            decision: ApprovalRequestApprovalDecision.Rejected,
            comment
          },
          tx
        );
        await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Rejected }, tx);
      });

      const updatedRequest = await approvalRequestDAL.findById(requestId);
      return { request: updatedRequest };
    }

    const { updatedRequest, nextStepToNotify } = await approvalRequestDAL.transaction(async (tx) => {
      let nextStep = null;

      await approvalRequestApprovalsDAL.create(
        {
          stepId: currentStep.id,
          approverUserId: ctx.actorId,
          decision: ApprovalRequestApprovalDecision.Approved,
          comment
        },
        tx
      );

      const newApprovalCount = currentStep.approvals.length + 1;
      if (newApprovalCount >= currentStep.requiredApprovals) {
        await approvalRequestStepsDAL.updateById(
          currentStep.id,
          { status: ApprovalRequestStepStatus.Completed, completedAt: new Date() },
          tx
        );

        const nextStepData = steps[currentStepIndex + 1];
        if (nextStepData) {
          await approvalRequestDAL.updateById(requestId, { currentStep: request.currentStep + 1 }, tx);
          await approvalRequestStepsDAL.updateById(
            nextStepData.id,
            { status: ApprovalRequestStepStatus.InProgress, startedAt: new Date() },
            tx
          );
          if (nextStepData.notifyApprovers) {
            nextStep = nextStepData;
          }
        } else {
          await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Approved }, tx);

          if (requestData?.requestData) {
            const durationMs = ms(requestData.requestData.duration);
            const expiresAt = new Date(Date.now() + durationMs);
            await approvalRequestGrantsDAL.create(
              {
                projectId: request.projectId,
                requestId: request.id,
                granteeUserId: request.requesterId,
                status: ApprovalRequestGrantStatus.Active,
                type: ApprovalPolicyType.PamAccess,
                attributes: {
                  accountId: requestData.requestData.accountId,
                  folderId: requestData.requestData.folderId
                },
                expiresAt
              },
              tx
            );
          }
        }
      }

      const updated = await approvalRequestDAL.findById(requestId);
      return { updatedRequest: updated, nextStepToNotify: nextStep };
    });

    if (nextStepToNotify) {
      await notifyApproversForStep(
        {
          name: nextStepToNotify.name ?? null,
          requiredApprovals: nextStepToNotify.requiredApprovals,
          notifyApprovers: nextStepToNotify.notifyApprovers ?? true,
          approvers: nextStepToNotify.approvers
        },
        updatedRequest,
        { userGroupMembershipDAL, notificationService }
      );
    }

    return { request: updatedRequest };
  };

  const revokeGrant = async ({ requestId, projectId, ...ctx }: TRevokeAccessRequestDTO) => {
    const { hasRole } = await verifyProductMembership(permissionService, projectId, ctx);

    const grant = await approvalRequestGrantsDAL.findOne({
      requestId,
      type: ApprovalPolicyType.PamAccess,
      status: ApprovalRequestGrantStatus.Active
    });

    if (!grant || grant.projectId !== projectId) {
      throw new NotFoundError({ message: "Active grant not found for this request" });
    }

    const requestData = (await approvalRequestDAL.findById(requestId))?.requestData as {
      version: number;
      requestData: TPamAccessRequestData;
    } | null;

    const accountId = requestData?.requestData?.accountId;
    const account = accountId ? (await pamAccountDAL.find({ id: accountId, projectId }))[0] : undefined;

    if (account) {
      await checkAccountAccess(
        permissionService,
        account.id,
        account.folderId,
        projectId,
        ResourcePermissionPamResourceActions.RevokeGrants,
        ctx
      );
    } else if (!hasRole(PamProductRole.Admin)) {
      // The grant's account can't be resolved (missing from requestData or already deleted), so there
      // is no resource to check RevokeGrants against. Fail closed to product admins.
      throw new ForbiddenRequestError({ message: "You are not authorized to revoke this grant" });
    }

    await approvalRequestGrantsDAL.updateById(grant.id, {
      status: ApprovalRequestGrantStatus.Revoked,
      revokedByUserId: ctx.actorId,
      revokedAt: new Date(),
      revocationReason: "Revoked by admin"
    });

    if (accountId) {
      const activeSessions = await pamSessionDAL.find({
        accountId,
        userId: grant.granteeUserId ?? undefined,
        status: "active"
      });

      for (const session of activeSessions) {
        await pamSessionDAL.terminateSessionById(session.id);
      }
    }

    return { grant };
  };

  const checkGrant = async ({
    userId,
    accountId,
    projectId
  }: TCheckGrantDTO): Promise<TApprovalRequestGrants | null> => {
    const grants = await approvalRequestGrantsDAL.find({
      granteeUserId: userId,
      type: ApprovalPolicyType.PamAccess,
      status: ApprovalRequestGrantStatus.Active,
      projectId
    });

    const now = new Date();
    return (
      grants.find((g) => {
        if (g.expiresAt && new Date(g.expiresAt) <= now) return false;
        const attrs = g.attributes as { accountId?: string } | null;
        return attrs?.accountId === accountId;
      }) ?? null
    );
  };

  const getAccessStatusBatch = async (
    userId: string,
    accountIds: string[],
    projectId: string
  ): Promise<Map<string, { accessStatus: "none" | "pending" | "granted"; grantExpiresAt: Date | null }>> => {
    const result = new Map<string, { accessStatus: "none" | "pending" | "granted"; grantExpiresAt: Date | null }>();
    if (accountIds.length === 0) return result;

    const now = new Date();

    const activeGrants = await approvalRequestGrantsDAL.find({
      granteeUserId: userId,
      type: ApprovalPolicyType.PamAccess,
      status: ApprovalRequestGrantStatus.Active,
      projectId
    });

    for (const grant of activeGrants) {
      if (grant.expiresAt && new Date(grant.expiresAt) <= now) continue;
      const attrs = grant.attributes as { accountId?: string } | null;
      if (attrs?.accountId && accountIds.includes(attrs.accountId)) {
        result.set(attrs.accountId, {
          accessStatus: "granted",
          grantExpiresAt: grant.expiresAt ? new Date(grant.expiresAt) : null
        });
      }
    }

    const pendingRequests = await approvalRequestDAL.find({
      requesterId: userId,
      type: ApprovalPolicyType.PamAccess,
      status: ApprovalRequestStatus.Pending,
      projectId
    });

    for (const request of pendingRequests) {
      const data = request.requestData as { version: number; requestData: TPamAccessRequestData } | null;
      const acctId = data?.requestData?.accountId;
      if (acctId && accountIds.includes(acctId) && !result.has(acctId)) {
        result.set(acctId, { accessStatus: "pending", grantExpiresAt: null });
      }
    }

    return result;
  };

  // A folder counts as "configured" only when its policy has at least one approver, so an
  // empty policy (e.g. after the last approver is removed) surfaces the unavailable flag.
  const getFolderPolicyConfigured = async (folderIds: string[]): Promise<Set<string>> => {
    if (folderIds.length === 0) return new Set();
    const scopeIds = await approvalPolicyDAL.findScopeIdsWithApprovers({
      type: ApprovalPolicyType.PamAccess,
      scopeType: PAM_FOLDER_SCOPE_TYPE,
      scopeIds: folderIds
    });
    return new Set(scopeIds);
  };

  return {
    getApprovalConfiguration,
    setApprovalConfiguration,
    createRequest,
    listRequests,
    listPendingMyApproval,
    getCount,
    reviewRequest,
    revokeGrant,
    checkGrant,
    getAccessStatusBatch,
    getFolderPolicyConfigured
  };
};
