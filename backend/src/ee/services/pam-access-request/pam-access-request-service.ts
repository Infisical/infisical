import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { RESOURCE_SCOPE, ResourceType, TApprovalRequestGrants } from "@app/db/schemas";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ResourcePermissionPamResourceActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { formatDuration, ms } from "@app/lib/ms";
import {
  TApprovalPolicyDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "@app/services/approval-policy/approval-policy-dal";
import {
  ApprovalPolicyScope,
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
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { PamAccessStatus, PamProductRole, PamSessionStatus } from "../pam/pam-enums";
import { resolveAccountByPath } from "../pam/pam-fns";
import {
  checkAccountAccess,
  checkFolderPermission,
  TActorContext,
  verifyProductMembership
} from "../pam/pam-permission";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { TPamAccountTemplateDALFactory } from "../pam-account-template/pam-account-template-dal";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { sendPamSessionCancellationSignal } from "../pam-session/pam-session-fns";
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
    | "findByIdForUpdate"
    | "create"
    | "update"
    | "updateById"
    | "transaction"
    | "findStepsByRequestId"
    | "findByProjectId"
  >;
  approvalRequestStepsDAL: Pick<TApprovalRequestStepsDALFactory, "create" | "updateById">;
  approvalRequestStepEligibleApproversDAL: Pick<TApprovalRequestStepEligibleApproversDALFactory, "create">;
  approvalRequestApprovalsDAL: Pick<TApprovalRequestApprovalsDALFactory, "create" | "find">;
  approvalRequestGrantsDAL: Pick<TApprovalRequestGrantsDALFactory, "find" | "findOne" | "create" | "updateById">;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findByIdWithDetails" | "find" | "findOne">;
  pamAccountTemplateDAL: Pick<TPamAccountTemplateDALFactory, "find">;
  pamFolderDAL: Pick<TPamFolderDALFactory, "findById" | "find" | "findOne">;
  pamSessionDAL: Pick<TPamSessionDALFactory, "find" | "terminateSessionById">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
  membershipDAL: Pick<TMembershipDALFactory, "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
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
  gatewayV2Service,
  membershipDAL,
  membershipRoleDAL,
  projectDAL,
  permissionService,
  notificationService,
  smtpService,
  userGroupMembershipDAL,
  userDAL
}: TPamAccessRequestServiceFactoryDep) => {
  const findFolderPolicy = async (folderId: string) => {
    const policy = await approvalPolicyDAL.findOne({
      type: ApprovalPolicyType.PamAccess,
      scopeType: ApprovalPolicyScope.PamFolder,
      scopeId: folderId
    });
    return policy ?? null;
  };

  // npm ms returns undefined (not an error) for strings it can't parse, e.g. Go-style "2h30m"
  const parseDurationMs = (duration: string): number => {
    const durationMs: number | undefined = ms(duration);
    if (!durationMs || durationMs <= 0) {
      throw new BadRequestError({
        message: `Invalid access duration '${duration}'. Use a single unit like '30m', '2h', or '1d'`
      });
    }
    return durationMs;
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

  // Temporary membership expiry is enforced lazily (rows are not deleted when access lapses), so
  // approver eligibility must filter to memberships that still carry an active role.
  const findActiveFolderMemberships = async (projectId: string, folderId: string) => {
    const memberships = await membershipDAL.find({
      scope: RESOURCE_SCOPE,
      scopeProjectId: projectId,
      scopeResourceType: ResourceType.PamFolder,
      scopeResourceId: folderId
    });
    if (!memberships.length) return [];

    const roles = await membershipRoleDAL.find({ $in: { membershipId: memberships.map((m) => m.id) } });
    const now = new Date();
    const activeMembershipIds = new Set(
      roles
        .filter((r) => !r.isTemporary || (r.temporaryAccessEndTime && now < new Date(r.temporaryAccessEndTime)))
        .map((r) => r.membershipId)
    );
    return memberships.filter((m) => m.isActive && activeMembershipIds.has(m.id));
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

  // Attach the access grant's expiry and status to each request. Requests themselves carry no expiry
  // or revocation state; the meaningful "expires"/"revoked" lives on the grant created on approval.
  const attachGrantExpiry = async <T extends { id: string }>(requests: T[]) => {
    if (requests.length === 0)
      return requests.map((r) => ({
        ...r,
        grantExpiresAt: null as Date | null,
        grantStatus: null as string | null
      }));

    const grants = await approvalRequestGrantsDAL.find({ $in: { requestId: requests.map((r) => r.id) } });
    const grantByRequestId = new Map<string, { expiresAt: Date | null; status: string }>();
    grants
      .filter((g) => g.requestId)
      .forEach((g) =>
        grantByRequestId.set(g.requestId as string, { expiresAt: g.expiresAt ?? null, status: g.status })
      );

    return requests.map((r) => {
      const grant = grantByRequestId.get(r.id);
      return { ...r, grantExpiresAt: grant?.expiresAt ?? null, grantStatus: grant?.status ?? null };
    });
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
      return { steps: [] };
    }

    // The policy row and step tuning fields are internal; the UI only needs the approver lists.
    const steps = await approvalPolicyDAL.findStepsByPolicyId(policy.id);
    return { steps: steps.map((s) => ({ approvers: s.approvers })) };
  };

  const setApprovalConfiguration = async ({ folderId, projectId, steps, ...ctx }: TSetApprovalConfigurationDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);
    const folder = await assertFolderPolicyManagement(folderId, projectId, ctx);

    if (steps.length > 1) {
      throw new BadRequestError({ message: "Phase 1 only supports a single approval step" });
    }

    // Approvers must be active members of the folder. This keeps the approver list in sync with
    // membership so that removing someone from the folder (which strips their approver rows) can't be
    // circumvented by designating a non-member or expired member as an approver.
    const requestedApprovers = steps.flatMap((s) => s.approvers);
    if (requestedApprovers.length > 0) {
      const memberships = await findActiveFolderMemberships(projectId, folderId);
      const memberUserIds = new Set(memberships.map((m) => m.actorUserId).filter(Boolean));
      const memberGroupIds = new Set(memberships.map((m) => m.actorGroupId).filter(Boolean));

      for (const approver of requestedApprovers) {
        const isMember =
          approver.type === ApproverType.User ? memberUserIds.has(approver.id) : memberGroupIds.has(approver.id);
        if (!isMember) {
          throw new BadRequestError({ message: "Approvers must be members of the folder" });
        }
      }
    }

    const existingPolicy = await findFolderPolicy(folderId);

    const hasApprovers = steps.length === 1 && steps[0].approvers.length > 0;
    if (!hasApprovers && existingPolicy) {
      await approvalPolicyDAL.transaction(async (tx) => {
        await approvalPolicyStepsDAL.delete({ policyId: existingPolicy.id }, tx);
        await approvalPolicyDAL.deleteById(existingPolicy.id, tx);
      });
      return { policyId: existingPolicy.id, folderId, stepCount: steps.length };
    }

    if (!hasApprovers) {
      return { policyId: null, folderId, stepCount: 0 };
    }

    if (existingPolicy) {
      await approvalPolicyDAL.transaction(async (tx) => {
        await approvalPolicyStepsDAL.delete({ policyId: existingPolicy.id }, tx);

        for (let i = 0; i < steps.length; i += 1) {
          // eslint-disable-next-line no-await-in-loop
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
            // eslint-disable-next-line no-await-in-loop
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

      return { policyId: existingPolicy.id, folderId, stepCount: steps.length };
    }

    const newPolicy = await approvalPolicyDAL.transaction(async (tx) => {
      const policy = await approvalPolicyDAL.create(
        {
          projectId,
          organizationId: ctx.actorOrgId,
          type: ApprovalPolicyType.PamAccess,
          name: `PAM Folder Approval - ${folder.name}`,
          scopeType: ApprovalPolicyScope.PamFolder,
          scopeId: folderId,
          enforcementLevel: "hard",
          conditions: { version: 1, conditions: [] },
          constraints: { version: 1, constraints: { accessDuration: { min: "30s", max: "7d" } } }
        },
        tx
      );

      for (let i = 0; i < steps.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
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
          // eslint-disable-next-line no-await-in-loop
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

    return { policyId: newPolicy.id, folderId, stepCount: steps.length };
  };

  const createRequest = async ({ accountId, path, projectId, reason, duration, ...ctx }: TCreateAccessRequestDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    if (!accountId && !path) {
      throw new BadRequestError({ message: "Either 'accountId' or 'path' is required" });
    }

    // The CLI supplies a 'folderName/accountName' path; the dashboard supplies an accountId.
    const account = path
      ? await resolveAccountByPath({ pamFolderDAL, pamAccountDAL }, projectId, path)
      : await pamAccountDAL.findByIdWithDetails(accountId as string);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: "Account not found" });
    }

    await checkAccountAccess(
      permissionService,
      account.id,
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

    const durationMs = parseDurationMs(duration);
    const accessDuration = (
      policy.constraints as { constraints?: { accessDuration?: { min?: string; max?: string } } } | null
    )?.constraints?.accessDuration;
    const minMs = accessDuration?.min ? ms(accessDuration.min) : undefined;
    const maxMs = accessDuration?.max ? ms(accessDuration.max) : undefined;
    if (minMs && durationMs < minMs) {
      throw new BadRequestError({ message: `Access duration must be at least ${accessDuration?.min}` });
    }
    if (maxMs && durationMs > maxMs) {
      throw new BadRequestError({ message: `Access duration must be at most ${accessDuration?.max}` });
    }

    const existingPending = await approvalRequestDAL.find({
      requesterId: ctx.actorId,
      type: ApprovalPolicyType.PamAccess,
      status: ApprovalRequestStatus.Pending,
      projectId
    });

    const hasPendingForAccount = existingPending.some((r) => {
      const data = r.requestData as { version: number; requestData: TPamAccessRequestData } | null;
      return data?.requestData?.accountId === account.id;
    });

    if (hasPendingForAccount) {
      throw new BadRequestError({ message: "You already have a pending request for this account" });
    }

    const policySteps = await approvalPolicyDAL.findStepsByPolicyId(policy.id);

    // A step with no approvers can never be reviewed, wedging the request forever. The dashboard hides
    // the request action in this case, but that guard must also hold for the CLI and direct API callers.
    if (policySteps.length === 0 || policySteps.some((s) => s.approvers.length === 0)) {
      throw new BadRequestError({ message: "This folder's approval policy has no approvers configured" });
    }

    const stepsForRequest = policySteps.map((s) => ({
      name: s.name ?? null,
      requiredApprovals: s.requiredApprovals,
      notifyApprovers: s.notifyApprovers ?? true,
      approvers: s.approvers
    }));

    const user = await userDAL.findById(ctx.actorId);
    const requesterName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || user.email;

    const requestData = {
      accountId: account.id,
      folderId: account.folderId,
      reason,
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
        justification: reason,
        requesterUserId: ctx.actorId,
        requesterName: requesterName || "Unknown",
        requesterEmail: user.email || "",
        scopeType: ApprovalPolicyScope.PamFolder,
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
        await notifyApproversForStep({ ...firstStep, notifyApprovers: true }, request, {
          userGroupMembershipDAL,
          notificationService
        });
      } catch (err) {
        logger.error(err, `Failed to send in-app notifications for PAM access request [requestId=${request.id}]`);
      }

      try {
        const approverUserIds = new Set<string>();
        firstStep.approvers.filter((a) => a.type === ApproverType.User).forEach((a) => approverUserIds.add(a.id));

        const groupMemberLists = await Promise.all(
          firstStep.approvers
            .filter((a) => a.type === ApproverType.Group)
            .map((a) => userGroupMembershipDAL.find({ groupId: a.id }))
        );
        groupMemberLists.forEach((members) => members.forEach((m) => approverUserIds.add(m.userId)));

        const approverUsers = approverUserIds.size > 0 ? await userDAL.find({ $in: { id: [...approverUserIds] } }) : [];
        const recipients = approverUsers.filter((u) => u.email).map((u) => u.email as string);

        if (recipients.length > 0) {
          const project = await projectDAL.findById(projectId);
          const cfg = getConfig();
          const approvalUrl = `${cfg.SITE_URL}/organizations/${ctx.actorOrgId}/pam/approval-requests?requestId=${request.id}`;

          await smtpService.sendMail({
            recipients,
            subjectLine: "PAM Access Request",
            template: SmtpTemplates.AccessPamRequest,
            substitutions: {
              projectName: project?.name ?? "PAM",
              requesterFullName: requesterName || "Unknown",
              requesterEmail: user.email ?? "",
              accountName: account.name,
              folderName: account.folderName ?? undefined,
              accessDuration: formatDuration(duration),
              reason,
              approvalUrl
            }
          });
        }
      } catch (err) {
        logger.error(err, `Failed to send approval emails for PAM access request [requestId=${request.id}]`);
      }
    }

    return { request, accountId: account.id, folderId: account.folderId };
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
    filter.scopeType = ApprovalPolicyScope.PamFolder;
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

  // Whether the actor is currently an approver on the folder's live policy AND still holds an active
  // folder membership. This is the same authority reviewRequest enforces, so the approver queue and
  // the review action agree; the creation-time snapshot alone would leak requests (and requester PII)
  // to users removed as approvers after the request was created.
  const isLiveFolderApprover = async (
    projectId: string,
    folderId: string,
    actorId: string,
    userGroupIds: Set<string>
  ): Promise<boolean> => {
    const policy = await findFolderPolicy(folderId);
    if (!policy) return false;
    const steps = await approvalPolicyDAL.findStepsByPolicyId(policy.id);
    const onLivePolicy = steps.some((step) => isUserEligibleApprover(step.approvers, actorId, userGroupIds));
    if (!onLivePolicy) return false;
    const activeMemberships = await findActiveFolderMemberships(projectId, folderId);
    return activeMemberships.some(
      (m) => m.actorUserId === actorId || (m.actorGroupId && userGroupIds.has(m.actorGroupId))
    );
  };

  const listPendingMyApproval = async ({ projectId, folderId, ...ctx }: TListPendingMyApprovalDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    const userGroupIds = await getUserGroupIds(ctx.actorId, ctx.actorOrgId);

    // Fast reject for users who are not a live approver on any PAM policy in the project.
    const isApprover = await approvalPolicyDAL.isProjectApprover({
      projectId,
      userId: ctx.actorId,
      groupIds: [...userGroupIds],
      type: ApprovalPolicyType.PamAccess,
      scopeType: ApprovalPolicyScope.PamFolder
    });
    if (!isApprover) return { requests: [] };

    const requests = await approvalRequestDAL.findByProjectId(ApprovalPolicyType.PamAccess, projectId);

    // Only pending requests whose creation-time snapshot lists the actor belong in the queue...
    const candidates = requests.filter((request) => {
      if (request.status !== ApprovalRequestStatus.Pending) return false;

      if (folderId) {
        const data = request.requestData as { version: number; requestData: TPamAccessRequestData } | null;
        if (data?.requestData?.folderId !== folderId) return false;
      }

      const currentStep = request.steps.find((s) => s.stepNumber === request.currentStep);
      if (!currentStep) return false;

      return isUserEligibleApprover(currentStep.approvers, ctx.actorId, userGroupIds);
    });

    // ...but the snapshot is re-validated against each folder's live policy so requests whose approver
    // set changed after creation (e.g. the actor was removed) drop out rather than leaking.
    const involvedFolderIds = [
      ...new Set(
        candidates
          .map((r) => (r.requestData as { requestData?: TPamAccessRequestData } | null)?.requestData?.folderId)
          .filter((id): id is string => Boolean(id))
      )
    ];
    const liveApproverFolders = new Set<string>();
    for (const fId of involvedFolderIds) {
      // eslint-disable-next-line no-await-in-loop
      if (await isLiveFolderApprover(projectId, fId, ctx.actorId, userGroupIds)) {
        liveApproverFolders.add(fId);
      }
    }

    const result = candidates.filter((r) => {
      const fId = (r.requestData as { requestData?: TPamAccessRequestData } | null)?.requestData?.folderId;
      return Boolean(fId && liveApproverFolders.has(fId));
    });

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
      scopeType: ApprovalPolicyScope.PamFolder
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

    // Self-approval is a conflict of interest and always blocked. Denying your own request is harmless
    // (it only withdraws your own pending access), so it is allowed.
    if (status === ApprovalRequestApprovalDecision.Approved && request.requesterId === ctx.actorId) {
      throw new ForbiddenRequestError({ message: "You cannot approve your own request" });
    }

    const requestData = request.requestData as { version: number; requestData: TPamAccessRequestData } | null;
    const folderId = requestData?.requestData?.folderId;

    // The request snapshots the account's folder at creation time, but the account may have since been
    // moved or deleted. Approving would then grant access governed by the old folder's approvers,
    // bypassing the account's current folder policy, so block approval of a stale request. Rejection
    // stays allowed so the stale request can be cleared.
    if (status === ApprovalRequestApprovalDecision.Approved) {
      const requestedAccountId = requestData?.requestData?.accountId;
      const account = requestedAccountId ? await pamAccountDAL.findOne({ id: requestedAccountId }) : undefined;
      if (!account || account.projectId !== projectId || account.folderId !== folderId) {
        throw new BadRequestError({
          message: "This request is no longer valid because the account has moved or been removed"
        });
      }
    }

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

      // Approver rows are only stripped on explicit removal from the folder, not when a temporary
      // membership lapses, so re-check that the actor still holds an active folder membership.
      const activeMemberships = await findActiveFolderMemberships(projectId, folderId);
      const hasActiveMembership = activeMemberships.some(
        (m) => m.actorUserId === ctx.actorId || (m.actorGroupId && userGroupIds.has(m.actorGroupId))
      );
      if (!hasActiveMembership) {
        throw new ForbiddenRequestError({ message: "You are no longer an eligible approver for this folder" });
      }
    }

    const hasAlreadyReviewed = currentStep.approvals.some(
      (a: { approverUserId: string }) => a.approverUserId === ctx.actorId
    );
    if (hasAlreadyReviewed) {
      throw new BadRequestError({ message: "You have already reviewed this request" });
    }

    if (status === ApprovalRequestApprovalDecision.Rejected) {
      const updatedRequest = await approvalRequestDAL.transaction(async (tx) => {
        // Row lock serializes concurrent reviews; the pre-transaction checks may be stale by now
        const locked = await approvalRequestDAL.findByIdForUpdate(requestId, tx);
        if (!locked || locked.status !== ApprovalRequestStatus.Pending) {
          throw new BadRequestError({ message: "Request is not pending" });
        }
        const lockedStep = steps.find((s) => s.stepNumber === locked.currentStep);
        if (!lockedStep) {
          throw new BadRequestError({ message: "Current step not found" });
        }
        if (!isUserEligibleApprover(lockedStep.approvers, ctx.actorId, userGroupIds)) {
          throw new ForbiddenRequestError({ message: "You are not an eligible approver for this request" });
        }

        await approvalRequestApprovalsDAL.create(
          {
            stepId: lockedStep.id,
            approverUserId: ctx.actorId,
            decision: ApprovalRequestApprovalDecision.Rejected,
            comment
          },
          tx
        );
        await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Rejected }, tx);
        return approvalRequestDAL.findById(requestId, tx);
      });

      return { request: updatedRequest, accountId: requestData?.requestData?.accountId, folderId };
    }

    const { updatedRequest, nextStepToNotify } = await approvalRequestDAL.transaction(async (tx) => {
      let nextStep = null;

      // Row lock serializes concurrent approvals; re-check state and re-read the approval count
      // under the lock so two simultaneous approvers can't both complete the step or double-grant
      const locked = await approvalRequestDAL.findByIdForUpdate(requestId, tx);
      if (!locked || locked.status !== ApprovalRequestStatus.Pending) {
        throw new BadRequestError({ message: "Request is not pending" });
      }

      const lockedStepIndex = steps.findIndex((s) => s.stepNumber === locked.currentStep);
      const lockedStep = steps[lockedStepIndex];
      if (!lockedStep) {
        throw new BadRequestError({ message: "Current step not found" });
      }
      if (!isUserEligibleApprover(lockedStep.approvers, ctx.actorId, userGroupIds)) {
        throw new ForbiddenRequestError({ message: "You are not an eligible approver for this request" });
      }

      const stepApprovals = await approvalRequestApprovalsDAL.find({ stepId: lockedStep.id }, { tx });
      if (stepApprovals.some((a) => a.approverUserId === ctx.actorId)) {
        throw new BadRequestError({ message: "You have already reviewed this request" });
      }

      await approvalRequestApprovalsDAL.create(
        {
          stepId: lockedStep.id,
          approverUserId: ctx.actorId,
          decision: ApprovalRequestApprovalDecision.Approved,
          comment
        },
        tx
      );

      const newApprovalCount = stepApprovals.length + 1;
      if (newApprovalCount >= lockedStep.requiredApprovals) {
        await approvalRequestStepsDAL.updateById(
          lockedStep.id,
          { status: ApprovalRequestStepStatus.Completed, completedAt: new Date() },
          tx
        );

        const nextStepData = steps[lockedStepIndex + 1];
        if (nextStepData) {
          await approvalRequestDAL.updateById(requestId, { currentStep: locked.currentStep + 1 }, tx);
          await approvalRequestStepsDAL.updateById(
            nextStepData.id,
            { status: ApprovalRequestStepStatus.InProgress, startedAt: new Date() },
            tx
          );
          nextStep = nextStepData;
        } else {
          await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Approved }, tx);

          if (requestData?.requestData) {
            const durationMs = parseDurationMs(requestData.requestData.duration);
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

      const updated = await approvalRequestDAL.findById(requestId, tx);
      return { updatedRequest: updated, nextStepToNotify: nextStep };
    });

    if (nextStepToNotify) {
      await notifyApproversForStep(
        {
          name: nextStepToNotify.name ?? null,
          requiredApprovals: nextStepToNotify.requiredApprovals,
          notifyApprovers: true,
          approvers: nextStepToNotify.approvers
        },
        updatedRequest,
        { userGroupMembershipDAL, notificationService }
      );
    }

    return { request: updatedRequest, accountId: requestData?.requestData?.accountId, folderId };
  };

  // Marks a grant Revoked and terminates the grantee's live sessions on the granted account. An
  // undefined userId in the session filter would throw in knex; granteeUserId is null when the
  // grantee user was deleted, and their sessions carry a null userId too.
  const revokeGrantRow = async (
    grant: TApprovalRequestGrants,
    actorId: string,
    reason: string,
    tx?: Knex
  ): Promise<TApprovalRequestGrants> => {
    const revoked = await approvalRequestGrantsDAL.updateById(
      grant.id,
      {
        status: ApprovalRequestGrantStatus.Revoked,
        revokedByUserId: actorId,
        revokedAt: new Date(),
        revocationReason: reason
      },
      tx
    );

    const attrs = grant.attributes as { accountId?: string } | null;
    if (attrs?.accountId) {
      // Cover both active and starting sessions; a session mid-handshake would otherwise slip past
      // revocation and go live. terminateSessionById flips the row, and the ALPN signal cuts the live
      // tunnel, since neither the gateway nor the web-access loop watches the status column.
      const liveSessions = await pamSessionDAL.find(
        {
          accountId: attrs.accountId,
          userId: grant.granteeUserId ?? null,
          $in: { status: [PamSessionStatus.Active, PamSessionStatus.Starting] }
        },
        { tx }
      );
      if (liveSessions.length > 0) {
        const actor = await userDAL.findById(actorId);
        for (const session of liveSessions) {
          // eslint-disable-next-line no-await-in-loop
          await pamSessionDAL.terminateSessionById(session.id, tx);
          if (session.gatewayId) {
            sendPamSessionCancellationSignal({
              sessionId: session.id,
              gatewayId: session.gatewayId,
              accountType: session.accountType,
              actorId,
              actorEmail: actor?.email ?? "",
              gatewayV2Service
            });
          }
        }
      }
    }

    return revoked;
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

    const revokedGrant = await revokeGrantRow(grant, ctx.actorId, "Revoked by admin");

    return { grant: revokedGrant, accountId, folderId: requestData?.requestData?.folderId, grantId: grant.id };
  };

  // Approval policies, requests, and grants reference folders/accounts by scopeId or by a JSON id
  // with no FK, so deleting a folder or account leaves them orphaned. These run inside the folder/
  // account delete transaction to keep the approval state consistent.

  const cleanupFolderResources = async (folderId: string, tx: Knex) => {
    // Deleting the policy cascades to its steps and approvers, which also stops the now-defunct
    // folder from keeping its approvers "active" for approver-eligibility scans.
    const policy = await approvalPolicyDAL.findOne(
      { type: ApprovalPolicyType.PamAccess, scopeType: ApprovalPolicyScope.PamFolder, scopeId: folderId },
      tx
    );
    if (policy) {
      await approvalPolicyDAL.deleteById(policy.id, tx);
    }

    await approvalRequestDAL.update(
      {
        type: ApprovalPolicyType.PamAccess,
        scopeType: ApprovalPolicyScope.PamFolder,
        scopeId: folderId,
        status: ApprovalRequestStatus.Pending
      },
      { status: ApprovalRequestStatus.Cancelled },
      tx
    );
  };

  const cleanupAccountResources = async (
    {
      accountId,
      folderId,
      projectId,
      actorId
    }: { accountId: string; folderId: string | null | undefined; projectId: string; actorId: string },
    tx: Knex
  ) => {
    // Requests are folder-scoped with the account id in requestData JSON, so filter in memory.
    if (folderId) {
      const pending = await approvalRequestDAL.find(
        {
          type: ApprovalPolicyType.PamAccess,
          scopeType: ApprovalPolicyScope.PamFolder,
          scopeId: folderId,
          status: ApprovalRequestStatus.Pending
        },
        { tx }
      );
      const staleIds = pending
        .filter((r) => {
          const data = r.requestData as { version: number; requestData: TPamAccessRequestData } | null;
          return data?.requestData?.accountId === accountId;
        })
        .map((r) => r.id);
      if (staleIds.length > 0) {
        await approvalRequestDAL.update({ $in: { id: staleIds } }, { status: ApprovalRequestStatus.Cancelled }, tx);
      }
    }

    const activeGrants = await approvalRequestGrantsDAL.find(
      { type: ApprovalPolicyType.PamAccess, status: ApprovalRequestGrantStatus.Active, projectId },
      { tx }
    );
    for (const grant of activeGrants) {
      const attrs = grant.attributes as { accountId?: string } | null;
      if (attrs?.accountId === accountId) {
        // eslint-disable-next-line no-await-in-loop
        await revokeGrantRow(grant, actorId, "Account deleted", tx);
      }
    }
  };

  const checkGrant = async ({
    userId,
    accountId,
    accountFolderId,
    projectId
  }: TCheckGrantDTO): Promise<TApprovalRequestGrants | null> => {
    const grants = await approvalRequestGrantsDAL.find({
      granteeUserId: userId,
      type: ApprovalPolicyType.PamAccess,
      status: ApprovalRequestGrantStatus.Active,
      projectId
    });

    const now = new Date();
    // Match the grant's snapshot folder against the account's CURRENT folder: a grant approved while
    // the account lived in another folder must not authorize launch after the account is moved into a
    // different (gated) folder whose approvers never reviewed it.
    const forAccount = grants.filter((g) => {
      const attrs = g.attributes as { accountId?: string; folderId?: string | null } | null;
      return attrs?.accountId === accountId && (attrs?.folderId ?? null) === (accountFolderId ?? null);
    });
    // Prefer a still-valid grant; otherwise return an expired one (rather than null) so the caller can
    // distinguish "grant expired" from "no grant" and signal PAM_GRANT_EXPIRED vs PAM_APPROVAL_REQUIRED.
    const valid = forAccount.find((g) => !g.expiresAt || new Date(g.expiresAt) > now);
    return valid ?? forAccount[0] ?? null;
  };

  const getAccessStatusBatch = async (
    userId: string,
    accountIds: string[],
    projectId: string
  ): Promise<Map<string, { accessStatus: PamAccessStatus; grantExpiresAt: Date | null }>> => {
    const result = new Map<string, { accessStatus: PamAccessStatus; grantExpiresAt: Date | null }>();
    if (accountIds.length === 0) return result;

    const now = new Date();

    const activeGrants = await approvalRequestGrantsDAL.find({
      granteeUserId: userId,
      type: ApprovalPolicyType.PamAccess,
      status: ApprovalRequestGrantStatus.Active,
      projectId
    });

    for (const grant of activeGrants) {
      const isExpired = Boolean(grant.expiresAt && new Date(grant.expiresAt) <= now);
      const attrs = grant.attributes as { accountId?: string } | null;
      if (!isExpired && attrs?.accountId && accountIds.includes(attrs.accountId)) {
        result.set(attrs.accountId, {
          accessStatus: PamAccessStatus.Granted,
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
        result.set(acctId, { accessStatus: PamAccessStatus.Pending, grantExpiresAt: null });
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
      scopeType: ApprovalPolicyScope.PamFolder,
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
    getFolderPolicyConfigured,
    cleanupFolderResources,
    cleanupAccountResources
  };
};
