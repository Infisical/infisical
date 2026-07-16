import { ForbiddenError } from "@casl/ability";

import {
  ActionProjectType,
  ProjectMembershipRole,
  RESOURCE_SCOPE,
  ResourceType,
  TApprovalPolicies,
  TApprovalRequests
} from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionApprovalRequestActions,
  ProjectPermissionApprovalRequestGrantActions,
  ProjectPermissionCodeSigningActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  ResourcePermissionApprovalPolicyActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TCertificateRequestDALFactory } from "@app/services/certificate-request/certificate-request-dal";
import { TCertificateApprovalService } from "@app/services/certificate-v3/certificate-approval-fns";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TPkiApplicationDALFactory } from "@app/services/pki-application/pki-application-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TMembershipDALFactory } from "../membership/membership-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import {
  TApprovalPolicyBypassersDALFactory,
  TApprovalPolicyDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "./approval-policy-dal";
import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApprovalRequestApprovalDecision,
  ApprovalRequestGrantStatus,
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  ApproverType,
  EnforcementLevel
} from "./approval-policy-enums";
import { APPROVAL_POLICY_FACTORY_MAP } from "./approval-policy-factory";
import {
  ApprovalPolicyStep,
  BreakGlassBypassMetadata,
  PolicyBypasser,
  TApprovalPolicy,
  TApprovalPolicyInputs,
  TApprovalRequest,
  TBypassAffordances,
  TCreatePolicyDTO,
  TCreateRequestDTO,
  TCreateRequestFromPolicyDTO,
  TDecorationContext,
  TPostApprovalContext,
  TUpdatePolicyDTO
} from "./approval-policy-types";
import {
  TApprovalRequestApprovalsDALFactory,
  TApprovalRequestDALFactory,
  TApprovalRequestGrantsDALFactory,
  TApprovalRequestStepEligibleApproversDALFactory,
  TApprovalRequestStepsDALFactory
} from "./approval-request-dal";
import { createApprovalRequestWithSteps, notifyStepApprovers } from "./approval-request-fns";
import { TPamAccessRequestData } from "./pam-access/pam-access-policy-types";

type TApprovalPolicyServiceFactoryDep = {
  approvalPolicyDAL: TApprovalPolicyDALFactory;
  approvalPolicyStepsDAL: TApprovalPolicyStepsDALFactory;
  approvalPolicyStepApproversDAL: TApprovalPolicyStepApproversDALFactory;
  approvalPolicyBypassersDAL: TApprovalPolicyBypassersDALFactory;
  approvalRequestApprovalsDAL: TApprovalRequestApprovalsDALFactory;
  approvalRequestDAL: TApprovalRequestDALFactory;
  approvalRequestStepsDAL: TApprovalRequestStepsDALFactory;
  approvalRequestStepEligibleApproversDAL: TApprovalRequestStepEligibleApproversDALFactory;
  approvalRequestGrantsDAL: TApprovalRequestGrantsDALFactory;
  userGroupMembershipDAL: TUserGroupMembershipDALFactory;
  notificationService: TNotificationServiceFactory;
  permissionService: Pick<
    TPermissionServiceFactory,
    "getProjectPermission" | "getOrgPermission" | "getResourcePermission"
  >;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findProjectMembershipsByUserIds">;
  membershipDAL: Pick<TMembershipDALFactory, "find">;
  pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById">;
  certificateApprovalService: TCertificateApprovalService;
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "updateById" | "findById">;
  smtpService: Pick<TSmtpService, "sendMail">;
  userDAL: Pick<TUserDALFactory, "findById" | "find">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export type TApprovalPolicyServiceFactory = ReturnType<typeof approvalPolicyServiceFactory>;

export const approvalPolicyServiceFactory = ({
  approvalPolicyDAL,
  approvalPolicyStepsDAL,
  approvalPolicyStepApproversDAL,
  approvalPolicyBypassersDAL,
  approvalRequestApprovalsDAL,
  approvalRequestDAL,
  approvalRequestStepsDAL,
  approvalRequestStepEligibleApproversDAL,
  approvalRequestGrantsDAL,
  userGroupMembershipDAL,
  notificationService,
  permissionService,
  projectMembershipDAL,
  membershipDAL,
  pkiApplicationDAL,
  certificateApprovalService,
  certificateRequestDAL,
  smtpService,
  userDAL,
  projectDAL
}: TApprovalPolicyServiceFactoryDep) => {
  const $notifyApprovers = (step: ApprovalPolicyStep, request: TApprovalRequests) =>
    notifyStepApprovers(step, request, {
      userGroupMembershipDAL,
      notificationService,
      userDAL,
      smtpService
    });

  const $buildDecorationContext = (actor: OrgServiceActor): TDecorationContext => {
    let cached: Promise<Set<string>> | null = null;
    return {
      getUserGroupIds: () => {
        if (!cached) {
          cached = userGroupMembershipDAL
            .findGroupMembershipsByUserIdInOrg(actor.id, actor.orgId)
            .then((rows) => new Set(rows.map((g) => g.groupId)));
        }
        return cached;
      }
    };
  };

  const $decorateRequest = async <
    R extends {
      id: string;
      type?: string | null;
      status?: string | null;
      requesterId?: string | null;
      policyId?: string | null;
    }
  >(
    request: R,
    actor: OrgServiceActor,
    ctx: TDecorationContext = $buildDecorationContext(actor)
  ): Promise<R & TBypassAffordances> => {
    // Bypass affordances are PAM-only — short-circuit other policy types so we don't fire
    // a grant lookup for cert/codesigning request views.
    if (request.type !== ApprovalPolicyType.PamAccess) {
      return { ...request, canBreakGlass: false, isBreakGlass: false, bypassReason: null };
    }

    let canBreakGlass = false;
    if (
      actor.type === ActorType.USER &&
      request.status === ApprovalRequestStatus.Pending &&
      request.requesterId === actor.id &&
      request.policyId
    ) {
      const policy = ctx.policyById?.get(request.policyId) ?? (await approvalPolicyDAL.findById(request.policyId));
      if (policy && policy.enforcementLevel === EnforcementLevel.Soft) {
        const bypassers =
          ctx.bypassersByPolicyId?.get(request.policyId) ??
          (await approvalPolicyDAL.findBypassersByPolicyId(request.policyId));
        if (bypassers.length === 0) {
          canBreakGlass = true;
        } else {
          const userGroupIds = await ctx.getUserGroupIds();
          canBreakGlass = bypassers.some(
            (b) =>
              (b.type === ApproverType.User && b.id === actor.id) ||
              (b.type === ApproverType.Group && userGroupIds.has(b.id))
          );
        }
      }
    }

    let isBreakGlass = false;
    let bypassReason: string | null = null;
    const prefetched = ctx.grantsByRequestId?.get(request.id);
    if (prefetched !== undefined) {
      isBreakGlass = prefetched.isBreakGlass;
      bypassReason = prefetched.bypassReason;
    } else if (request.requesterId) {
      const grant = await approvalRequestGrantsDAL.findOne({
        requestId: request.id,
        granteeUserId: request.requesterId
      });
      if (grant) {
        isBreakGlass = Boolean(grant.isBreakGlass);
        bypassReason = grant.bypassReason ?? null;
      }
    }

    return {
      ...request,
      canBreakGlass,
      isBreakGlass,
      bypassReason
    };
  };

  const $resolveScope = async (
    scope: ApprovalPolicyScope,
    scopeId: string
  ): Promise<{ projectId: string; scopeType: string | null; scopeId: string | null }> => {
    if (scope === ApprovalPolicyScope.Project) {
      return { projectId: scopeId, scopeType: null, scopeId: null };
    }
    if (scope === ApprovalPolicyScope.PkiApplication) {
      const app = await pkiApplicationDAL.findById(scopeId);
      if (!app) {
        throw new NotFoundError({ message: `Application ${scopeId} not found` });
      }
      return { projectId: app.projectId, scopeType: ApprovalPolicyScope.PkiApplication, scopeId };
    }
    throw new BadRequestError({ message: `Unsupported scope: ${String(scope)}` });
  };

  const $assertCanManagePolicy = async (
    projectId: string,
    scopeType: string | null | undefined,
    scopeId: string | null | undefined,
    actor: OrgServiceActor,
    resourceAction: ResourcePermissionApprovalPolicyActions
  ) => {
    if (scopeType === ApprovalPolicyScope.PkiApplication && scopeId) {
      const { permission } = await permissionService.getResourcePermission({
        actor: actor.type,
        actorId: actor.id,
        projectId,
        resourceType: ResourceType.CertificateApplication,
        resourceId: scopeId,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId
      });
      ForbiddenError.from(permission).throwUnlessCan(resourceAction, ResourcePermissionSub.ApprovalPolicies);
      return;
    }

    const { hasRole } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.Any
    });

    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
    }
  };

  const $verifyProjectUserMembership = async (userIds: string[], orgId: string, projectId: string) => {
    const uniqueUserIds = [...new Set(userIds)];
    if (uniqueUserIds.length === 0) return;

    const allMemberships = await projectMembershipDAL.findProjectMembershipsByUserIds(orgId, uniqueUserIds);
    const projectMemberships = allMemberships.filter((membership) => membership.projectId === projectId);

    if (projectMemberships.length !== uniqueUserIds.length) {
      const projectMemberUserIds = new Set(projectMemberships.map((membership) => membership.userId));
      const userIdsNotInProject = uniqueUserIds.filter((id) => !projectMemberUserIds.has(id));
      throw new BadRequestError({
        message: `Some users are not members of the project: ${userIdsNotInProject.join(", ")}`
      });
    }
  };

  // Bypass-approve flow. Caller has already evaluated the predicate and confirmed eligibility.
  // Returns the same shape as approveRequest's standard branch.
  const $approveRequestBreakGlass = async ({
    requestId,
    request,
    actor,
    policy,
    policyType,
    bypassReason
  }: {
    requestId: string;
    request: TApprovalRequests;
    actor: OrgServiceActor;
    policy: TApprovalPolicies;
    policyType: ApprovalPolicyType;
    bypassReason: string;
  }): Promise<{
    request: TApprovalRequests & { steps: unknown[] } & TBypassAffordances;
    bypassMetadata: BreakGlassBypassMetadata;
  }> => {
    if (bypassReason.trim().length < 10) {
      throw new BadRequestError({
        message: "A bypass reason of at least 10 characters is required to bypass approvals"
      });
    }

    // Re-check project membership in case the user was removed after creating the request.
    await $verifyProjectUserMembership([actor.id], actor.orgId, request.projectId);

    const inputs = (request.requestData as { requestData: TPamAccessRequestData }).requestData;

    // Re-validate constraints in case the policy was tightened after the request was created.
    const fac = APPROVAL_POLICY_FACTORY_MAP[policyType](policyType);
    const constraintCheck = fac.validateConstraints(policy as unknown as TApprovalPolicy, inputs);
    if (!constraintCheck.valid) {
      throw new BadRequestError({
        message: constraintCheck.errors
          ? `Policy constraints not met: ${constraintCheck.errors.join("; ")}`
          : "Policy constraints not met"
      });
    }

    const steps = await approvalRequestDAL.findStepsByRequestId(requestId);

    const approverUserIdSet = new Set<string>();
    const approverGroupIds: string[] = [];
    for (const step of steps) {
      for (const approver of step.approvers) {
        if (approver.type === ApproverType.User) {
          approverUserIdSet.add(approver.id);
        } else {
          approverGroupIds.push(approver.id);
        }
      }
    }

    const expandedGroupMembers = (
      await Promise.all([...new Set(approverGroupIds)].map((groupId) => userGroupMembershipDAL.find({ groupId })))
    ).flat();
    expandedGroupMembers.forEach((m) => approverUserIdSet.add(m.userId));
    approverUserIdSet.delete(actor.id);

    const recipientUserIds = [...approverUserIdSet];

    const grant = await approvalRequestDAL.transaction(async (tx) => {
      const locked = await approvalRequestDAL.findByIdForUpdate(requestId, tx);
      if (!locked) {
        throw new ForbiddenRequestError({ message: "Request not found" });
      }

      if (locked.status !== ApprovalRequestStatus.Pending) {
        throw new BadRequestError({ message: "Request is not pending" });
      }

      if (locked.expiresAt && new Date(locked.expiresAt) < new Date()) {
        await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Expired }, tx);
        throw new BadRequestError({ message: "Request has expired" });
      }

      const requestSteps = await approvalRequestDAL.findStepsByRequestId(requestId);
      await Promise.all(
        requestSteps.map((step) =>
          approvalRequestStepsDAL.updateById(
            step.id,
            { status: ApprovalRequestStepStatus.Completed, completedAt: new Date() },
            tx
          )
        )
      );

      const currentStepRow = requestSteps.find((s) => s.stepNumber === locked.currentStep);
      if (currentStepRow) {
        await approvalRequestApprovalsDAL.create(
          {
            stepId: currentStepRow.id,
            approverUserId: actor.id,
            decision: ApprovalRequestApprovalDecision.Approved,
            comment: null
          },
          tx
        );
      }

      await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Approved }, tx);

      const durationMs = ms(inputs.accessDuration);
      const expiresAt = new Date(Date.now() + durationMs);

      return approvalRequestGrantsDAL.create(
        {
          projectId: request.projectId,
          requestId: request.id,
          granteeUserId: actor.id,
          status: ApprovalRequestGrantStatus.Active,
          type: request.type,
          attributes: inputs,
          expiresAt,
          isBreakGlass: true,
          bypassReason: bypassReason.trim()
        },
        tx
      );
    });

    const finalSteps = await approvalRequestDAL.findStepsByRequestId(requestId);
    const finalRequest = await approvalRequestDAL.findById(requestId);

    const result = { ...finalRequest, steps: finalSteps } as TApprovalRequest & { steps: unknown[] };
    const bypassMetadata: BreakGlassBypassMetadata = {
      grantId: grant.id,
      resourceName: inputs.resourceName,
      accountName: inputs.accountName,
      accessDuration: inputs.accessDuration,
      bypassReason: bypassReason.trim(),
      approverCount: recipientUserIds.length
    };

    if (recipientUserIds.length === 0) {
      return { request: await $decorateRequest(result, actor), bypassMetadata };
    }

    try {
      const [recipients, project, actingUser] = await Promise.all([
        userDAL.find({ $in: { id: recipientUserIds } }),
        projectDAL.findById(request.projectId),
        userDAL.findById(actor.id)
      ]);
      const cfg = getConfig();
      const approvalPath = project
        ? `/organizations/${project.orgId}/projects/pam/${request.projectId}/approvals/${requestId}`
        : null;

      const requesterFullName = actingUser
        ? `${actingUser.firstName ?? ""} ${actingUser.lastName ?? ""}`.trim() || (actingUser.email ?? "")
        : "Unknown user";
      const requesterEmail = actingUser?.email ?? "";

      await notificationService.createUserNotifications(
        recipients.map((r) => ({
          userId: r.id,
          orgId: actor.orgId,
          type: NotificationType.PAM_ACCESS_POLICY_BYPASSED,
          title: "PAM Access Policy Bypassed",
          body: `**${requesterFullName}** (${requesterEmail}) self-approved access to **${[
            inputs.resourceName,
            inputs.accountName
          ]
            .filter(Boolean)
            .join(" / ")}** without obtaining the required approval.`,
          link: approvalPath ?? undefined
        }))
      );

      const emailRecipients = recipients
        .map((r) => r.email)
        .filter((e): e is string => typeof e === "string" && e.length > 0);

      // Skip email when SITE_URL is unset — the link in the email would dead-link.
      if (emailRecipients.length > 0 && cfg.SITE_URL && approvalPath) {
        await smtpService.sendMail({
          recipients: emailRecipients,
          subjectLine: "Infisical PAM Access Policy Bypassed",
          substitutions: {
            projectName: project?.name ?? "Unknown project",
            requesterFullName,
            requesterEmail,
            resourceName: inputs.resourceName,
            accountName: inputs.accountName,
            accessDuration: inputs.accessDuration,
            bypassReason: bypassReason.trim(),
            approvalUrl: `${cfg.SITE_URL}${approvalPath}`
          },
          template: SmtpTemplates.AccessPamRequestBypassed
        });
      } else if (emailRecipients.length > 0 && !cfg.SITE_URL) {
        logger.warn({ requestId }, `Skipping break-glass email: SITE_URL is not configured [requestId=${requestId}]`);
      }
    } catch (err) {
      logger.error(
        { err, requestId, granteeUserId: actor.id },
        `Failed to deliver break-glass notifications [requestId=${requestId}] [granteeUserId=${actor.id}]`
      );
    }

    return { request: await $decorateRequest(result, actor), bypassMetadata };
  };

  const $verifyApplicationApproverMembership = async (
    approvers: { type: ApproverType; id: string }[],
    projectId: string,
    applicationId: string
  ) => {
    const userIds = [...new Set(approvers.filter((a) => a.type === ApproverType.User).map((a) => a.id))];
    const groupIds = [...new Set(approvers.filter((a) => a.type === ApproverType.Group).map((a) => a.id))];
    if (userIds.length === 0 && groupIds.length === 0) return;

    const memberships = await membershipDAL.find({
      scope: RESOURCE_SCOPE,
      scopeProjectId: projectId,
      scopeResourceType: ResourceType.CertificateApplication,
      scopeResourceId: applicationId
    });

    const memberUserIds = new Set(memberships.map((m) => m.actorUserId).filter((id): id is string => Boolean(id)));
    const memberGroupIds = new Set(memberships.map((m) => m.actorGroupId).filter((id): id is string => Boolean(id)));

    const usersNotInApp = userIds.filter((id) => !memberUserIds.has(id));
    const groupsNotInApp = groupIds.filter((id) => !memberGroupIds.has(id));

    if (usersNotInApp.length > 0 || groupsNotInApp.length > 0) {
      const parts: string[] = [];
      if (usersNotInApp.length > 0) parts.push(`users: ${usersNotInApp.join(", ")}`);
      if (groupsNotInApp.length > 0) parts.push(`groups: ${groupsNotInApp.join(", ")}`);
      throw new BadRequestError({
        message: `Approvers must be members of the Application. Not in Application — ${parts.join("; ")}`
      });
    }
  };

  const create = async (
    policyType: ApprovalPolicyType,
    {
      scope,
      scopeId: inputScopeId,
      name,
      maxRequestTtl,
      conditions,
      constraints,
      steps,
      bypassForMachineIdentities,
      enforcementLevel,
      bypassers
    }: TCreatePolicyDTO,
    actor: OrgServiceActor
  ) => {
    const resolved = await $resolveScope(scope, inputScopeId);
    const { projectId, scopeType: dbScopeType, scopeId: dbScopeId } = resolved;

    await $assertCanManagePolicy(
      projectId,
      dbScopeType,
      dbScopeId,
      actor,
      ResourcePermissionApprovalPolicyActions.Create
    );

    // Bypass-related fields are PAM-only at the moment. The schema accepts them on every policy
    // type for forward-compat, but the service rejects non-PAM use so admins can't silently store
    // configuration that the bypass branch will never honor.
    if (
      policyType !== ApprovalPolicyType.PamAccess &&
      (enforcementLevel === EnforcementLevel.Soft || (bypassers && bypassers.length > 0))
    ) {
      throw new BadRequestError({
        message: "Bypass approvals are only supported on PAM access policies"
      });
    }

    const allApprovers = steps.flatMap((step) => step.approvers ?? []);
    if (dbScopeType === ApprovalPolicyScope.PkiApplication && dbScopeId) {
      await $verifyApplicationApproverMembership(allApprovers, projectId, dbScopeId);
    } else {
      const approverUserIds = allApprovers
        .filter((approver) => approver.type === ApproverType.User)
        .map((approver) => approver.id);
      await $verifyProjectUserMembership(approverUserIds, actor.orgId, projectId);
    }

    const bypasserUserIds = (bypassers ?? [])
      .filter((bypasser) => bypasser.type === ApproverType.User)
      .map((bypasser) => bypasser.id);
    await $verifyProjectUserMembership(bypasserUserIds, actor.orgId, projectId);

    const policy = await approvalPolicyDAL.transaction(async (tx) => {
      const newPolicy = await approvalPolicyDAL.create(
        {
          projectId,
          organizationId: actor.orgId,
          name,
          maxRequestTtl,
          conditions: { version: 1, conditions },
          constraints: { version: 1, constraints },
          type: policyType,
          bypassForMachineIdentities: bypassForMachineIdentities ?? false,
          enforcementLevel: enforcementLevel ?? EnforcementLevel.Hard,
          scopeType: dbScopeType,
          scopeId: dbScopeId
        },
        tx
      );

      // Create policy steps and their approvers
      await Promise.all(
        steps.map(async (step, i) => {
          const newStep = await approvalPolicyStepsDAL.create(
            {
              policyId: newPolicy.id,
              requiredApprovals: step.requiredApprovals,
              stepNumber: i + 1,
              name: step.name,
              notifyApprovers: step.notifyApprovers
            },
            tx
          );

          if (step.approvers?.length) {
            await Promise.all(
              step.approvers.map((approver) =>
                approvalPolicyStepApproversDAL.create(
                  {
                    policyStepId: newStep.id,
                    userId: approver.type === ApproverType.User ? approver.id : null,
                    groupId: approver.type === ApproverType.Group ? approver.id : null
                  },
                  tx
                )
              )
            );
          }
        })
      );

      if (bypassers?.length) {
        await Promise.all(
          bypassers.map((bypasser) =>
            approvalPolicyBypassersDAL.create(
              {
                policyId: newPolicy.id,
                userId: bypasser.type === ApproverType.User ? bypasser.id : null,
                groupId: bypasser.type === ApproverType.Group ? bypasser.id : null
              },
              tx
            )
          )
        );
      }

      return newPolicy;
    });

    return {
      policy: { ...policy, steps, bypassers: bypassers ?? [] }
    };
  };

  const list = async (
    policyType: ApprovalPolicyType,
    scope: ApprovalPolicyScope,
    inputScopeId: string,
    actor: OrgServiceActor
  ) => {
    const { projectId, scopeType: dbScopeType, scopeId: dbScopeId } = await $resolveScope(scope, inputScopeId);

    await $assertCanManagePolicy(
      projectId,
      dbScopeType,
      dbScopeId,
      actor,
      ResourcePermissionApprovalPolicyActions.Read
    );

    const policies = await approvalPolicyDAL.findByProjectId(policyType, projectId, {
      scopeType: dbScopeType,
      scopeId: dbScopeId
    });

    return { policies, projectId };
  };

  const getById = async (policyId: string, actor: OrgServiceActor) => {
    const policy = await approvalPolicyDAL.findById(policyId);
    if (!policy) {
      throw new ForbiddenRequestError({ message: "Policy not found" });
    }

    await $assertCanManagePolicy(
      policy.projectId,
      policy.scopeType ?? null,
      policy.scopeId ?? null,
      actor,
      ResourcePermissionApprovalPolicyActions.Read
    );

    const [steps, bypassers] = await Promise.all([
      approvalPolicyDAL.findStepsByPolicyId(policyId),
      approvalPolicyDAL.findBypassersByPolicyId(policyId)
    ]);

    return { policy: { ...policy, steps, bypassers } };
  };

  const updateById = async (
    policyId: string,
    {
      name,
      maxRequestTtl,
      conditions,
      constraints,
      steps,
      bypassForMachineIdentities,
      enforcementLevel,
      bypassers
    }: TUpdatePolicyDTO,
    actor: OrgServiceActor
  ) => {
    const policy = await approvalPolicyDAL.findById(policyId);
    if (!policy) {
      throw new ForbiddenRequestError({ message: "Policy not found" });
    }

    const policyScopeType = policy.scopeType ?? null;
    const policyScopeId = policy.scopeId ?? null;

    await $assertCanManagePolicy(
      policy.projectId,
      policyScopeType,
      policyScopeId,
      actor,
      ResourcePermissionApprovalPolicyActions.Edit
    );

    if (
      policy.type !== ApprovalPolicyType.PamAccess &&
      (enforcementLevel === EnforcementLevel.Soft || (bypassers && bypassers.length > 0))
    ) {
      throw new BadRequestError({
        message: "Bypass approvals are only supported on PAM access policies"
      });
    }

    if (steps !== undefined) {
      const allApprovers = steps.flatMap((step) => step.approvers ?? []);
      if (policyScopeType === ApprovalPolicyScope.PkiApplication && policyScopeId) {
        await $verifyApplicationApproverMembership(allApprovers, policy.projectId, policyScopeId);
      } else {
        const approverUserIds = allApprovers
          .filter((approver) => approver.type === ApproverType.User)
          .map((approver) => approver.id);
        await $verifyProjectUserMembership(approverUserIds, actor.orgId, policy.projectId);
      }
    }

    if (bypassers !== undefined) {
      const bypasserUserIds = bypassers
        .filter((bypasser) => bypasser.type === ApproverType.User)
        .map((bypasser) => bypasser.id);
      await $verifyProjectUserMembership(bypasserUserIds, actor.orgId, policy.projectId);
    }

    const updatedPolicy = await approvalPolicyDAL.transaction(async (tx) => {
      const updateDoc: Partial<TApprovalPolicies> = {};

      if (name !== undefined) {
        updateDoc.name = name;
      }

      if (maxRequestTtl !== undefined) {
        updateDoc.maxRequestTtl = maxRequestTtl;
      }

      if (conditions !== undefined) {
        updateDoc.conditions = { version: 1, conditions };
      }

      if (constraints !== undefined) {
        updateDoc.constraints = { version: 1, constraints };
      }

      if (bypassForMachineIdentities !== undefined) {
        updateDoc.bypassForMachineIdentities = bypassForMachineIdentities;
      }

      if (enforcementLevel !== undefined) {
        updateDoc.enforcementLevel = enforcementLevel;
      }

      const updated = await approvalPolicyDAL.updateById(policyId, updateDoc, tx);

      if (steps !== undefined) {
        await approvalPolicyStepsDAL.delete({ policyId }, tx);

        await Promise.all(
          steps.map(async (step, i) => {
            const newStep = await approvalPolicyStepsDAL.create(
              {
                policyId,
                requiredApprovals: step.requiredApprovals,
                stepNumber: i + 1,
                name: step.name,
                notifyApprovers: step.notifyApprovers
              },
              tx
            );

            if (step.approvers?.length) {
              await Promise.all(
                step.approvers.map((approver) =>
                  approvalPolicyStepApproversDAL.create(
                    {
                      policyStepId: newStep.id,
                      userId: approver.type === ApproverType.User ? approver.id : null,
                      groupId: approver.type === ApproverType.Group ? approver.id : null
                    },
                    tx
                  )
                )
              );
            }
          })
        );
      }

      if (bypassers !== undefined) {
        await approvalPolicyBypassersDAL.delete({ policyId }, tx);

        if (bypassers.length) {
          await Promise.all(
            bypassers.map((bypasser) =>
              approvalPolicyBypassersDAL.create(
                {
                  policyId,
                  userId: bypasser.type === ApproverType.User ? bypasser.id : null,
                  groupId: bypasser.type === ApproverType.Group ? bypasser.id : null
                },
                tx
              )
            )
          );
        }
      }

      return updated;
    });

    const [fetchedSteps, fetchedBypassers] = await Promise.all([
      approvalPolicyDAL.findStepsByPolicyId(policyId),
      approvalPolicyDAL.findBypassersByPolicyId(policyId)
    ]);

    return {
      policy: { ...updatedPolicy, steps: fetchedSteps, bypassers: fetchedBypassers }
    };
  };

  const deleteById = async (policyId: string, actor: OrgServiceActor) => {
    const policy = await approvalPolicyDAL.findById(policyId);
    if (!policy) {
      throw new ForbiddenRequestError({ message: "Policy not found" });
    }

    await $assertCanManagePolicy(
      policy.projectId,
      policy.scopeType ?? null,
      policy.scopeId ?? null,
      actor,
      ResourcePermissionApprovalPolicyActions.Delete
    );

    await approvalPolicyDAL.deleteById(policyId);

    return {
      policyId,
      projectId: policy.projectId
    };
  };

  const createRequestFromPolicy = async ({
    projectId,
    organizationId,
    policy,
    requestData,
    justification,
    expiresAt,
    requesterUserId,
    machineIdentityId,
    requesterName,
    requesterEmail,
    tx
  }: TCreateRequestFromPolicyDTO) => {
    const requestWithSteps = await createApprovalRequestWithSteps(
      {
        projectId,
        organizationId,
        policyId: policy.id,
        policyType: policy.type as ApprovalPolicyType,
        policySteps: policy.steps,
        requestData,
        justification,
        expiresAt,
        requesterUserId,
        machineIdentityId,
        requesterName,
        requesterEmail,
        scopeType: policy.scopeType ?? null,
        scopeId: policy.scopeId ?? null
      },
      {
        approvalRequestDAL,
        approvalRequestStepsDAL,
        approvalRequestStepEligibleApproversDAL
      },
      tx
    );

    if (requestWithSteps.steps.length > 0) {
      await $notifyApprovers(requestWithSteps.steps[0], requestWithSteps);
    }

    return {
      request: requestWithSteps
    };
  };

  const createRequest = async (
    policyType: ApprovalPolicyType,
    {
      scope,
      scopeId: inputScopeId,
      requestData,
      requestDuration,
      justification,
      requesterName,
      requesterEmail,
      machineIdentityId
    }: TCreateRequestDTO & {
      requesterName: string;
      requesterEmail: string;
      machineIdentityId?: string;
    },
    actor: OrgServiceActor
  ) => {
    const { projectId } = await $resolveScope(scope, inputScopeId);

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.Any
    });

    if (policyType === ApprovalPolicyType.CertCodeSigning) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionCodeSigningActions.Sign,
        ProjectPermissionSub.CodeSigners
      );
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionApprovalRequestActions.Create,
        ProjectPermissionSub.ApprovalRequests
      );
    }

    const fac = APPROVAL_POLICY_FACTORY_MAP[policyType](policyType);

    const policy = await fac.matchPolicy(approvalPolicyDAL, projectId, requestData);

    if (!policy) {
      throw new ForbiddenRequestError({
        message: "No policies match the requested resource, you can access it without a request"
      });
    }

    const constraintValidation = fac.validateConstraints(policy, requestData);
    if (!constraintValidation.valid) {
      const errorMessage = constraintValidation.errors
        ? `Policy constraints not met: ${constraintValidation.errors.join("; ")}`
        : "Policy constraints not met";
      throw new ForbiddenRequestError({ message: errorMessage });
    }

    let expiresAt: Date | undefined;

    if (requestDuration) {
      const ttlMs = ms(requestDuration);

      expiresAt = new Date(Date.now() + ttlMs);

      if (policy.maxRequestTtl) {
        const maxTtlMs = ms(policy.maxRequestTtl);
        if (ttlMs > maxTtlMs) {
          throw new BadRequestError({
            message: `Expiration time exceeds the maximum allowed TTL of ${policy.maxRequestTtl}`
          });
        }
      }
    }

    const created = await createRequestFromPolicy({
      projectId,
      organizationId: actor.orgId,
      policy,
      requestData,
      justification,
      expiresAt,
      requesterUserId: actor.type === ActorType.IDENTITY ? undefined : actor.id,
      machineIdentityId,
      requesterName,
      requesterEmail
    });

    const decorated = await $decorateRequest(created.request, actor);
    return { request: decorated };
  };

  const getRequestById = async (requestId: string, actor: OrgServiceActor) => {
    const request = await approvalRequestDAL.findById(requestId);
    if (!request) {
      throw new ForbiddenRequestError({ message: "Request not found" });
    }

    const steps = await approvalRequestDAL.findStepsByRequestId(requestId);

    const isRequester = request.requesterId === actor.id;

    // Check if user is an eligible approver for any step
    const userGroups = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(actor.id, actor.orgId);
    const userGroupIds = new Set(userGroups.map((g) => g.groupId));

    const isApprover = steps.some((step) =>
      step.approvers.some(
        (approver) =>
          (approver.type === ApproverType.User && approver.id === actor.id) ||
          (approver.type === ApproverType.Group && userGroupIds.has(approver.id))
      )
    );

    // If user is requester or approver, allow access regardless of role permission
    if (!isRequester && !isApprover) {
      if (request.scopeType === ApprovalPolicyScope.PkiApplication && request.scopeId) {
        const { permission: resourcePermission } = await permissionService.getResourcePermission({
          actor: actor.type,
          actorId: actor.id,
          projectId: request.projectId,
          resourceType: ResourceType.CertificateApplication,
          resourceId: request.scopeId,
          actorAuthMethod: actor.authMethod,
          actorOrgId: actor.orgId
        });
        if (
          !resourcePermission.can(ProjectPermissionApprovalRequestActions.Read, ResourcePermissionSub.ApprovalRequests)
        ) {
          throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
        }
      } else {
        const { permission } = await permissionService.getProjectPermission({
          actor: actor.type,
          actorAuthMethod: actor.authMethod,
          actorId: actor.id,
          actorOrgId: actor.orgId,
          projectId: request.projectId,
          actionProjectType: ActionProjectType.Any
        });
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionApprovalRequestActions.Read,
          ProjectPermissionSub.ApprovalRequests
        );
      }
    }

    const decorated = await $decorateRequest({ ...request, steps }, actor);
    return { request: decorated };
  };

  const approveRequest = async (
    requestId: string,
    { comment, bypassReason }: { comment?: string; bypassReason?: string },
    actor: OrgServiceActor,
    policyType: ApprovalPolicyType
  ): Promise<{
    request: TApprovalRequests & { steps: unknown[] } & TBypassAffordances;
    bypassMetadata?: BreakGlassBypassMetadata;
  }> => {
    const request = await approvalRequestDAL.findById(requestId);
    if (!request) {
      throw new ForbiddenRequestError({ message: "Request not found" });
    }

    if (request.type !== policyType) {
      throw new BadRequestError({
        message: `Request type mismatch: expected ${policyType}, got ${request.type}`
      });
    }

    if (bypassReason !== undefined && policyType !== ApprovalPolicyType.PamAccess) {
      throw new BadRequestError({
        message: "bypassReason is only supported for PAM access requests"
      });
    }

    if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
      await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Expired });
      throw new BadRequestError({ message: "Request has expired" });
    }

    const policy =
      bypassReason !== undefined && policyType === ApprovalPolicyType.PamAccess && request.policyId
        ? await approvalPolicyDAL.findById(request.policyId)
        : null;
    const bypassers: PolicyBypasser[] =
      bypassReason !== undefined && policyType === ApprovalPolicyType.PamAccess && request.policyId
        ? await approvalPolicyDAL.findBypassersByPolicyId(request.policyId)
        : [];

    if (bypassReason !== undefined && !policy) {
      throw new BadRequestError({
        message: "Policy no longer exists; cannot evaluate break-glass"
      });
    }

    const userGroups = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(actor.id, actor.orgId);
    const userGroupIds = new Set(userGroups.map((g) => g.groupId));

    // Opt-in: only triggers when the caller passes bypassReason.
    const isBreakGlass =
      bypassReason !== undefined &&
      policyType === ApprovalPolicyType.PamAccess &&
      actor.type === ActorType.USER &&
      request.requesterId === actor.id &&
      Boolean(policy) &&
      policy?.enforcementLevel === EnforcementLevel.Soft &&
      (bypassers.length === 0 ||
        bypassers.some(
          (b) =>
            (b.type === ApproverType.User && b.id === actor.id) ||
            (b.type === ApproverType.Group && userGroupIds.has(b.id))
        ));

    if (isBreakGlass) {
      return $approveRequestBreakGlass({
        requestId,
        request,
        actor,
        policy,
        policyType,
        bypassReason
      });
    }

    if (request.status !== ApprovalRequestStatus.Pending) {
      throw new BadRequestError({ message: "Request is not pending" });
    }

    const steps = await approvalRequestDAL.findStepsByRequestId(requestId);
    const currentStepIndex = steps.findIndex((s) => s.stepNumber === request.currentStep);
    if (currentStepIndex === -1) {
      throw new BadRequestError({ message: "Current step not found" });
    }

    const currentStep = steps[currentStepIndex];

    const isEligible = currentStep.approvers.some(
      (approver) =>
        (approver.type === ApproverType.User && approver.id === actor.id) ||
        (approver.type === ApproverType.Group && userGroupIds.has(approver.id))
    );

    if (!isEligible) {
      throw new ForbiddenRequestError({ message: "You are not an eligible approver for this step" });
    }

    const hasApproved = currentStep.approvals.some((a) => a.approverUserId === actor.id);
    if (hasApproved) {
      throw new BadRequestError({ message: "You have already approved this request" });
    }

    const { updatedRequest, nextStepToNotify } = await approvalRequestDAL.transaction(async (tx) => {
      let nextStepToNotifyInner = null;

      // Create approval
      await approvalRequestApprovalsDAL.create(
        {
          stepId: currentStep.id,
          approverUserId: actor.id,
          decision: ApprovalRequestApprovalDecision.Approved,
          comment
        },
        tx
      );

      const newApprovalCount = currentStep.approvals.length + 1;
      if (newApprovalCount >= currentStep.requiredApprovals) {
        // Step completed
        await approvalRequestStepsDAL.updateById(
          currentStep.id,
          {
            status: ApprovalRequestStepStatus.Completed,
            completedAt: new Date()
          },
          tx
        );

        const nextStep = steps[currentStepIndex + 1];
        if (nextStep) {
          // Move to next step
          await approvalRequestDAL.updateById(
            requestId,
            {
              currentStep: request.currentStep + 1
            },
            tx
          );

          await approvalRequestStepsDAL.updateById(
            nextStep.id,
            {
              status: ApprovalRequestStepStatus.InProgress,
              startedAt: new Date()
            },
            tx
          );

          nextStepToNotifyInner = nextStep;
        } else {
          // All steps completed
          const completedReq = await approvalRequestDAL.updateById(
            requestId,
            {
              status: ApprovalRequestStatus.Approved
            },
            tx
          );

          return { updatedRequest: completedReq, nextStepToNotify: null };
        }
      }

      return { updatedRequest: request, nextStepToNotify: nextStepToNotifyInner };
    });

    if (nextStepToNotify) {
      await $notifyApprovers(nextStepToNotify, updatedRequest);
    }

    // Fetch fresh state
    const finalSteps = await approvalRequestDAL.findStepsByRequestId(requestId);
    const finalRequest = await approvalRequestDAL.findById(requestId);

    const newRequest = { ...finalRequest, steps: finalSteps };

    if (finalRequest.status === ApprovalRequestStatus.Approved) {
      const fac = APPROVAL_POLICY_FACTORY_MAP[updatedRequest.type as ApprovalPolicyType](
        updatedRequest.type as ApprovalPolicyType
      );

      const postApprovalContext: TPostApprovalContext = {
        actor: {
          type: actor.type,
          id: actor.id,
          authMethod: actor.authMethod,
          orgId: actor.orgId
        },
        certificateApprovalService,
        certificateRequestDAL
      };

      await fac.postApprovalRoutine(approvalRequestGrantsDAL, newRequest as TApprovalRequest, postApprovalContext);
    }

    const decorated = await $decorateRequest(newRequest, actor);
    return { request: decorated };
  };

  const rejectRequest = async (requestId: string, { comment }: { comment?: string }, actor: OrgServiceActor) => {
    const request = await approvalRequestDAL.findById(requestId);
    if (!request) {
      throw new ForbiddenRequestError({ message: "Request not found" });
    }

    if (request.status !== ApprovalRequestStatus.Pending) {
      throw new BadRequestError({ message: "Request is not pending" });
    }

    if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
      await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Expired });
      throw new BadRequestError({ message: "Request has expired" });
    }

    const steps = await approvalRequestDAL.findStepsByRequestId(requestId);
    const currentStep = steps.find((s) => s.stepNumber === request.currentStep);

    if (!currentStep) {
      throw new BadRequestError({ message: "Current step not found" });
    }

    const userGroups = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(actor.id, actor.orgId);
    const userGroupIds = new Set(userGroups.map((g) => g.groupId));

    const isEligible = currentStep.approvers.some(
      (approver) =>
        (approver.type === ApproverType.User && approver.id === actor.id) ||
        (approver.type === ApproverType.Group && userGroupIds.has(approver.id))
    );

    if (!isEligible) {
      throw new ForbiddenRequestError({ message: "You are not an eligible approver for this step" });
    }

    await approvalRequestDAL.transaction(async (tx) => {
      await approvalRequestApprovalsDAL.create(
        {
          stepId: currentStep.id,
          approverUserId: actor.id,
          decision: ApprovalRequestApprovalDecision.Rejected,
          comment
        },
        tx
      );

      await approvalRequestDAL.updateById(
        requestId,
        {
          status: ApprovalRequestStatus.Rejected
        },
        tx
      );
    });

    const finalSteps = await approvalRequestDAL.findStepsByRequestId(requestId);
    const finalRequest = await approvalRequestDAL.findById(requestId);

    if (finalRequest) {
      const fac = APPROVAL_POLICY_FACTORY_MAP[finalRequest.type as ApprovalPolicyType](
        finalRequest.type as ApprovalPolicyType
      );

      const postRejectionContext: TPostApprovalContext = {
        certificateApprovalService,
        certificateRequestDAL
      };

      await fac.postRejectionRoutine(finalRequest as TApprovalRequest, postRejectionContext);
    }

    const decorated = await $decorateRequest({ ...finalRequest, steps: finalSteps }, actor);
    return { request: decorated };
  };

  const listRequests = async (
    policyType: ApprovalPolicyType,
    scope: ApprovalPolicyScope,
    inputScopeId: string,
    actor: OrgServiceActor
  ) => {
    const { projectId, scopeType: dbScopeType, scopeId: dbScopeId } = await $resolveScope(scope, inputScopeId);

    let hasReadPermission: boolean;
    if (scope === ApprovalPolicyScope.PkiApplication && inputScopeId) {
      const { permission: resourcePermission } = await permissionService.getResourcePermission({
        actor: actor.type,
        actorId: actor.id,
        projectId,
        resourceType: ResourceType.CertificateApplication,
        resourceId: inputScopeId,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId
      });
      hasReadPermission = resourcePermission.can(
        ProjectPermissionApprovalRequestActions.Read,
        ResourcePermissionSub.ApprovalRequests
      );
    } else {
      const { permission } = await permissionService.getProjectPermission({
        actor: actor.type,
        actorAuthMethod: actor.authMethod,
        actorId: actor.id,
        actorOrgId: actor.orgId,
        projectId,
        actionProjectType: ActionProjectType.Any
      });
      hasReadPermission = permission.can(
        ProjectPermissionApprovalRequestActions.Read,
        ProjectPermissionSub.ApprovalRequests
      );
    }

    const requests = await approvalRequestDAL.findByProjectId(
      policyType,
      projectId,
      scope === ApprovalPolicyScope.Project ? undefined : { scopeType: dbScopeType, scopeId: dbScopeId }
    );

    const ctx = $buildDecorationContext(actor);

    const visibleRequests = await (async () => {
      if (hasReadPermission) return requests;

      const userGroupIds = await ctx.getUserGroupIds();

      return requests.filter((request) => {
        if (request.requesterId === actor.id) return true;
        return request.steps.some((step) =>
          step.approvers.some(
            (approver) =>
              (approver.type === ApproverType.User && approver.id === actor.id) ||
              (approver.type === ApproverType.Group && userGroupIds.has(approver.id))
          )
        );
      });
    })();

    if (visibleRequests.length > 0) {
      const requestIds = visibleRequests.map((r) => r.id);
      const policyIds = [...new Set(visibleRequests.map((r) => r.policyId).filter((id): id is string => Boolean(id)))];

      const [grants, policies, bypassersByPolicyId] = await Promise.all([
        approvalRequestGrantsDAL.find({ $in: { requestId: requestIds } }),
        policyIds.length
          ? approvalPolicyDAL.find({ $in: { id: policyIds } })
          : Promise.resolve([] as Awaited<ReturnType<typeof approvalPolicyDAL.find>>),
        approvalPolicyDAL.findBypassersByPolicyIds(policyIds)
      ]);

      ctx.grantsByRequestId = new Map();
      for (const g of grants) {
        if (g.requestId) {
          const owner = visibleRequests.find((r) => r.id === g.requestId)?.requesterId;
          if (!owner || g.granteeUserId === owner) {
            ctx.grantsByRequestId.set(g.requestId, {
              isBreakGlass: Boolean(g.isBreakGlass),
              bypassReason: g.bypassReason ?? null
            });
          }
        }
      }

      ctx.policyById = new Map(policies.map((p) => [p.id, p]));
      ctx.bypassersByPolicyId = new Map(Object.entries(bypassersByPolicyId));
    }

    const decorated = await Promise.all(visibleRequests.map((r) => $decorateRequest(r, actor, ctx)));
    return { requests: decorated, projectId };
  };

  const cancelRequest = async (requestId: string, actor: OrgServiceActor) => {
    const request = await approvalRequestDAL.findById(requestId);
    if (!request) {
      throw new ForbiddenRequestError({ message: "Request not found" });
    }

    if (request.status !== ApprovalRequestStatus.Pending) {
      throw new BadRequestError({ message: "Request is not pending" });
    }

    if (request.requesterId !== actor.id) {
      throw new ForbiddenRequestError({ message: "You are not the requester of this request" });
    }

    const updatedRequest = await approvalRequestDAL.updateById(requestId, {
      status: ApprovalRequestStatus.Cancelled
    });

    const steps = await approvalRequestDAL.findStepsByRequestId(requestId);

    const decorated = await $decorateRequest({ ...updatedRequest, steps }, actor);
    return { request: decorated };
  };

  const listGrants = async (
    policyType: ApprovalPolicyType,
    scope: ApprovalPolicyScope,
    inputScopeId: string,
    actor: OrgServiceActor
  ) => {
    const { projectId, scopeType: dbScopeType, scopeId: dbScopeId } = await $resolveScope(scope, inputScopeId);

    if (scope === ApprovalPolicyScope.PkiApplication && inputScopeId) {
      const { permission: resourcePermission } = await permissionService.getResourcePermission({
        actor: actor.type,
        actorId: actor.id,
        projectId,
        resourceType: ResourceType.CertificateApplication,
        resourceId: inputScopeId,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId
      });
      if (
        !resourcePermission.can(
          ProjectPermissionApprovalRequestGrantActions.Read,
          ResourcePermissionSub.ApprovalRequestGrants
        )
      ) {
        throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
      }
    } else {
      const { permission } = await permissionService.getProjectPermission({
        actor: actor.type,
        actorAuthMethod: actor.authMethod,
        actorId: actor.id,
        actorOrgId: actor.orgId,
        projectId,
        actionProjectType: ActionProjectType.Any
      });
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionApprovalRequestGrantActions.Read,
        ProjectPermissionSub.ApprovalRequestGrants
      );
    }

    const grants = await approvalRequestGrantsDAL.findByProjectAndScope({
      projectId,
      type: policyType,
      scopeType: dbScopeType,
      scopeId: dbScopeId
    });
    const updatedGrants = grants.map((grant) => {
      if (
        grant.status === ApprovalRequestGrantStatus.Active &&
        grant.expiresAt &&
        new Date(grant.expiresAt) < new Date()
      ) {
        return { ...grant, status: ApprovalRequestGrantStatus.Expired };
      }
      return grant;
    });

    return { grants: updatedGrants, projectId };
  };

  const getGrantById = async (grantId: string, actor: OrgServiceActor) => {
    const grant = await approvalRequestGrantsDAL.findById(grantId);
    if (!grant) {
      throw new NotFoundError({ message: "Grant not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: grant.projectId,
      actionProjectType: ActionProjectType.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionApprovalRequestGrantActions.Read,
      ProjectPermissionSub.ApprovalRequestGrants
    );

    let { status } = grant;
    if (
      grant.status === ApprovalRequestGrantStatus.Active &&
      grant.expiresAt &&
      new Date(grant.expiresAt) < new Date()
    ) {
      status = ApprovalRequestGrantStatus.Expired;
    }
    return { grant: { ...grant, status } };
  };

  const revokeGrant = async (
    grantId: string,
    { revocationReason }: { revocationReason?: string },
    actor: OrgServiceActor
  ) => {
    const grant = await approvalRequestGrantsDAL.findById(grantId);
    if (!grant) {
      throw new NotFoundError({ message: "Grant not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: grant.projectId,
      actionProjectType: ActionProjectType.Any
    });

    const allowedAtProject = permission.can(
      ProjectPermissionApprovalRequestGrantActions.Revoke,
      ProjectPermissionSub.ApprovalRequestGrants
    );

    if (!allowedAtProject) {
      const request = grant.requestId ? await approvalRequestDAL.findById(grant.requestId) : null;
      const requestScopeType = (request as { scopeType?: string | null } | null)?.scopeType ?? null;
      const requestScopeId = (request as { scopeId?: string | null } | null)?.scopeId ?? null;
      if (requestScopeType === ApprovalPolicyScope.PkiApplication && requestScopeId) {
        const { permission: resourcePerm } = await permissionService.getResourcePermission({
          actor: actor.type,
          actorId: actor.id,
          projectId: grant.projectId,
          resourceType: ResourceType.CertificateApplication,
          resourceId: requestScopeId,
          actorAuthMethod: actor.authMethod,
          actorOrgId: actor.orgId
        });
        ForbiddenError.from(resourcePerm).throwUnlessCan(
          ProjectPermissionApprovalRequestGrantActions.Revoke,
          ResourcePermissionSub.ApprovalRequestGrants
        );
      } else {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionApprovalRequestGrantActions.Revoke,
          ProjectPermissionSub.ApprovalRequestGrants
        );
      }
    }

    if (grant.status !== ApprovalRequestGrantStatus.Active) {
      throw new BadRequestError({ message: "Grant is not active" });
    }

    const updatedGrant = await approvalRequestGrantsDAL.updateById(grantId, {
      status: ApprovalRequestGrantStatus.Revoked,
      revokedAt: new Date(),
      revokedByUserId: actor.id,
      revocationReason
    });

    return { grant: updatedGrant };
  };

  const checkPolicyMatch = async (
    policyType: ApprovalPolicyType,
    { projectId, inputs }: { projectId: string; inputs: TApprovalPolicyInputs },
    actor: OrgServiceActor
  ) => {
    await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.Any
    });

    const fac = APPROVAL_POLICY_FACTORY_MAP[policyType](policyType);

    const policy = await fac.matchPolicy(approvalPolicyDAL, projectId, inputs);

    if (!policy) {
      return { requiresApproval: false, hasActiveGrant: false };
    }

    const activeGrant = await fac.canAccess(approvalRequestGrantsDAL, projectId, actor.id, inputs);

    const innerConstraints = policy.constraints?.constraints;
    const constraints =
      innerConstraints && "accessDuration" in innerConstraints
        ? { accessDuration: { max: innerConstraints.accessDuration.max } }
        : undefined;

    return {
      requiresApproval: !activeGrant,
      hasActiveGrant: !!activeGrant,
      constraints
    };
  };

  return {
    create,
    list,
    getById,
    updateById,
    deleteById,
    createRequest,
    createRequestFromPolicy,
    listRequests,
    getRequestById,
    approveRequest,
    rejectRequest,
    cancelRequest,
    listGrants,
    getGrantById,
    revokeGrant,
    checkPolicyMatch
  };
};
