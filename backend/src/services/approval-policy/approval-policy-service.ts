import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import {
  ActionProjectType,
  OrganizationActionScope,
  ProjectMembershipRole,
  RESOURCE_SCOPE,
  ResourceType,
  TApprovalPolicies,
  TApprovalRequests
} from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
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
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { TPkiApplicationDALFactory } from "@app/services/pki-application/pki-application-dal";
import { TSlackIntegrationDALFactory } from "@app/services/slack/slack-integration-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TMembershipDALFactory } from "../membership/membership-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { dispatchApprovalNotification } from "./approval-notification-fns";
import {
  TApprovalPolicyBypassersDALFactory,
  TApprovalPolicyDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "./approval-policy-dal";
import {
  ApprovalAuditAction,
  ApprovalNotificationEvent,
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApprovalRequestApprovalDecision,
  ApprovalRequestGrantStatus,
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  ApproverType,
  EnforcementLevel
} from "./approval-policy-enums";
import {
  ApprovalAccessStatus,
  BreakGlassBypassMetadata,
  PolicyBypasser,
  TApprovalAccessStatus,
  TApprovalActor,
  TApprovalPolicy,
  TApprovalPolicyInputs,
  TApprovalRequest,
  TApprovalRequestData,
  TApprovalResourceRegistry,
  TApprovalScopeConfiguration,
  TApprovalSubjectActor,
  TBypassAffordances,
  TCreatePolicyDTO,
  TCreateRequestDTO,
  TCreateRequestFromPolicyDTO,
  TDecorationContext,
  TUpdatePolicyDTO
} from "./approval-policy-types";
import {
  TApprovalRequestApprovalsDALFactory,
  TApprovalRequestDALFactory,
  TApprovalRequestGrantsDALFactory,
  TApprovalRequestStepEligibleApproversDALFactory,
  TApprovalRequestStepsDALFactory
} from "./approval-request-dal";
import { createApprovalRequestWithSteps } from "./approval-request-fns";

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
  slackIntegrationDAL: Pick<TSlackIntegrationDALFactory, "findByIdWithWorkflowIntegrationDetails">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  notificationService: TNotificationServiceFactory;
  permissionService: Pick<
    TPermissionServiceFactory,
    "getProjectPermission" | "getOrgPermission" | "getResourcePermission"
  >;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findProjectMembershipsByUserIds">;
  membershipDAL: Pick<TMembershipDALFactory, "find">;
  pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById">;
  smtpService: Pick<TSmtpService, "sendMail">;
  userDAL: Pick<TUserDALFactory, "findById" | "find">;
  groupDAL: Pick<TGroupDALFactory, "find">;
  resources: TApprovalResourceRegistry;
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
  slackIntegrationDAL,
  kmsService,
  notificationService,
  permissionService,
  licenseService,
  projectMembershipDAL,
  membershipDAL,
  pkiApplicationDAL,
  smtpService,
  userDAL,
  groupDAL,
  resources
}: TApprovalPolicyServiceFactoryDep) => {
  const $resource = (policyType: ApprovalPolicyType) => {
    const resource = resources[policyType];
    if (!resource) {
      throw new BadRequestError({ message: `Approvals are not configured for ${policyType}` });
    }
    return resource;
  };

  const $notificationDeps = {
    userGroupMembershipDAL,
    userDAL,
    notificationService,
    smtpService,
    slackIntegrationDAL,
    kmsService
  };

  const $notify = (args: {
    event: ApprovalNotificationEvent;
    request: TApprovalRequests;
    approvers?: { type: ApproverType; id: string }[];
    actorId?: string;
    comment?: string;
    bypassReason?: string;
  }) =>
    dispatchApprovalNotification(
      { ...args, approvers: args.approvers ?? [], resource: $resource(args.request.type as ApprovalPolicyType) },
      $notificationDeps
    );

  const $buildDecorationContext = (actor: TApprovalActor): TDecorationContext => {
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

  // A request attributes its requester to exactly one column: a user or a machine identity.
  // Actor ids are unique across orgs but an actor can hold tokens for several, and a requester
  // match skips the permission check, so the token's org has to match too.
  const $isRequester = (
    request: { organizationId: string; requesterId?: string | null; machineIdentityId?: string | null },
    actor: TApprovalActor
  ) => {
    if (request.organizationId !== actor.orgId) return false;

    return actor.type === ActorType.IDENTITY
      ? request.machineIdentityId === actor.id
      : request.requesterId === actor.id;
  };

  const $isBreakGlassEligible = async ({
    request,
    policy,
    bypassers,
    actor,
    getUserGroupIds
  }: {
    request: TApprovalRequests;
    policy: TApprovalPolicies;
    bypassers: PolicyBypasser[];
    actor: TApprovalActor;
    getUserGroupIds: () => Promise<Set<string>>;
  }) => {
    const domainPredicate = resources[policy.type as ApprovalPolicyType]?.isBreakGlassEligible;
    if (domainPredicate) {
      return domainPredicate({ request, policy, bypassers, actor, userGroupIds: await getUserGroupIds() });
    }

    if (policy.enforcementLevel !== EnforcementLevel.Soft) return false;
    if (bypassers.length === 0) return true;

    const userGroupIds = await getUserGroupIds();
    return bypassers.some(
      (b) =>
        (b.type === ApproverType.User && b.id === actor.id) || (b.type === ApproverType.Group && userGroupIds.has(b.id))
    );
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
    actor: TApprovalActor,
    ctx: TDecorationContext = $buildDecorationContext(actor)
  ): Promise<R & TBypassAffordances> => {
    if (!resources[request.type as ApprovalPolicyType]?.isBreakGlassEligible) {
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
      if (policy) {
        const bypassers =
          ctx.bypassersByPolicyId?.get(request.policyId) ??
          (await approvalPolicyDAL.findBypassersByPolicyId(request.policyId));
        canBreakGlass = await $isBreakGlassEligible({
          request: request as unknown as TApprovalRequests,
          policy,
          bypassers,
          actor,
          getUserGroupIds: ctx.getUserGroupIds
        });
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
    scopeId: string,
    policyType: ApprovalPolicyType
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

    const resolveDomainScope = resources[policyType]?.resolveScope;
    if (resolveDomainScope) {
      const { projectId } = await resolveDomainScope(scopeId);
      return { projectId, scopeType: scope, scopeId };
    }

    throw new BadRequestError({ message: `Unsupported scope: ${String(scope)}` });
  };

  const $assertCanManagePolicy = async (
    projectId: string,
    scopeType: string | null | undefined,
    scopeId: string | null | undefined,
    actor: TApprovalActor,
    resourceAction: ResourcePermissionApprovalPolicyActions,
    policyType: ApprovalPolicyType
  ) => {
    const assertDomainCanManage = resources[policyType]?.assertCanManagePolicy;
    if (assertDomainCanManage) {
      await assertDomainCanManage({ projectId, scopeId: scopeId ?? null, actor, action: resourceAction });
      return;
    }

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
    actor: TApprovalActor;
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

    if (!resources[policyType]) {
      await $verifyProjectUserMembership([actor.id], actor.orgId, request.projectId);
    }

    const inputs = (request.requestData as { requestData: TApprovalRequestData }).requestData;

    // Re-validate constraints in case the policy was tightened after the request was created.
    const resource = $resource(policyType);
    const constraintCheck = resource.validateConstraints(policy as unknown as TApprovalPolicy, inputs);
    if (!constraintCheck.valid) {
      throw new BadRequestError({
        message: constraintCheck.errors
          ? `Policy constraints not met: ${constraintCheck.errors.join("; ")}`
          : "Policy constraints not met"
      });
    }

    const steps = await approvalRequestDAL.findStepsByRequestId(requestId);

    const bypassedApproverCount = new Set(steps.flatMap((step) => step.approvers.map((a) => `${a.type}:${a.id}`))).size;

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

      const requestSteps = await approvalRequestDAL.findStepsByRequestId(requestId, tx);
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

      const approvedRequest = await approvalRequestDAL.updateById(
        requestId,
        { status: ApprovalRequestStatus.Approved },
        tx
      );

      const result = await resource.postApprovalTxRoutine?.(approvedRequest as TApprovalRequest, tx, {
        bypassReason: bypassReason.trim()
      });

      if (!result?.grantId) {
        throw new BadRequestError({ message: `Bypassing approval is not supported for ${policyType} requests` });
      }

      return result;
    });

    const finalSteps = await approvalRequestDAL.findStepsByRequestId(requestId);
    const finalRequest = await approvalRequestDAL.findById(requestId);

    const result = { ...finalRequest, steps: finalSteps } as TApprovalRequest & { steps: unknown[] };
    const bypassMetadata: BreakGlassBypassMetadata = {
      grantId: grant.grantId,
      bypassReason: bypassReason.trim(),
      approverCount: bypassedApproverCount
    };

    const livePolicySteps = await approvalPolicyDAL.findStepsByPolicyId(policy.id);
    await $notify({
      event: ApprovalNotificationEvent.Bypassed,
      request: finalRequest,
      approvers: livePolicySteps.flatMap((step) => step.approvers),
      actorId: actor.id,
      bypassReason: bypassReason.trim()
    });

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

  const $verifyPolicyActors = async ({
    policyType,
    projectId,
    orgId,
    scopeType,
    scopeId,
    approvers,
    bypassers
  }: {
    policyType: ApprovalPolicyType;
    projectId: string;
    orgId: string;
    scopeType: string | null;
    scopeId: string | null;
    approvers: PolicyBypasser[];
    bypassers: PolicyBypasser[];
  }) => {
    const verifyDomainActors = resources[policyType]?.verifyPolicyActors;
    if (verifyDomainActors) {
      await verifyDomainActors({ projectId, scopeId, approvers, bypassers });
      return;
    }

    if (scopeType === ApprovalPolicyScope.PkiApplication && scopeId) {
      await $verifyApplicationApproverMembership(approvers, projectId, scopeId);
    } else {
      await $verifyProjectUserMembership(
        approvers.filter((approver) => approver.type === ApproverType.User).map((approver) => approver.id),
        orgId,
        projectId
      );
    }

    await $verifyProjectUserMembership(
      bypassers.filter((bypasser) => bypasser.type === ApproverType.User).map((bypasser) => bypasser.id),
      orgId,
      projectId
    );
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
    actor: TApprovalActor
  ) => {
    const resolved = await $resolveScope(scope, inputScopeId, policyType);
    const { projectId, scopeType: dbScopeType, scopeId: dbScopeId } = resolved;

    await $assertCanManagePolicy(
      projectId,
      dbScopeType,
      dbScopeId,
      actor,
      ResourcePermissionApprovalPolicyActions.Create,
      policyType
    );

    // CertRequest only: code signing follows pkiCodeSigning and PAM has its own product entitlement.
    if (policyType === ApprovalPolicyType.CertRequest) {
      const plan = await licenseService.getPlan(actor.orgId);
      if (!plan.pkiApprovals) {
        throw new BadRequestError({
          message:
            "Failed to create certificate approval policy due to plan restriction. Upgrade plan to use certificate approvals."
        });
      }
    }

    // The schema accepts bypass fields on every type, so reject them where nothing would honor them.
    if (
      !resources[policyType]?.isBreakGlassEligible &&
      (enforcementLevel === EnforcementLevel.Soft || (bypassers && bypassers.length > 0))
    ) {
      throw new BadRequestError({
        message: `Bypassing approval is not supported for ${policyType} policies`
      });
    }

    if (resources[policyType]?.singlePolicyPerScope && dbScopeId) {
      const existing = await approvalPolicyDAL.findOne({
        type: policyType,
        scopeType: dbScopeType,
        scopeId: dbScopeId
      });
      if (existing) {
        throw new BadRequestError({
          message: `An approval policy named '${existing.name}' already governs this scope. Update it instead of creating another.`
        });
      }
    }

    await $verifyPolicyActors({
      policyType,
      projectId,
      orgId: actor.orgId,
      scopeType: dbScopeType,
      scopeId: dbScopeId,
      approvers: steps.flatMap((step) => step.approvers ?? []),
      bypassers: bypassers ?? []
    });

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
    actor: TApprovalActor
  ) => {
    const {
      projectId,
      scopeType: dbScopeType,
      scopeId: dbScopeId
    } = await $resolveScope(scope, inputScopeId, policyType);

    await $assertCanManagePolicy(
      projectId,
      dbScopeType,
      dbScopeId,
      actor,
      ResourcePermissionApprovalPolicyActions.Read,
      policyType
    );

    const policies = await approvalPolicyDAL.findByProjectId(policyType, projectId, {
      scopeType: dbScopeType,
      scopeId: dbScopeId
    });

    return { policies, projectId };
  };

  const getById = async (policyId: string, actor: TApprovalActor) => {
    const policy = await approvalPolicyDAL.findById(policyId);
    if (!policy) {
      throw new ForbiddenRequestError({ message: "Policy not found" });
    }

    await $assertCanManagePolicy(
      policy.projectId,
      policy.scopeType ?? null,
      policy.scopeId ?? null,
      actor,
      ResourcePermissionApprovalPolicyActions.Read,
      policy.type as ApprovalPolicyType
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
    actor: TApprovalActor
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
      ResourcePermissionApprovalPolicyActions.Edit,
      policy.type as ApprovalPolicyType
    );

    if (
      !resources[policy.type as ApprovalPolicyType]?.isBreakGlassEligible &&
      (enforcementLevel === EnforcementLevel.Soft || (bypassers && bypassers.length > 0))
    ) {
      throw new BadRequestError({
        message: `Bypassing approval is not supported for ${policy.type} policies`
      });
    }

    await $verifyPolicyActors({
      policyType: policy.type as ApprovalPolicyType,
      projectId: policy.projectId,
      orgId: actor.orgId,
      scopeType: policyScopeType,
      scopeId: policyScopeId,
      approvers: steps?.flatMap((step) => step.approvers ?? []) ?? [],
      bypassers: bypassers ?? []
    });

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

      const updated = Object.keys(updateDoc).length
        ? await approvalPolicyDAL.updateById(policyId, updateDoc, tx)
        : await approvalPolicyDAL.findById(policyId, tx);

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

  const deleteById = async (policyId: string, actor: TApprovalActor) => {
    const policy = await approvalPolicyDAL.findById(policyId);
    if (!policy) {
      throw new ForbiddenRequestError({ message: "Policy not found" });
    }

    await $assertCanManagePolicy(
      policy.projectId,
      policy.scopeType ?? null,
      policy.scopeId ?? null,
      actor,
      ResourcePermissionApprovalPolicyActions.Delete,
      policy.type as ApprovalPolicyType
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
    skipApproverNotification,
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

    if (!skipApproverNotification) {
      await $notify({
        event: ApprovalNotificationEvent.Requested,
        request: requestWithSteps,
        approvers: requestWithSteps.steps[0]?.approvers ?? []
      });
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
      machineIdentityId,
      skipApproverNotification
    }: TCreateRequestDTO & {
      requesterName: string;
      requesterEmail: string;
      machineIdentityId?: string;
    },
    actor: TApprovalActor
  ) => {
    const { projectId } = await $resolveScope(scope, inputScopeId, policyType);

    const assertDomainCanCreateRequest = resources[policyType]?.assertCanCreateRequest;

    // A type with its own authorization model owns this outright; its gate runs once the policy matched
    if (!assertDomainCanCreateRequest) {
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
    }

    const resource = $resource(policyType);

    const policy = await resource.matchPolicy(projectId, requestData);

    if (!policy) {
      throw new ForbiddenRequestError({
        message:
          resources[policyType]?.noMatchingPolicyMessage ??
          "No policies match the requested resource, you can access it without a request"
      });
    }

    const constraintValidation = resource.validateConstraints(policy, requestData);
    if (!constraintValidation.valid) {
      const errorMessage = constraintValidation.errors
        ? `Policy constraints not met: ${constraintValidation.errors.join("; ")}`
        : "Policy constraints not met";
      throw new ForbiddenRequestError({ message: errorMessage });
    }

    if (assertDomainCanCreateRequest) {
      await assertDomainCanCreateRequest({
        projectId,
        policy,
        requestData: requestData as TApprovalRequestData,
        actor
      });
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
      requesterEmail,
      skipApproverNotification
    });

    const decorated = await $decorateRequest(created.request, actor);
    return { request: decorated };
  };

  const $assertOrgMember = (organizationId: string, actor: TApprovalActor) =>
    permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: organizationId,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.Any,
      actorAuthMethod: actor.authMethod
    });

  const getRequestById = async (requestId: string, actor: TApprovalActor) => {
    const request = await approvalRequestDAL.findById(requestId);
    if (!request) {
      throw new ForbiddenRequestError({ message: "Request not found" });
    }

    await $assertOrgMember(request.organizationId, actor);

    const steps = await approvalRequestDAL.findStepsByRequestId(requestId);

    const isRequester = $isRequester(request, actor);

    // Check if user is an eligible approver for any step
    const userGroups = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(actor.id, actor.orgId);
    const userGroupIds = new Set(userGroups.map((g) => g.groupId));

    const isSnapshotApprover = steps.some((step) =>
      step.approvers.some(
        (approver) =>
          (approver.type === ApproverType.User && approver.id === actor.id) ||
          (approver.type === ApproverType.Group && userGroupIds.has(approver.id))
      )
    );

    const checkLiveApprover = resources[request.type as ApprovalPolicyType]?.isLiveApprover;
    const checkScopeRead = resources[request.type as ApprovalPolicyType]?.canReadScope;
    const isApprover =
      isSnapshotApprover &&
      (!checkLiveApprover ||
        !request.scopeId ||
        (await checkLiveApprover({
          projectId: request.projectId,
          scopeId: request.scopeId,
          actor,
          userGroupIds
        })));

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
      } else if (checkScopeRead) {
        if (!(await checkScopeRead({ projectId: request.projectId, scopeId: request.scopeId ?? null, actor }))) {
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
    actor: TApprovalActor,
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

    await $assertOrgMember(request.organizationId, actor);

    const supportsBreakGlass = Boolean(resources[policyType]?.isBreakGlassEligible);
    if (bypassReason !== undefined && !supportsBreakGlass) {
      throw new BadRequestError({
        message: `Bypassing approval is not supported for ${policyType} requests`
      });
    }

    if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
      await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Expired });
      throw new BadRequestError({ message: "Request has expired" });
    }

    const policy =
      bypassReason !== undefined && request.policyId ? await approvalPolicyDAL.findById(request.policyId) : null;
    const bypassers: PolicyBypasser[] =
      bypassReason !== undefined && request.policyId
        ? await approvalPolicyDAL.findBypassersByPolicyId(request.policyId)
        : [];

    const userGroups = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(actor.id, actor.orgId);
    const userGroupIds = new Set(userGroups.map((g) => g.groupId));

    if (bypassReason !== undefined) {
      if (!policy) {
        throw new BadRequestError({ message: "Policy no longer exists; cannot evaluate break-glass" });
      }

      const eligible =
        actor.type === ActorType.USER &&
        request.requesterId === actor.id &&
        (await $isBreakGlassEligible({
          request,
          policy,
          bypassers,
          actor,
          getUserGroupIds: () => Promise.resolve(userGroupIds)
        }));

      if (!eligible) {
        throw new ForbiddenRequestError({ message: "You are not permitted to bypass approval on this request" });
      }

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

    if (policyType === ApprovalPolicyType.CertCodeSigning && request.requesterId === actor.id) {
      throw new ForbiddenRequestError({ message: "You cannot approve your own signing request" });
    }

    const assertDomainCanApprove = resources[policyType]?.assertCanReview;
    if (assertDomainCanApprove) {
      await assertDomainCanApprove({
        request,
        decision: ApprovalRequestApprovalDecision.Approved,
        actor,
        userGroupIds
      });
    }

    const hasApproved = currentStep.approvals.some((a) => a.approverUserId === actor.id);
    if (hasApproved) {
      throw new BadRequestError({ message: "You have already approved this request" });
    }

    const resource = $resource(policyType);

    const { updatedRequest, nextStepToNotify } = await approvalRequestDAL.transaction(async (tx) => {
      let nextStepToNotifyInner = null;

      const locked = await approvalRequestDAL.findByIdForUpdate(requestId, tx);
      if (!locked || locked.status !== ApprovalRequestStatus.Pending) {
        throw new BadRequestError({ message: "Request is not pending" });
      }

      const lockedStepIndex = steps.findIndex((s) => s.stepNumber === locked.currentStep);
      const lockedStep = steps[lockedStepIndex];
      if (!lockedStep) {
        throw new BadRequestError({ message: "Current step not found" });
      }

      // The step may have advanced since the pre-transaction check.
      const isEligibleForLockedStep = lockedStep.approvers.some(
        (approver) =>
          (approver.type === ApproverType.User && approver.id === actor.id) ||
          (approver.type === ApproverType.Group && userGroupIds.has(approver.id))
      );
      if (!isEligibleForLockedStep) {
        throw new ForbiddenRequestError({ message: "You are not an eligible approver for this step" });
      }

      const stepApprovals = await approvalRequestApprovalsDAL.find({ stepId: lockedStep.id }, { tx });
      if (stepApprovals.some((approval) => approval.approverUserId === actor.id)) {
        throw new BadRequestError({ message: "You have already approved this request" });
      }

      await approvalRequestApprovalsDAL.create(
        {
          stepId: lockedStep.id,
          approverUserId: actor.id,
          decision: ApprovalRequestApprovalDecision.Approved,
          comment
        },
        tx
      );

      const newApprovalCount = stepApprovals.length + 1;
      if (newApprovalCount >= lockedStep.requiredApprovals) {
        await approvalRequestStepsDAL.updateById(
          lockedStep.id,
          {
            status: ApprovalRequestStepStatus.Completed,
            completedAt: new Date()
          },
          tx
        );

        const nextStep = steps[lockedStepIndex + 1];
        if (nextStep) {
          await approvalRequestDAL.updateById(
            requestId,
            {
              currentStep: locked.currentStep + 1
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
          const completedReq = await approvalRequestDAL.updateById(
            requestId,
            {
              status: ApprovalRequestStatus.Approved
            },
            tx
          );

          await resource.postApprovalTxRoutine?.(completedReq as TApprovalRequest, tx);

          return { updatedRequest: completedReq, nextStepToNotify: null };
        }
      }

      return { updatedRequest: locked, nextStepToNotify: nextStepToNotifyInner };
    });

    if (nextStepToNotify) {
      await $notify({
        event: ApprovalNotificationEvent.Requested,
        request: updatedRequest,
        approvers: nextStepToNotify.approvers
      });
    }

    // Fetch fresh state
    const finalSteps = await approvalRequestDAL.findStepsByRequestId(requestId);
    const finalRequest = await approvalRequestDAL.findById(requestId);

    const newRequest = { ...finalRequest, steps: finalSteps };

    if (finalRequest.status === ApprovalRequestStatus.Approved) {
      await resource.postApprovalRoutine?.(newRequest as TApprovalRequest, actor);
      await $notify({ event: ApprovalNotificationEvent.Approved, request: finalRequest, comment });
    }

    const decorated = await $decorateRequest(newRequest, actor);
    return { request: decorated };
  };

  const rejectRequest = async (
    requestId: string,
    { comment }: { comment?: string },
    actor: TApprovalActor,
    policyType: ApprovalPolicyType
  ) => {
    const request = await approvalRequestDAL.findById(requestId);
    if (!request) {
      throw new ForbiddenRequestError({ message: "Request not found" });
    }

    if (request.type !== policyType) {
      throw new BadRequestError({
        message: `Request type mismatch: expected ${policyType}, got ${request.type}`
      });
    }

    await $assertOrgMember(request.organizationId, actor);

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

    const assertDomainCanReject = resources[request.type as ApprovalPolicyType]?.assertCanReview;
    if (assertDomainCanReject) {
      await assertDomainCanReject({
        request,
        decision: ApprovalRequestApprovalDecision.Rejected,
        actor,
        userGroupIds
      });
    }

    await approvalRequestDAL.transaction(async (tx) => {
      const locked = await approvalRequestDAL.findByIdForUpdate(requestId, tx);
      if (!locked || locked.status !== ApprovalRequestStatus.Pending) {
        throw new BadRequestError({ message: "Request is not pending" });
      }

      const lockedStep = steps.find((step) => step.stepNumber === locked.currentStep);
      if (!lockedStep) {
        throw new BadRequestError({ message: "Current step not found" });
      }

      const isEligibleForLockedStep = lockedStep.approvers.some(
        (approver) =>
          (approver.type === ApproverType.User && approver.id === actor.id) ||
          (approver.type === ApproverType.Group && userGroupIds.has(approver.id))
      );
      if (!isEligibleForLockedStep) {
        throw new ForbiddenRequestError({ message: "You are not an eligible approver for this step" });
      }

      await approvalRequestApprovalsDAL.create(
        {
          stepId: lockedStep.id,
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
      const resource = $resource(finalRequest.type as ApprovalPolicyType);

      await resource.postRejectionRoutine?.(finalRequest as TApprovalRequest);
      await $notify({ event: ApprovalNotificationEvent.Rejected, request: finalRequest, comment });
    }

    const decorated = await $decorateRequest({ ...finalRequest, steps: finalSteps }, actor);
    return { request: decorated };
  };

  const listRequests = async (
    policyType: ApprovalPolicyType,
    scope: ApprovalPolicyScope,
    inputScopeId: string,
    actor: TApprovalActor
  ) => {
    const {
      projectId,
      scopeType: dbScopeType,
      scopeId: dbScopeId
    } = await $resolveScope(scope, inputScopeId, policyType);

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
    } else if (resources[policyType]?.canReadScope) {
      hasReadPermission = await resources[policyType]!.canReadScope!({ projectId, scopeId: dbScopeId, actor });
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
        if ($isRequester(request, actor)) return true;
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

  const cancelRequest = async (requestId: string, actor: TApprovalActor) => {
    const request = await approvalRequestDAL.findById(requestId);
    if (!request) {
      throw new ForbiddenRequestError({ message: "Request not found" });
    }

    if (request.status !== ApprovalRequestStatus.Pending) {
      throw new BadRequestError({ message: "Request is not pending" });
    }

    if (!$isRequester(request, actor)) {
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
    actor: TApprovalActor
  ) => {
    const {
      projectId,
      scopeType: dbScopeType,
      scopeId: dbScopeId
    } = await $resolveScope(scope, inputScopeId, policyType);

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
    } else if (resources[policyType]?.canReadScope) {
      if (!(await resources[policyType]!.canReadScope!({ projectId, scopeId: dbScopeId, actor }))) {
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

  const getGrantById = async (grantId: string, actor: TApprovalActor) => {
    const grant = await approvalRequestGrantsDAL.findById(grantId);
    if (!grant) {
      throw new NotFoundError({ message: "Grant not found" });
    }

    const checkScopeRead = resources[grant.type as ApprovalPolicyType]?.canReadScope;
    if (checkScopeRead) {
      const request = grant.requestId ? await approvalRequestDAL.findById(grant.requestId) : null;
      if (!(await checkScopeRead({ projectId: grant.projectId, scopeId: request?.scopeId ?? null, actor }))) {
        throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
      }
    } else {
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
    }

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
    actor: TApprovalActor,
    policyType: ApprovalPolicyType
  ) => {
    const grant = await approvalRequestGrantsDAL.findById(grantId);
    if (!grant) {
      throw new NotFoundError({ message: "Grant not found" });
    }

    const grantPolicyType = grant.type as ApprovalPolicyType;
    if (grantPolicyType !== policyType) {
      throw new BadRequestError({
        message: `Grant type mismatch: expected ${policyType}, got ${grantPolicyType}`
      });
    }

    const request = grant.requestId ? await approvalRequestDAL.findById(grant.requestId) : null;
    const assertDomainCanRevoke = resources[grantPolicyType]?.assertCanRevokeGrant;

    if (assertDomainCanRevoke) {
      await assertDomainCanRevoke({ grant, request, actor });
    } else {
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

    const onDomainGrantRevoked = resources[grantPolicyType]?.onGrantRevoked;
    if (onDomainGrantRevoked) {
      const sendSideEffects = await onDomainGrantRevoked({ grant, actorId: actor.id });
      sendSideEffects();
    }

    return { grant: updatedGrant, request };
  };

  const checkPolicyMatch = async (
    policyType: ApprovalPolicyType,
    { projectId, inputs }: { projectId: string; inputs: TApprovalPolicyInputs },
    actor: TApprovalActor
  ) => {
    await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.Any
    });

    const resource = $resource(policyType);

    const policy = await resource.matchPolicy(projectId, inputs);

    if (!policy) {
      return { requiresApproval: false, hasActiveGrant: false };
    }

    const activeGrant = await resource.canAccess(projectId, actor.id, inputs);

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

  const $actorGrantFilter = (actor: TApprovalSubjectActor) =>
    actor.type === ActorType.IDENTITY ? { granteeMachineIdentityId: actor.id } : { granteeUserId: actor.id };

  const $actorRequestFilter = (actor: TApprovalSubjectActor) =>
    actor.type === ActorType.IDENTITY ? { machineIdentityId: actor.id } : { requesterId: actor.id };

  const $matchingGrants = async (
    policyType: ApprovalPolicyType,
    projectId: string,
    actor: TApprovalSubjectActor,
    inputs: TApprovalPolicyInputs
  ) => {
    const resource = $resource(policyType);
    const grants = await approvalRequestGrantsDAL.find({
      ...$actorGrantFilter(actor),
      type: policyType,
      status: ApprovalRequestGrantStatus.Active,
      projectId
    });

    return grants.filter((grant) => resource.matchesInputs?.(grant.attributes, inputs));
  };

  const getActiveGrant = async (
    policyType: ApprovalPolicyType,
    projectId: string,
    actor: TApprovalSubjectActor,
    inputs: TApprovalPolicyInputs
  ) => {
    const matched = await $matchingGrants(policyType, projectId, actor, inputs);
    const now = new Date();

    return matched.find((grant) => !grant.expiresAt || new Date(grant.expiresAt) > now) ?? matched[0] ?? null;
  };

  const getAccessStatuses = async (
    policyType: ApprovalPolicyType,
    projectId: string,
    actor: TApprovalSubjectActor,
    inputsList: TApprovalPolicyInputs[]
  ): Promise<TApprovalAccessStatus[]> => {
    const empty = { accessStatus: ApprovalAccessStatus.None, grantExpiresAt: null, pendingRequestId: null };
    if (inputsList.length === 0) return [];

    const resource = $resource(policyType);
    const now = new Date();

    const [grants, pendingRequests] = await Promise.all([
      approvalRequestGrantsDAL.find({
        ...$actorGrantFilter(actor),
        type: policyType,
        status: ApprovalRequestGrantStatus.Active,
        projectId
      }),
      approvalRequestDAL.find({
        ...$actorRequestFilter(actor),
        type: policyType,
        status: ApprovalRequestStatus.Pending,
        projectId
      })
    ]);

    const liveGrants = grants.filter((grant) => !grant.expiresAt || new Date(grant.expiresAt) > now);

    return inputsList.map((inputs) => {
      const grant = liveGrants.find((g) => resource.matchesInputs?.(g.attributes, inputs));
      if (grant) {
        return {
          accessStatus: ApprovalAccessStatus.Granted,
          grantExpiresAt: grant.expiresAt ? new Date(grant.expiresAt) : null,
          pendingRequestId: null
        };
      }

      const pending = pendingRequests.find((request) =>
        resource.matchesInputs?.((request.requestData as { requestData?: unknown } | null)?.requestData, inputs)
      );

      return pending
        ? { accessStatus: ApprovalAccessStatus.Pending, grantExpiresAt: null, pendingRequestId: pending.id }
        : empty;
    });
  };

  const getScopeIdsWithApprovers = (
    policyType: ApprovalPolicyType,
    scopeType: ApprovalPolicyScope,
    scopeIds: string[]
  ) =>
    scopeIds.length === 0
      ? Promise.resolve([] as string[])
      : approvalPolicyDAL.findScopeIdsWithApprovers({ type: policyType, scopeType, scopeIds });

  const getBypassableScopeIds = async (
    policyType: ApprovalPolicyType,
    scopeType: ApprovalPolicyScope,
    scopeIds: string[],
    actor: TApprovalActor
  ) => {
    if (scopeIds.length === 0 || actor.type !== ActorType.USER) return [];

    const policies = await approvalPolicyDAL.find({ type: policyType, scopeType, $in: { scopeId: scopeIds } });
    if (policies.length === 0) return [];

    const [userGroupIds, bypassersByPolicyId] = await Promise.all([
      userGroupMembershipDAL
        .findGroupMembershipsByUserIdInOrg(actor.id, actor.orgId)
        .then((rows) => new Set(rows.map((g) => g.groupId))),
      approvalPolicyDAL.findBypassersByPolicyIds(policies.map((p) => p.id))
    ]);

    return policies
      .filter((policy) =>
        (bypassersByPolicyId[policy.id] ?? []).some(
          (b) =>
            (b.type === ApproverType.User && b.id === actor.id) ||
            (b.type === ApproverType.Group && userGroupIds.has(b.id))
        )
      )
      .map((policy) => policy.scopeId)
      .filter((scopeId): scopeId is string => Boolean(scopeId));
  };

  const reapScope = async (
    policyType: ApprovalPolicyType,
    scopeType: ApprovalPolicyScope,
    scopeId: string,
    tx: Knex
  ) => {
    const policy = await approvalPolicyDAL.findOne({ type: policyType, scopeType, scopeId }, tx);
    if (policy) await approvalPolicyDAL.deleteById(policy.id, tx);

    await approvalRequestDAL.update(
      { type: policyType, scopeType, scopeId, status: ApprovalRequestStatus.Pending },
      { status: ApprovalRequestStatus.Cancelled },
      tx
    );
  };

  const reapSubject = async (
    policyType: ApprovalPolicyType,
    {
      projectId,
      inputs,
      actorId,
      reason
    }: { projectId: string; inputs: TApprovalPolicyInputs; actorId: string; reason: string },
    tx: Knex
  ): Promise<() => void> => {
    const resource = $resource(policyType);
    const matches = (payload: unknown) => Boolean(resource.matchesInputs?.(payload, inputs));

    const pending = await approvalRequestDAL.find(
      { type: policyType, projectId, status: ApprovalRequestStatus.Pending },
      { tx }
    );
    const staleIds = pending
      .filter((request) => matches((request.requestData as { requestData?: unknown } | null)?.requestData))
      .map((request) => request.id);
    if (staleIds.length > 0) {
      await approvalRequestDAL.update({ $in: { id: staleIds } }, { status: ApprovalRequestStatus.Cancelled }, tx);
    }

    const activeGrants = await approvalRequestGrantsDAL.find(
      { type: policyType, status: ApprovalRequestGrantStatus.Active, projectId },
      { tx }
    );

    const pendingSignals: (() => void)[] = [];
    for (const grant of activeGrants.filter((g) => matches(g.attributes))) {
      // eslint-disable-next-line no-await-in-loop
      await approvalRequestGrantsDAL.updateById(
        grant.id,
        {
          status: ApprovalRequestGrantStatus.Revoked,
          revokedByUserId: actorId,
          revokedAt: new Date(),
          revocationReason: reason
        },
        tx
      );
      // eslint-disable-next-line no-await-in-loop
      pendingSignals.push((await resource.onGrantRevoked?.({ grant, actorId, tx })) ?? (() => {}));
    }

    return () => pendingSignals.forEach((send) => send());
  };

  const $attachGrantState = async <T extends { id: string }>(requests: T[]) => {
    const grants =
      requests.length > 0 ? await approvalRequestGrantsDAL.find({ $in: { requestId: requests.map((r) => r.id) } }) : [];

    const byRequestId = new Map(grants.filter((g) => g.requestId).map((g) => [g.requestId as string, g]));

    return requests.map((request) => {
      const grant = byRequestId.get(request.id);
      return {
        ...request,
        grantId: grant?.id ?? null,
        grantExpiresAt: grant?.expiresAt ?? null,
        grantStatus: grant?.status ?? null,
        isBreakGlass: Boolean(grant?.isBreakGlass),
        bypassReason: grant?.bypassReason ?? null
      };
    });
  };

  const $namesActor = (entries: { type: string; id: string }[], userId: string, userGroupIds: Set<string>) =>
    entries.some(
      (entry) =>
        (entry.type === ApproverType.User && entry.id === userId) ||
        (entry.type === ApproverType.Group && userGroupIds.has(entry.id))
    );

  const $userGroupIds = (actor: TApprovalActor) =>
    userGroupMembershipDAL
      .findGroupMembershipsByUserIdInOrg(actor.id, actor.orgId)
      .then((rows) => new Set(rows.map((g) => g.groupId)));

  const listScopeRequests = async (
    policyType: ApprovalPolicyType,
    scope: ApprovalPolicyScope,
    scopeId: string,
    { status, offset, limit }: { status?: string; offset?: number; limit?: number },
    actor: TApprovalActor
  ) => {
    const { projectId } = await $resolveScope(scope, scopeId, policyType);
    await $assertCanManagePolicy(
      projectId,
      scope,
      scopeId,
      actor,
      ResourcePermissionApprovalPolicyActions.Read,
      policyType
    );

    const requests = await approvalRequestDAL.find(
      { type: policyType, projectId, scopeType: scope, scopeId, ...(status ? { status } : {}) },
      { sort: [["createdAt", "desc"]], offset, limit, count: true }
    );

    return { requests: await $attachGrantState(requests), totalCount: Number(requests[0]?.count ?? 0) };
  };

  const $pendingForApprover = async (
    policyType: ApprovalPolicyType,
    scope: ApprovalPolicyScope,
    { projectId, scopeId }: { projectId: string; scopeId?: string },
    actor: TApprovalActor
  ) => {
    const userGroupIds = await $userGroupIds(actor);

    const isApprover = await approvalPolicyDAL.isProjectApprover({
      projectId,
      userId: actor.id,
      groupIds: [...userGroupIds],
      type: policyType,
      scopeType: scope
    });
    if (!isApprover) return null;

    const requests = await approvalRequestDAL.findByProjectId(policyType, projectId);
    const candidates = requests.filter((request) => {
      if (request.status !== ApprovalRequestStatus.Pending) return false;
      if (scopeId && request.scopeId !== scopeId) return false;

      const currentStep = request.steps.find((step) => step.stepNumber === request.currentStep);
      return Boolean(currentStep && $namesActor(currentStep.approvers, actor.id, userGroupIds));
    });

    const resource = $resource(policyType);
    if (!resource.isLiveApprover) return candidates;

    const liveScopeIds = new Set<string>();
    for (const candidateScopeId of new Set(
      candidates.map((r) => r.scopeId).filter((id): id is string => Boolean(id))
    )) {
      // eslint-disable-next-line no-await-in-loop
      if (await resource.isLiveApprover({ projectId, scopeId: candidateScopeId, actor, userGroupIds })) {
        liveScopeIds.add(candidateScopeId);
      }
    }

    return candidates.filter((request) => request.scopeId && liveScopeIds.has(request.scopeId));
  };

  const listPendingForApprover = async (
    policyType: ApprovalPolicyType,
    scope: ApprovalPolicyScope,
    args: { projectId: string; scopeId?: string },
    actor: TApprovalActor
  ) => {
    const pending = await $pendingForApprover(policyType, scope, args, actor);
    return { requests: await $attachGrantState(pending ?? []) };
  };

  const countPendingForApprover = async (
    policyType: ApprovalPolicyType,
    scope: ApprovalPolicyScope,
    projectId: string,
    actor: TApprovalActor
  ) => {
    const pending = await $pendingForApprover(policyType, scope, { projectId }, actor);
    return { pendingCount: pending?.length ?? 0, isApprover: pending !== null };
  };

  const getApproverRoster = async (
    policyType: ApprovalPolicyType,
    scope: ApprovalPolicyScope,
    { projectId, scopeId, inputs }: { projectId: string; scopeId: string; inputs: TApprovalPolicyInputs },
    actor: TApprovalSubjectActor
  ) => {
    const resource = $resource(policyType);
    const [policy] = await approvalPolicyDAL.findByProjectId(policyType, projectId, { scopeType: scope, scopeId });

    const livePolicySteps = policy ? await approvalPolicyDAL.findStepsByPolicyId(policy.id) : [];
    let steps = livePolicySteps.map((step) => ({
      requiredApprovals: step.requiredApprovals,
      approvers: step.approvers
    }));

    const pending = await approvalRequestDAL.find({
      ...$actorRequestFilter(actor),
      type: policyType,
      status: ApprovalRequestStatus.Pending,
      projectId
    });
    const pendingForSubject = pending.find((request) =>
      resource.matchesInputs?.((request.requestData as { requestData?: unknown } | null)?.requestData, inputs)
    );

    if (pendingForSubject) {
      const liveKeys = new Set(livePolicySteps.flatMap((step) => step.approvers.map((a) => `${a.type}:${a.id}`)));
      const requestSteps = await approvalRequestDAL.findStepsByRequestId(pendingForSubject.id);
      steps = requestSteps.map((step) => ({
        requiredApprovals: step.requiredApprovals,
        approvers: step.approvers.filter((a) => liveKeys.has(`${a.type}:${a.id}`))
      }));
    }

    if (steps.length === 0) return { steps: [] };

    const approvers = steps.flatMap((step) => step.approvers);
    const userIds = approvers.filter((a) => a.type === ApproverType.User).map((a) => a.id);
    const groupIds = approvers.filter((a) => a.type === ApproverType.Group).map((a) => a.id);

    const [users, groups, groupMemberships] = await Promise.all([
      userIds.length > 0 ? userDAL.find({ $in: { id: userIds } }) : [],
      groupIds.length > 0 ? groupDAL.find({ $in: { id: groupIds } }) : [],
      groupIds.length > 0 ? userGroupMembershipDAL.find({ $in: { groupId: groupIds } }) : []
    ]);

    const userNameById = new Map(
      users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "Unknown user"])
    );
    const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
    const memberCounts = new Map<string, number>();
    groupMemberships.forEach((m) => {
      if (m.groupId) memberCounts.set(m.groupId, (memberCounts.get(m.groupId) ?? 0) + 1);
    });

    return {
      steps: steps.map((step) => ({
        requiredApprovals: step.requiredApprovals,
        approvers: step.approvers.map((a) =>
          a.type === ApproverType.User
            ? { type: ApproverType.User, name: userNameById.get(a.id) ?? "Unknown user" }
            : {
                type: ApproverType.Group,
                name: groupNameById.get(a.id) ?? "Unknown group",
                memberCount: memberCounts.get(a.id) ?? 0
              }
        )
      }))
    };
  };

  const getScopeConfiguration = async (
    policyType: ApprovalPolicyType,
    scope: ApprovalPolicyScope,
    scopeId: string,
    actor: TApprovalActor
  ): Promise<TApprovalScopeConfiguration> => {
    const { policies } = await list(policyType, scope, scopeId, actor);
    const policy = policies[0];

    return policy
      ? {
          steps: policy.steps.map((step) => ({
            requiredApprovals: step.requiredApprovals,
            approvers: step.approvers
          })),
          bypassers: policy.bypassers.map((bypasser) => ({ type: bypasser.type, id: bypasser.id }))
        }
      : { steps: [], bypassers: [] };
  };

  const setScopeConfiguration = async (
    policyType: ApprovalPolicyType,
    scope: ApprovalPolicyScope,
    scopeId: string,
    {
      steps,
      bypassers,
      name,
      conditions,
      constraints
    }: {
      steps: TApprovalScopeConfiguration["steps"];
      bypassers?: PolicyBypasser[];
      name: string;
      conditions: TApprovalPolicy["conditions"]["conditions"];
      constraints: TApprovalPolicy["constraints"]["constraints"];
    },
    actor: TApprovalActor
  ) => {
    const { projectId } = await $resolveScope(scope, scopeId, policyType);
    const [existing] = await approvalPolicyDAL.findByProjectId(policyType, projectId, {
      scopeType: scope,
      scopeId
    });

    const hasApprovers = steps.some((step) => step.approvers.length > 0);
    if (!hasApprovers) {
      if (existing) await deleteById(existing.id, actor);
      return { policyId: existing?.id ?? null };
    }

    const policySteps = steps.map((step) => ({ ...step, notifyApprovers: true }));
    const bypassFields = bypassers ? { bypassers } : {};

    if (existing) {
      const { policy } = await updateById(existing.id, { steps: policySteps, ...bypassFields }, actor);
      return { policyId: policy.id };
    }

    const { policy } = await create(
      policyType,
      { scope, scopeId, name, conditions, constraints, steps: policySteps, ...bypassFields },
      actor
    );
    return { policyId: policy.id };
  };

  const buildAuditEvent = async (args: {
    action: ApprovalAuditAction;
    request: TApprovalRequests;
    grantId?: string;
    actorId: string;
    comment?: string;
    bypassReason?: string;
  }) => (await $resource(args.request.type as ApprovalPolicyType).buildAuditEvent?.(args)) ?? null;

  const buildTelemetryEvent = async (args: {
    action: ApprovalAuditAction;
    request: TApprovalRequests;
    distinctId: string;
    decision?: string;
  }) => (await $resource(args.request.type as ApprovalPolicyType).buildTelemetryEvent?.(args)) ?? null;

  return {
    buildAuditEvent,
    buildTelemetryEvent,
    matchPolicy: (policyType: ApprovalPolicyType, projectId: string, inputs: TApprovalPolicyInputs) =>
      $resource(policyType).matchPolicy(projectId, inputs),
    getActiveGrant,
    getAccessStatuses,
    getScopeIdsWithApprovers,
    getBypassableScopeIds,
    reapScope,
    reapSubject,
    listScopeRequests,
    listPendingForApprover,
    countPendingForApprover,
    getApproverRoster,
    getScopeConfiguration,
    setScopeConfiguration,
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
