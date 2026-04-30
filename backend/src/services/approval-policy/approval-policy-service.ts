import { ForbiddenError } from "@casl/ability";

import {
  ActionProjectType,
  ProjectMembershipRole,
  TableName,
  TApprovalPolicies,
  TApprovalRequests
} from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionApprovalRequestActions,
  ProjectPermissionApprovalRequestGrantActions,
  ProjectPermissionCodeSigningActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
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
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TProjectDALFactory } from "../project/project-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import {
  TApprovalPolicyBypassersDALFactory,
  TApprovalPolicyDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "./approval-policy-dal";
import {
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
  PolicyBypasser,
  TApprovalPolicy,
  TApprovalPolicyInputs,
  TApprovalRequest,
  TApprovalRequestData,
  TCreatePolicyDTO,
  TCreateRequestDTO,
  TCreateRequestFromPolicyDTO,
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
import { createApprovalRequestWithSteps, notifyApproversForStep } from "./approval-request-fns";
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
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findProjectMembershipsByUserIds">;
  certificateApprovalService: TCertificateApprovalService;
  certificateRequestDAL: Pick<TCertificateRequestDALFactory, "updateById" | "findById">;
  smtpService: Pick<TSmtpService, "sendMail">;
  userDAL: Pick<TUserDALFactory, "findById" | "find">;
  groupDAL: Pick<TGroupDALFactory, "findAllGroupPossibleUsers">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export type BreakGlassBypassMetadata = {
  grantId: string;
  resourceName?: string;
  accountName?: string;
  accessDuration: string;
  bypassReason: string;
  approverCount: number;
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
  certificateApprovalService,
  certificateRequestDAL,
  smtpService,
  userDAL,
  groupDAL,
  projectDAL
}: TApprovalPolicyServiceFactoryDep) => {
  const $notifyApprovers = (step: ApprovalPolicyStep, request: TApprovalRequests) =>
    notifyApproversForStep(step, request, { userGroupMembershipDAL, notificationService });

  type TDecorationContext = {
    // Lazy + memoized: built once per actor, reused across N decorations.
    getUserGroupIds: () => Promise<Set<string>>;
    // Optional pre-batched lookups for list endpoints. Undefined entries fall back to per-row queries.
    grantsByRequestId?: Map<string, { isBreakGlass: boolean; bypassReason: string | null }>;
    policyById?: Map<string, { enforcementLevel: string | null | undefined } | null>;
    bypassersByPolicyId?: Map<string, PolicyBypasser[]>;
  };

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

  // Annotates a request with break-glass affordances.
  // Server is the source of truth for canBreakGlass — UI must not re-derive eligibility from
  // local memberships, and policy/grant lookups can fail benignly (returning canBreakGlass: false).
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
  ): Promise<
    R & {
      canBreakGlass: boolean;
      bypassReasonRequired: boolean;
      isBreakGlass: boolean;
      bypassReason: string | null;
    }
  > => {
    let canBreakGlass = false;

    try {
      if (
        actor.type === ActorType.USER &&
        request.type === ApprovalPolicyType.PamAccess &&
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
    } catch (err) {
      logger.error(
        { err, requestId: request.id },
        `Failed to compute break-glass eligibility [requestId=${request.id}]`
      );
      canBreakGlass = false;
    }

    let isBreakGlass = false;
    let bypassReason: string | null = null;
    try {
      const prefetched = ctx.grantsByRequestId?.get(request.id);
      if (prefetched !== undefined) {
        isBreakGlass = prefetched.isBreakGlass;
        bypassReason = prefetched.bypassReason;
      } else if (request.requesterId) {
        // Scope to (requestId, granteeUserId) so we can't get the wrong grant if multiple ever exist.
        const grant = await approvalRequestGrantsDAL.findOne({
          requestId: request.id,
          granteeUserId: request.requesterId
        });
        if (grant) {
          isBreakGlass = Boolean(grant.isBreakGlass);
          bypassReason = grant.bypassReason ?? null;
        }
      }
    } catch (err) {
      logger.error(
        { err, requestId: request.id },
        `Failed to load grant for break-glass decoration [requestId=${request.id}]`
      );
    }

    return {
      ...request,
      canBreakGlass,
      bypassReasonRequired: canBreakGlass,
      isBreakGlass,
      bypassReason
    };
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

  const create = async (
    policyType: ApprovalPolicyType,
    {
      projectId,
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

    // Verify all users are part of project
    const approverUserIds = steps
      .flatMap((step) => step.approvers ?? [])
      .filter((approver) => approver.type === ApproverType.User)
      .map((approver) => approver.id);
    await $verifyProjectUserMembership(approverUserIds, actor.orgId, projectId);

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
          enforcementLevel: enforcementLevel ?? EnforcementLevel.Hard
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

  const list = async (policyType: ApprovalPolicyType, projectId: string, actor: OrgServiceActor) => {
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

    const policies = await approvalPolicyDAL.findByProjectId(policyType, projectId);

    return { policies };
  };

  const getById = async (policyId: string, actor: OrgServiceActor) => {
    const policy = await approvalPolicyDAL.findById(policyId);
    if (!policy) {
      throw new ForbiddenRequestError({ message: "Policy not found" });
    }

    const { hasRole } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: policy.projectId,
      actionProjectType: ActionProjectType.Any
    });

    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
    }

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

    const { hasRole } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: policy.projectId,
      actionProjectType: ActionProjectType.Any
    });

    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
    }

    if (steps !== undefined) {
      // Verify all users are part of project
      const approverUserIds = steps
        .flatMap((step) => step.approvers ?? [])
        .filter((approver) => approver.type === ApproverType.User)
        .map((approver) => approver.id);
      await $verifyProjectUserMembership(approverUserIds, actor.orgId, policy.projectId);
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

      // omitted -> leave bypassers unchanged; empty array -> deletes them all.
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

    const { hasRole } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: policy.projectId,
      actionProjectType: ActionProjectType.Any
    });

    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
    }

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
        requesterEmail
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
      projectId,
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
      // Otherwise, check role permission
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

    const decorated = await $decorateRequest({ ...request, steps }, actor);
    return { request: decorated };
  };

  const approveRequest = async (
    requestId: string,
    { comment, bypassReason }: { comment?: string; bypassReason?: string },
    actor: OrgServiceActor,
    policyType: ApprovalPolicyType
  ): Promise<{
    request: unknown;
    audit: "standard" | "break-glass" | "none";
    bypassMetadata?: BreakGlassBypassMetadata;
  }> => {
    const request = await approvalRequestDAL.findById(requestId);
    if (!request) {
      throw new ForbiddenRequestError({ message: "Request not found" });
    }

    // Type-mismatch guard — prevents /pam-access/.../<cert-id>/approve
    if (request.type !== policyType) {
      throw new BadRequestError({
        message: `Request type mismatch: expected ${policyType}, got ${request.type}`
      });
    }

    // Cross-type bypassReason guard
    if (bypassReason !== undefined && policyType !== ApprovalPolicyType.PamAccess) {
      throw new BadRequestError({
        message: "bypassReason is only supported for PAM access requests"
      });
    }

    if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
      await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Expired });
      throw new BadRequestError({ message: "Request has expired" });
    }

    // Conditional policy load — needed for bypass eligibility evaluation.
    const policy =
      policyType === ApprovalPolicyType.PamAccess && request.policyId
        ? await approvalPolicyDAL.findById(request.policyId)
        : null;
    const bypassers: PolicyBypasser[] =
      policyType === ApprovalPolicyType.PamAccess && request.policyId
        ? await approvalPolicyDAL.findBypassersByPolicyId(request.policyId)
        : [];

    if (bypassReason !== undefined && !policy) {
      throw new BadRequestError({
        message: "Policy no longer exists; cannot evaluate break-glass"
      });
    }

    const userGroups = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(actor.id, actor.orgId);
    const userGroupIds = new Set(userGroups.map((g) => g.groupId));

    // Bypass is OPT-IN: only fires when the actor explicitly passes bypassReason. An
    // approver+requester+bypasser on a Soft policy can still do a normal approval without bypass —
    // the standard flow handles that path. (PAM has no allowedSelfApprovals flag, so self-approve
    // is allowed by default for any eligible approver.)
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
      if (!bypassReason || bypassReason.trim().length < 10) {
        throw new BadRequestError({
          message: "A bypass reason of at least 10 characters is required to bypass approvals"
        });
      }

      // Re-run constraint validation in case admin tightened constraints since the request was created.
      // The policy row from findById lacks the joined steps/bypassers fields the factory's TApprovalPolicy
      // type carries — validateConstraints only reads policy.constraints, so the cast is safe at runtime.
      const fac = APPROVAL_POLICY_FACTORY_MAP[policyType](policyType);
      const constraintCheck = fac.validateConstraints(
        policy as unknown as TApprovalPolicy,
        (request.requestData as { requestData: unknown }).requestData as TApprovalRequestData
      );
      if (!constraintCheck.valid) {
        throw new BadRequestError({
          message: constraintCheck.errors
            ? `Policy constraints not met: ${constraintCheck.errors.join("; ")}`
            : "Policy constraints not met"
        });
      }

      const inputs = (request.requestData as { requestData: TPamAccessRequestData }).requestData;

      const steps = await approvalRequestDAL.findStepsByRequestId(requestId);

      // Snapshot-based recipient resolution: who would have reviewed at request-creation time.
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

      // Expand groups (the secrets-side bug-fix: secrets silently skips group approvers on bypass).
      const expandedGroupUsers = (
        await Promise.all(
          [...new Set(approverGroupIds)].map((groupId) =>
            groupDAL
              .findAllGroupPossibleUsers({ orgId: actor.orgId, groupId })
              .then((res) => res.members.filter((u) => u.isPartOfGroup))
          )
        )
      ).flat();
      expandedGroupUsers.forEach((u) => approverUserIdSet.add(u.id));
      approverUserIdSet.delete(actor.id);

      const recipientUserIds = [...approverUserIdSet];

      const { grant, lockedRequest, idempotent } = await approvalRequestDAL.transaction(async (tx) => {
        // Concurrency lock — re-read under FOR UPDATE so the status check below sees the up-to-date row.
        const locked = await approvalRequestDAL.findByIdForUpdate(requestId, tx);
        if (!locked) {
          throw new ForbiddenRequestError({ message: "Request not found" });
        }

        // Idempotency carve-out — only applies to a re-clicked break-glass.
        // Falls through cleanly for multi-step actors who approved earlier steps via the standard flow
        // and now bypass on the current step (the bypass writes its own approval row + grant).
        const existingBreakGlassGrant = await tx(TableName.ApprovalRequestGrants)
          .where({ requestId, granteeUserId: actor.id, isBreakGlass: true })
          .first();
        if (existingBreakGlassGrant) {
          return { grant: existingBreakGlassGrant, lockedRequest: locked, idempotent: true as const };
        }

        if (locked.status !== ApprovalRequestStatus.Pending) {
          throw new BadRequestError({ message: "Request is not pending" });
        }

        if (locked.expiresAt && new Date(locked.expiresAt) < new Date()) {
          await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Expired }, tx);
          throw new BadRequestError({ message: "Request has expired" });
        }

        // Mark all steps Completed, advance request to Approved.
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

        const currentStepRow = requestSteps.find((s) => s.stepNumber === locked.currentStep) || requestSteps[0] || null;
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

        const newGrant = await approvalRequestGrantsDAL.create(
          {
            projectId: locked.projectId,
            requestId: locked.id,
            granteeUserId: actor.id,
            status: ApprovalRequestGrantStatus.Active,
            type: locked.type,
            attributes: inputs,
            expiresAt,
            isBreakGlass: true,
            bypassReason: bypassReason.trim()
          },
          tx
        );

        return { grant: newGrant, lockedRequest: locked, idempotent: false as const };
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

      // Idempotent re-click: nothing new happened — skip notifications and audit.
      if (idempotent) {
        return { request: await $decorateRequest(result, actor), audit: "none" };
      }

      if (recipientUserIds.length === 0) {
        return { request: await $decorateRequest(result, actor), audit: "break-glass", bypassMetadata };
      }

      // Post-tx fanout: notifications first, email second. Failures don't roll back the bypass.
      try {
        const recipients = await userDAL.find({ $in: { id: recipientUserIds } });
        const project = await projectDAL.findById(lockedRequest.projectId);
        const cfg = getConfig();
        const approvalPath = `/projects/secret-management/${lockedRequest.projectId}/approval`;
        const approvalUrl = cfg.SITE_URL ? `${cfg.SITE_URL}${approvalPath}` : approvalPath;
        const actingUser = await userDAL.findById(actor.id);

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
            link: approvalPath
          }))
        );

        const emailRecipients = recipients
          .map((r) => r.email)
          .filter((e): e is string => typeof e === "string" && e.length > 0);

        if (emailRecipients.length > 0) {
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
              approvalUrl
            },
            template: SmtpTemplates.AccessPamRequestBypassed
          });
        }
      } catch (err) {
        logger.error(
          { err, requestId, granteeUserId: actor.id },
          `Failed to deliver break-glass notifications [requestId=${requestId}] [granteeUserId=${actor.id}]`
        );
      }

      return { request: await $decorateRequest(result, actor), audit: "break-glass", bypassMetadata };
    }

    // ────────────────────────────────────────
    // Standard (non-bypass) approval path
    // ────────────────────────────────────────
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

          if (nextStep.notifyApprovers) {
            nextStepToNotifyInner = nextStep;
          }
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
    return { request: decorated, audit: "standard" };
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

  const listRequests = async (policyType: ApprovalPolicyType, projectId: string, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.Any
    });

    const hasReadPermission = permission.can(
      ProjectPermissionApprovalRequestActions.Read,
      ProjectPermissionSub.ApprovalRequests
    );

    const requests = await approvalRequestDAL.findByProjectId(policyType, projectId);

    // Pre-batch the per-row lookups so decoration is O(1) DB-wise per request instead of O(N).
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

      const [grants, policies, bypassers] = await Promise.all([
        approvalRequestGrantsDAL.find({ $in: { requestId: requestIds } }),
        policyIds.length
          ? approvalPolicyDAL.find({ $in: { id: policyIds } })
          : Promise.resolve([] as Awaited<ReturnType<typeof approvalPolicyDAL.find>>),
        policyIds.length
          ? Promise.all(policyIds.map((id) => approvalPolicyDAL.findBypassersByPolicyId(id)))
          : Promise.resolve([] as PolicyBypasser[][])
      ]);

      ctx.grantsByRequestId = new Map();
      for (const g of grants) {
        if (g.requestId) {
          // Scope to the request's requester so we never surface a stranger's grant on a re-issued request.
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
      ctx.bypassersByPolicyId = new Map(policyIds.map((id, i) => [id, bypassers[i]]));
    }

    const decorated = await Promise.all(visibleRequests.map((r) => $decorateRequest(r, actor, ctx)));
    return { requests: decorated };
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

  const listGrants = async (policyType: ApprovalPolicyType, projectId: string, actor: OrgServiceActor) => {
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

    const grants = await approvalRequestGrantsDAL.find({ projectId, type: policyType });
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

    return { grants: updatedGrants };
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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionApprovalRequestGrantActions.Revoke,
      ProjectPermissionSub.ApprovalRequestGrants
    );

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

    const hasActiveGrant = await fac.canAccess(approvalRequestGrantsDAL, projectId, actor.id, inputs);

    return {
      requiresApproval: !hasActiveGrant,
      hasActiveGrant
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
