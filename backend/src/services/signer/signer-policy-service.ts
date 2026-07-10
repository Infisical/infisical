import { ForbiddenError } from "@casl/ability";

import { RESOURCE_SCOPE, ResourceMembershipRole, ResourceType } from "@app/db/schemas";
import { TIdentityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ResourcePermissionSignerActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";

import {
  TApprovalPolicyDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "../approval-policy/approval-policy-dal";
import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApprovalRequestGrantStatus,
  ApprovalRequestStatus
} from "../approval-policy/approval-policy-enums";
import {
  TApprovalRequestDALFactory,
  TApprovalRequestGrantsDALFactory,
  TApprovalRequestStepEligibleApproversDALFactory,
  TApprovalRequestStepsDALFactory
} from "../approval-policy/approval-request-dal";
import { createApprovalRequestWithSteps } from "../approval-policy/approval-request-fns";
import { ActorType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TMembershipDALFactory } from "../membership/membership-dal";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TSignerDALFactory } from "./signer-dal";
import { TSignerRequestDALFactory } from "./signer-request-dal";
import {
  TGetSignerPolicyDTO,
  TListSignerRequestsDTO,
  TPreApproveSigningDTO,
  TRequestToSignDTO,
  TRevokeSignerRequestDTO,
  TSignerRequestStatusFilter,
  TUpdateSignerPolicyDTO
} from "./signer-types";

type TSignerPolicyServiceFactoryDep = {
  signerDAL: Pick<TSignerDALFactory, "findById">;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findById" | "updateById" | "findStepsByPolicyId">;
  approvalPolicyStepsDAL: Pick<TApprovalPolicyStepsDALFactory, "create" | "delete" | "find">;
  approvalPolicyStepApproversDAL: Pick<TApprovalPolicyStepApproversDALFactory, "create" | "delete">;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "create" | "find" | "findById" | "updateById" | "transaction">;
  signerRequestDAL: TSignerRequestDALFactory;
  approvalRequestStepsDAL: Pick<TApprovalRequestStepsDALFactory, "create">;
  approvalRequestStepEligibleApproversDAL: Pick<TApprovalRequestStepEligibleApproversDALFactory, "create">;
  approvalRequestGrantsDAL: Pick<TApprovalRequestGrantsDALFactory, "create" | "find" | "updateById">;
  membershipDAL: Pick<TMembershipDALFactory, "find" | "transaction">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find">;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getResourcePermission">;
};

export type TSignerPolicyServiceFactory = ReturnType<typeof signerPolicyServiceFactory>;

type TConstraintsBlob = {
  constraints?: {
    maxSignings?: number | null;
    maxWindowDuration?: string | null;
  };
};

const $loadSignerOrThrow = async (signerDAL: TSignerPolicyServiceFactoryDep["signerDAL"], signerId: string) => {
  const signer = await signerDAL.findById(signerId);
  if (!signer) {
    throw new NotFoundError({ message: `Signer with ID '${signerId}' not found` });
  }
  if (!signer.approvalPolicyId) {
    throw new BadRequestError({
      message: `Signer '${signer.name}' does not have an approval policy. Re-create the signer.`
    });
  }
  return signer;
};

export const signerPolicyServiceFactory = ({
  signerDAL,
  approvalPolicyDAL,
  approvalPolicyStepsDAL,
  approvalPolicyStepApproversDAL,
  approvalRequestDAL,
  signerRequestDAL,
  approvalRequestStepsDAL,
  approvalRequestStepEligibleApproversDAL,
  approvalRequestGrantsDAL,
  membershipDAL,
  membershipRoleDAL,
  userGroupMembershipDAL,
  identityGroupMembershipDAL,
  userDAL,
  identityDAL,
  permissionService
}: TSignerPolicyServiceFactoryDep) => {
  const $assertResourcePermission = async (
    signerId: string,
    projectId: string,
    actor: TGetSignerPolicyDTO["actor"],
    actorId: string,
    actorAuthMethod: TGetSignerPolicyDTO["actorAuthMethod"],
    actorOrgId: string | undefined,
    action: ResourcePermissionSignerActions
  ) => {
    const { permission } = await permissionService.getResourcePermission({
      actor,
      actorId,
      projectId,
      resourceType: ResourceType.Signer,
      resourceId: signerId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(action, ResourcePermissionSub.Signer);
  };

  const $resolveActorDisplay = async ({
    userId,
    identityId
  }: {
    userId?: string | null;
    identityId?: string | null;
  }): Promise<{ name: string; email: string }> => {
    if (userId) {
      const u = await userDAL.findById(userId);
      if (u) {
        const fullName = [u.firstName, u.lastName]
          .filter((p): p is string => Boolean(p?.trim()))
          .join(" ")
          .trim();
        return { name: fullName || u.username || u.email || userId, email: u.email ?? "" };
      }
      return { name: userId, email: "" };
    }
    if (identityId) {
      const i = await identityDAL.findById(identityId);
      return { name: i?.name || identityId, email: "" };
    }
    return { name: "", email: "" };
  };

  const $resolveRequestEffectiveLimits = (
    policyConstraints: unknown,
    dto: { requestedSignings?: number; requestedWindowStart?: string; requestedWindowEnd?: string }
  ): { effectiveSignings?: number; effectiveWindowStart?: string; effectiveWindowEnd?: string } => {
    const blob = (policyConstraints as TConstraintsBlob) ?? {};
    const maxSignings = blob.constraints?.maxSignings ?? null;
    const maxWindowDuration = blob.constraints?.maxWindowDuration ?? null;

    if (dto.requestedSignings !== undefined && dto.requestedSignings < 1) {
      throw new BadRequestError({ message: "requestedSignings must be at least 1." });
    }
    if (maxSignings !== null && dto.requestedSignings !== undefined && dto.requestedSignings > maxSignings) {
      throw new BadRequestError({
        message: `Requested signatures (${dto.requestedSignings}) exceed the policy limit of ${maxSignings}.`
      });
    }

    let effectiveWindowStart: string | undefined;
    let effectiveWindowEnd: string | undefined;
    if (dto.requestedWindowEnd) {
      const end = new Date(dto.requestedWindowEnd).getTime();
      if (Number.isNaN(end)) {
        throw new BadRequestError({ message: "Invalid requestedWindowEnd date." });
      }
      const rawStart = dto.requestedWindowStart ? new Date(dto.requestedWindowStart).getTime() : Date.now();
      if (Number.isNaN(rawStart)) {
        throw new BadRequestError({ message: "Invalid requestedWindowStart date." });
      }
      const startTime = Math.max(rawStart, Date.now());
      if (end <= startTime) {
        throw new BadRequestError({
          message: "requestedWindowEnd must be in the future and after requestedWindowStart."
        });
      }
      if (maxWindowDuration) {
        let allowedMs: number;
        try {
          allowedMs = ms(maxWindowDuration);
        } catch {
          allowedMs = Number.POSITIVE_INFINITY;
        }
        if (Number.isFinite(allowedMs) && end - startTime > allowedMs) {
          throw new BadRequestError({
            message: `Requested signing window exceeds the policy maximum of ${maxWindowDuration}.`
          });
        }
      }
      effectiveWindowStart = dto.requestedWindowStart;
      effectiveWindowEnd = dto.requestedWindowEnd;
    } else if (maxWindowDuration) {
      let allowedMs: number;
      try {
        allowedMs = ms(maxWindowDuration);
      } catch {
        allowedMs = 0;
      }
      if (allowedMs > 0) {
        const start = new Date();
        effectiveWindowStart = dto.requestedWindowStart ?? start.toISOString();
        effectiveWindowEnd = new Date(start.getTime() + allowedMs).toISOString();
      }
    }

    let effectiveSignings = dto.requestedSignings;
    if (effectiveSignings === undefined && maxSignings !== null) {
      effectiveSignings = maxSignings;
    }

    return { effectiveSignings, effectiveWindowStart, effectiveWindowEnd };
  };

  const $resolveGranteeEffectiveRoles = async ({
    projectId,
    signerId,
    granteeUserId,
    granteeIdentityId
  }: {
    projectId: string;
    signerId: string;
    granteeUserId?: string;
    granteeIdentityId?: string;
  }): Promise<string[]> => {
    const directWhere: Record<string, unknown> = {
      scope: RESOURCE_SCOPE,
      scopeProjectId: projectId,
      scopeResourceType: ResourceType.Signer,
      scopeResourceId: signerId
    };
    if (granteeUserId) directWhere.actorUserId = granteeUserId;
    else directWhere.actorIdentityId = granteeIdentityId;

    const directMemberships = await membershipDAL.find(directWhere);

    const memberGroupIds = granteeUserId
      ? (await userGroupMembershipDAL.find({ userId: granteeUserId })).map((g) => g.groupId)
      : (await identityGroupMembershipDAL.find({ identityId: granteeIdentityId as string })).map((g) => g.groupId);

    let groupMemberships: Awaited<ReturnType<typeof membershipDAL.find>> = [];
    if (memberGroupIds.length > 0) {
      groupMemberships = await membershipDAL.find({
        scope: RESOURCE_SCOPE,
        scopeProjectId: projectId,
        scopeResourceType: ResourceType.Signer,
        scopeResourceId: signerId,
        $in: { actorGroupId: memberGroupIds }
      });
    }

    const membershipIds = [...directMemberships, ...groupMemberships].map((m) => m.id);
    if (membershipIds.length === 0) return [];

    const roles = await membershipRoleDAL.find({ $in: { membershipId: membershipIds } });
    return roles.map((r) => r.role).filter((r): r is string => Boolean(r));
  };

  const getPolicy = async (dto: TGetSignerPolicyDTO) => {
    const signer = await $loadSignerOrThrow(signerDAL, dto.signerId);
    await $assertResourcePermission(
      signer.id,
      signer.projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId,
      ResourcePermissionSignerActions.Read
    );

    if (!signer.approvalPolicyId) {
      throw new NotFoundError({ message: `Signer '${signer.name}' has no approval policy.` });
    }
    const policy = await approvalPolicyDAL.findById(signer.approvalPolicyId);
    if (!policy) {
      throw new NotFoundError({ message: `Policy for signer '${signer.name}' has been removed.` });
    }
    const steps = await approvalPolicyDAL.findStepsByPolicyId(policy.id);
    const blob = (policy.constraints as TConstraintsBlob) ?? {};
    return {
      id: policy.id,
      signerId: signer.id,
      hasSteps: steps.length > 0,
      steps,
      constraints: {
        maxSignings: blob.constraints?.maxSignings ?? null,
        maxWindowDuration: blob.constraints?.maxWindowDuration ?? null
      }
    };
  };

  const $assertApproversAreMembers = async (signerId: string, projectId: string, userIds: string[]) => {
    if (userIds.length === 0) return;

    const memberships = await membershipDAL.find({
      scope: RESOURCE_SCOPE,
      scopeProjectId: projectId,
      scopeResourceType: ResourceType.Signer,
      scopeResourceId: signerId,
      $in: { actorUserId: userIds }
    });

    const found = new Set(memberships.map((m) => m.actorUserId).filter((v): v is string => Boolean(v)));
    const missing = userIds.filter((u) => !found.has(u));
    if (missing.length > 0) {
      throw new BadRequestError({
        message: `Approvers must already be signer members. Missing: ${missing.join(", ")}.`
      });
    }

    const membershipIds = memberships.map((m) => m.id);
    if (membershipIds.length === 0) return;
    const roles = await membershipRoleDAL.find({ $in: { membershipId: membershipIds } });
    const auditorIds = new Set<string>();
    for (const r of roles) {
      if (r.role === ResourceMembershipRole.Auditor) {
        const m = memberships.find((mem) => mem.id === r.membershipId);
        if (m?.actorUserId) auditorIds.add(m.actorUserId);
      }
    }
    if (auditorIds.size > 0) {
      throw new BadRequestError({
        message: `Auditors cannot be approvers. Found auditor users: ${Array.from(auditorIds).join(", ")}.`
      });
    }
  };

  const $assertGroupApproversAreMembers = async (signerId: string, projectId: string, groupIds: string[]) => {
    if (groupIds.length === 0) return;

    const memberships = await membershipDAL.find({
      scope: RESOURCE_SCOPE,
      scopeProjectId: projectId,
      scopeResourceType: ResourceType.Signer,
      scopeResourceId: signerId,
      $in: { actorGroupId: groupIds }
    });

    const found = new Set(memberships.map((m) => m.actorGroupId).filter((v): v is string => Boolean(v)));
    const missing = groupIds.filter((g) => !found.has(g));
    if (missing.length > 0) {
      throw new BadRequestError({
        message: `Approver groups must already be signer members. Missing: ${missing.join(", ")}.`
      });
    }

    const membershipIds = memberships.map((m) => m.id);
    const roles = await membershipRoleDAL.find({ $in: { membershipId: membershipIds } });
    const auditorGroupIds = new Set<string>();
    for (const r of roles) {
      if (r.role === ResourceMembershipRole.Auditor) {
        const m = memberships.find((mem) => mem.id === r.membershipId);
        if (m?.actorGroupId) auditorGroupIds.add(m.actorGroupId);
      }
    }
    if (auditorGroupIds.size > 0) {
      throw new BadRequestError({
        message: `Auditor groups cannot be approvers. Found auditor groups: ${Array.from(auditorGroupIds).join(", ")}.`
      });
    }
  };

  const updatePolicy = async (dto: TUpdateSignerPolicyDTO) => {
    const signer = await $loadSignerOrThrow(signerDAL, dto.signerId);
    await $assertResourcePermission(
      signer.id,
      signer.projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId,
      ResourcePermissionSignerActions.ManagePolicy
    );

    const effectiveConstraints = dto.constraints ?? {};

    if (dto.steps.length > 0) {
      if (effectiveConstraints.maxWindowDuration) {
        try {
          ms(effectiveConstraints.maxWindowDuration);
        } catch {
          throw new BadRequestError({
            message: `Invalid maxWindowDuration '${effectiveConstraints.maxWindowDuration}'.`
          });
        }
      }
      const allApproverUserIds = Array.from(new Set(dto.steps.flatMap((s) => s.approverUserIds)));
      const allApproverGroupIds = Array.from(new Set(dto.steps.flatMap((s) => s.approverGroupIds ?? [])));
      await $assertApproversAreMembers(signer.id, signer.projectId, allApproverUserIds);
      await $assertGroupApproversAreMembers(signer.id, signer.projectId, allApproverGroupIds);

      for (const step of dto.steps) {
        const stepApproverGroupCount = step.approverGroupIds?.length ?? 0;
        const stepApproverUserCount = step.approverUserIds.length;
        if (stepApproverUserCount + stepApproverGroupCount === 0) {
          throw new BadRequestError({
            message: `Step ${step.stepNumber}: at least one approver is required.`
          });
        }
        if (step.requiredApprovals < 1) {
          throw new BadRequestError({
            message: `Step ${step.stepNumber}: requiredApprovals must be at least 1.`
          });
        }
        if (stepApproverGroupCount === 0 && step.requiredApprovals > stepApproverUserCount) {
          throw new BadRequestError({
            message: `Step ${step.stepNumber}: requiredApprovals (${step.requiredApprovals}) can't exceed the number of approvers (${stepApproverUserCount}). Add a group to allow more than the current user approvers.`
          });
        }
      }
    }

    if (!signer.approvalPolicyId) {
      throw new NotFoundError({ message: `Signer '${signer.name}' has no approval policy.` });
    }
    const policyId = signer.approvalPolicyId;

    await membershipDAL.transaction(async (tx) => {
      const existingSteps = await approvalPolicyStepsDAL.find({ policyId }, { tx });
      if (existingSteps.length > 0) {
        await approvalPolicyStepApproversDAL.delete({ $in: { policyStepId: existingSteps.map((s) => s.id) } }, tx);
        await approvalPolicyStepsDAL.delete({ $in: { id: existingSteps.map((s) => s.id) } }, tx);
      }

      for (const step of dto.steps) {
        // eslint-disable-next-line no-await-in-loop
        const created = await approvalPolicyStepsDAL.create(
          {
            policyId,
            stepNumber: step.stepNumber,
            name: step.name?.trim() || null,
            requiredApprovals: step.requiredApprovals
          },
          tx
        );
        for (const userId of step.approverUserIds) {
          // eslint-disable-next-line no-await-in-loop
          await approvalPolicyStepApproversDAL.create({ policyStepId: created.id, userId }, tx);
        }
        for (const groupId of step.approverGroupIds ?? []) {
          // eslint-disable-next-line no-await-in-loop
          await approvalPolicyStepApproversDAL.create({ policyStepId: created.id, groupId }, tx);
        }
      }

      const blob: TConstraintsBlob = {
        constraints: {
          maxSignings: effectiveConstraints.maxSignings ?? null,
          maxWindowDuration: effectiveConstraints.maxWindowDuration ?? null
        }
      };
      await approvalPolicyDAL.updateById(policyId, { constraints: blob }, tx);
    });

    return getPolicy({
      signerId: dto.signerId,
      actor: dto.actor,
      actorId: dto.actorId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId
    });
  };

  const listRequests = async (dto: TListSignerRequestsDTO) => {
    const signer = await $loadSignerOrThrow(signerDAL, dto.signerId);
    await $assertResourcePermission(
      signer.id,
      signer.projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId,
      ResourcePermissionSignerActions.Read
    );

    const UI_TO_DB_STATUS: Record<Exclude<TSignerRequestStatusFilter, "revoked">, ApprovalRequestStatus> = {
      pending: ApprovalRequestStatus.Pending,
      approved: ApprovalRequestStatus.Approved,
      expired: ApprovalRequestStatus.Expired
    };
    const dbStatuses: ApprovalRequestStatus[] | undefined = dto.statuses?.flatMap((s) =>
      s === "revoked" ? [ApprovalRequestStatus.Cancelled, ApprovalRequestStatus.Rejected] : [UI_TO_DB_STATUS[s]]
    );

    const offset = dto.offset ?? 0;
    const limit = dto.limit ?? 25;

    const [requests, totalCount] = await Promise.all([
      signerRequestDAL.listSignerRequestsPaginated({
        signerId: signer.id,
        projectId: signer.projectId,
        type: ApprovalPolicyType.CertCodeSigning,
        statuses: dbStatuses,
        offset,
        limit
      }),
      signerRequestDAL.countSignerRequests({
        signerId: signer.id,
        projectId: signer.projectId,
        type: ApprovalPolicyType.CertCodeSigning,
        statuses: dbStatuses
      })
    ]);

    if (requests.length === 0) {
      return { requests: [], totalCount };
    }

    return {
      requests,
      totalCount
    };
  };

  const requestToSign = async (dto: TRequestToSignDTO) => {
    const signer = await $loadSignerOrThrow(signerDAL, dto.signerId);
    await $assertResourcePermission(
      signer.id,
      signer.projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId,
      ResourcePermissionSignerActions.RequestSign
    );

    if (!signer.approvalPolicyId) {
      throw new BadRequestError({
        message: "This signer does not require approval."
      });
    }
    const steps = await approvalPolicyDAL.findStepsByPolicyId(signer.approvalPolicyId);
    if (steps.length === 0) {
      throw new BadRequestError({
        message: "This signer does not require approval. You can sign directly."
      });
    }

    if (!dto.requestedSignings && !dto.requestedWindowEnd) {
      throw new BadRequestError({ message: "Provide at least one of requestedSignings or requestedWindowEnd." });
    }

    const policy = await approvalPolicyDAL.findById(signer.approvalPolicyId);
    if (!policy) {
      throw new NotFoundError({ message: `Policy for signer '${signer.name}' has been removed.` });
    }

    const { effectiveSignings, effectiveWindowStart, effectiveWindowEnd } = $resolveRequestEffectiveLimits(
      policy.constraints,
      {
        requestedSignings: dto.requestedSignings,
        requestedWindowStart: dto.requestedWindowStart,
        requestedWindowEnd: dto.requestedWindowEnd
      }
    );

    const requester = await $resolveActorDisplay({
      userId: dto.actor === ActorType.USER ? dto.actorId : null,
      identityId: dto.actor === ActorType.IDENTITY ? dto.actorId : null
    });

    const orgId = dto.actorOrgId;
    const requestWithSteps = await createApprovalRequestWithSteps(
      {
        projectId: signer.projectId,
        organizationId: orgId,
        policyId: policy.id,
        policyType: ApprovalPolicyType.CertCodeSigning,
        policySteps: steps,
        // createApprovalRequestWithSteps wraps this in { version: 1, requestData } before persisting — pass the flat shape.
        requestData: {
          signerId: signer.id,
          signerName: signer.name,
          approvalPolicyId: policy.id,
          justification: dto.justification,
          requestedSignings: effectiveSignings,
          requestedWindowStart: effectiveWindowStart,
          requestedWindowEnd: effectiveWindowEnd
        },
        justification: dto.justification,
        requesterUserId: dto.actor === ActorType.USER ? dto.actorId : null,
        machineIdentityId: dto.actor === ActorType.IDENTITY ? dto.actorId : null,
        requesterName: requester.name,
        requesterEmail: requester.email,
        scopeType: ApprovalPolicyScope.Signer,
        scopeId: signer.id
      },
      {
        approvalRequestDAL,
        approvalRequestStepsDAL,
        approvalRequestStepEligibleApproversDAL
      }
    );

    return requestWithSteps;
  };

  const preApproveSigning = async (dto: TPreApproveSigningDTO) => {
    const signer = await $loadSignerOrThrow(signerDAL, dto.signerId);
    await $assertResourcePermission(
      signer.id,
      signer.projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId,
      ResourcePermissionSignerActions.PreApprove
    );

    if (!dto.granteeUserId && !dto.granteeIdentityId) {
      throw new BadRequestError({ message: "granteeUserId or granteeIdentityId is required." });
    }
    if (
      (dto.actor === ActorType.USER && dto.granteeUserId === dto.actorId) ||
      (dto.actor === ActorType.IDENTITY && dto.granteeIdentityId === dto.actorId)
    ) {
      throw new ForbiddenRequestError({ message: "You cannot pre-approve signing access for yourself." });
    }
    if (!dto.requestedSignings && !dto.requestedWindowEnd) {
      throw new BadRequestError({ message: "Provide at least one of requestedSignings or requestedWindowEnd." });
    }

    if (!signer.approvalPolicyId) {
      throw new BadRequestError({
        message: `Signer '${signer.name}' has no approval policy.`
      });
    }
    const policy = await approvalPolicyDAL.findById(signer.approvalPolicyId);
    if (!policy) {
      throw new NotFoundError({ message: `Policy for signer '${signer.name}' has been removed.` });
    }
    const { effectiveSignings, effectiveWindowStart, effectiveWindowEnd } = $resolveRequestEffectiveLimits(
      policy.constraints,
      {
        requestedSignings: dto.requestedSignings,
        requestedWindowStart: dto.requestedWindowStart,
        requestedWindowEnd: dto.requestedWindowEnd
      }
    );

    const granteeRoles = await $resolveGranteeEffectiveRoles({
      projectId: signer.projectId,
      signerId: signer.id,
      granteeUserId: dto.granteeUserId,
      granteeIdentityId: dto.granteeIdentityId
    });
    if (granteeRoles.length === 0) {
      throw new BadRequestError({ message: "Grantee is not a member of this signer." });
    }
    const hasGrantableRole = granteeRoles.some((r) => r !== ResourceMembershipRole.Auditor);
    if (!hasGrantableRole) {
      throw new BadRequestError({ message: "Grantee must be an Administrator or Operator on this signer." });
    }

    const grantee = await $resolveActorDisplay({
      userId: dto.granteeUserId,
      identityId: dto.granteeIdentityId
    });

    const orgId = dto.actorOrgId;
    const result = await membershipDAL.transaction(async (tx) => {
      const request = await approvalRequestDAL.create(
        {
          projectId: signer.projectId,
          organizationId: orgId,
          policyId: signer.approvalPolicyId,
          type: ApprovalPolicyType.CertCodeSigning,
          status: ApprovalRequestStatus.Approved,
          justification: dto.justification,
          currentStep: 1,
          requesterId: dto.granteeUserId ?? null,
          machineIdentityId: dto.granteeIdentityId ?? null,
          requesterName: grantee.name,
          requesterEmail: grantee.email,
          scopeType: ApprovalPolicyScope.Signer,
          scopeId: signer.id,
          requestData: {
            version: 1,
            requestData: {
              signerId: signer.id,
              signerName: signer.name,
              approvalPolicyId: signer.approvalPolicyId,
              justification: dto.justification,
              requestedSignings: effectiveSignings,
              requestedWindowStart: effectiveWindowStart,
              requestedWindowEnd: effectiveWindowEnd
            }
          }
        },
        tx
      );

      const grant = await approvalRequestGrantsDAL.create(
        {
          projectId: signer.projectId,
          requestId: request.id,
          granteeUserId: dto.granteeUserId ?? null,
          granteeMachineIdentityId: dto.granteeIdentityId ?? null,
          status: ApprovalRequestGrantStatus.Active,
          type: ApprovalPolicyType.CertCodeSigning,
          attributes: {
            signerId: signer.id,
            signerName: signer.name,
            maxSignings: effectiveSignings,
            windowStart: effectiveWindowStart
          },
          expiresAt: effectiveWindowEnd ? new Date(effectiveWindowEnd) : null
        },
        tx
      );

      return { request, grant };
    });

    return result;
  };

  const revokeRequest = async (dto: TRevokeSignerRequestDTO) => {
    const signer = await $loadSignerOrThrow(signerDAL, dto.signerId);
    await $assertResourcePermission(
      signer.id,
      signer.projectId,
      dto.actor,
      dto.actorId,
      dto.actorAuthMethod,
      dto.actorOrgId,
      ResourcePermissionSignerActions.RevokeRequest
    );

    const request = await approvalRequestDAL.findById(dto.requestId);
    if (!request || request.scopeId !== signer.id) {
      throw new NotFoundError({ message: `Request '${dto.requestId}' not found on this signer.` });
    }

    await membershipDAL.transaction(async (tx) => {
      const grants = await approvalRequestGrantsDAL.find(
        { requestId: dto.requestId, status: ApprovalRequestGrantStatus.Active },
        { tx }
      );
      for (const grant of grants) {
        // eslint-disable-next-line no-await-in-loop
        await approvalRequestGrantsDAL.updateById(
          grant.id,
          {
            status: ApprovalRequestGrantStatus.Revoked,
            revokedAt: new Date(),
            revokedByUserId: dto.actor === ActorType.USER ? dto.actorId : null
          },
          tx
        );
      }
      await approvalRequestDAL.updateById(dto.requestId, { status: ApprovalRequestStatus.Cancelled }, tx);
    });

    return { requestId: dto.requestId };
  };

  return {
    getPolicy,
    updatePolicy,
    listRequests,
    requestToSign,
    preApproveSigning,
    revokeRequest
  };
};
