import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, ProjectMembershipRole, TApprovalPolicies, TApprovalRequests } from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionApprovalRequestActions,
  ProjectPermissionApprovalRequestGrantActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { OrgServiceActor } from "@app/lib/types";
import { TCertificateRequestDALFactory } from "@app/services/certificate-request/certificate-request-dal";
import { TCertificateApprovalService } from "@app/services/certificate-v3/certificate-approval-fns";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";

import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import {
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
  ApproverType
} from "./approval-policy-enums";
import { APPROVAL_POLICY_FACTORY_MAP } from "./approval-policy-factory";
import {
  ApprovalPolicyStep,
  TApprovalPolicyInputs,
  TApprovalRequest,
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

type TApprovalPolicyServiceFactoryDep = {
  approvalPolicyDAL: TApprovalPolicyDALFactory;
  approvalPolicyStepsDAL: TApprovalPolicyStepsDALFactory;
  approvalPolicyStepApproversDAL: TApprovalPolicyStepApproversDALFactory;
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
};
export type TApprovalPolicyServiceFactory = ReturnType<typeof approvalPolicyServiceFactory>;

export const approvalPolicyServiceFactory = ({
  approvalPolicyDAL,
  approvalPolicyStepsDAL,
  approvalPolicyStepApproversDAL,
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
  certificateRequestDAL
}: TApprovalPolicyServiceFactoryDep) => {
  const $notifyApprovers = (step: ApprovalPolicyStep, request: TApprovalRequests) =>
    notifyApproversForStep(step, request, { userGroupMembershipDAL, notificationService });

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
    { projectId, name, maxRequestTtl, conditions, constraints, steps, bypassForMachineIdentities }: TCreatePolicyDTO,
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
          bypassForMachineIdentities: bypassForMachineIdentities ?? false
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

      return newPolicy;
    });

    return {
      policy: { ...policy, steps }
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

    const steps = await approvalPolicyDAL.findStepsByPolicyId(policyId);

    return { policy: { ...policy, steps } };
  };

  const updateById = async (
    policyId: string,
    { name, maxRequestTtl, conditions, constraints, steps, bypassForMachineIdentities }: TUpdatePolicyDTO,
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
      return updated;
    });

    const fetchedSteps = await approvalPolicyDAL.findStepsByPolicyId(policyId);

    return {
      policy: { ...updatedPolicy, steps: fetchedSteps }
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
      requesterEmail
    }: TCreateRequestDTO & {
      requesterName: string;
      requesterEmail: string;
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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionApprovalRequestActions.Create,
      ProjectPermissionSub.ApprovalRequests
    );

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

    return createRequestFromPolicy({
      projectId,
      organizationId: actor.orgId,
      policy,
      requestData,
      justification,
      expiresAt,
      requesterUserId: actor.id,
      requesterName,
      requesterEmail
    });
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

    return {
      request: { ...request, steps }
    };
  };

  const approveRequest = async (requestId: string, { comment }: { comment?: string }, actor: OrgServiceActor) => {
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
    const currentStepIndex = steps.findIndex((s) => s.stepNumber === request.currentStep);
    if (currentStepIndex === -1) {
      throw new BadRequestError({ message: "Current step not found" });
    }

    const currentStep = steps[currentStepIndex];

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

    return { request: newRequest };
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

    return { request: { ...finalRequest, steps: finalSteps } };
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

    // If user has read permission, return all requests
    if (hasReadPermission) {
      return { requests };
    }

    // Otherwise, filter to only requests where user is requester or approver
    const userGroups = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(actor.id, actor.orgId);
    const userGroupIds = new Set(userGroups.map((g) => g.groupId));

    const filteredRequests = [];
    for (const request of requests) {
      const isRequester = request.requesterId === actor.id;

      if (isRequester) {
        filteredRequests.push(request);
        // eslint-disable-next-line no-continue
        continue;
      }

      // Check if user is an eligible approver for any step
      const isApprover = request.steps.some((step) =>
        step.approvers.some(
          (approver) =>
            (approver.type === ApproverType.User && approver.id === actor.id) ||
            (approver.type === ApproverType.Group && userGroupIds.has(approver.id))
        )
      );

      if (isApprover) {
        filteredRequests.push(request);
      }
    }

    return { requests: filteredRequests };
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

    return { request: { ...updatedRequest, steps } };
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
