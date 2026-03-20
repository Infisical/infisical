import { ms } from "@app/lib/ms";

import { ApprovalRequestGrantStatus } from "../approval-policy-enums";
import {
  TApprovalRequestFactoryCanAccess,
  TApprovalRequestFactoryMatchPolicy,
  TApprovalRequestFactoryPostApprovalRoutine,
  TApprovalRequestFactoryPostRejectionRoutine,
  TApprovalRequestFactoryValidateConstraints,
  TApprovalResourceFactory
} from "../approval-policy-types";
import {
  TCodeSigningGrantAttributes,
  TCodeSigningPolicy,
  TCodeSigningPolicyInputs,
  TCodeSigningRequestData
} from "./code-signing-policy-types";

export const codeSigningPolicyFactory: TApprovalResourceFactory<
  TCodeSigningPolicyInputs,
  TCodeSigningPolicy,
  TCodeSigningRequestData
> = (policyType) => {
  const matchPolicy: TApprovalRequestFactoryMatchPolicy<TCodeSigningPolicyInputs, TCodeSigningPolicy> = async (
    approvalPolicyDAL,
    projectId,
    inputs
  ) => {
    const policies = await approvalPolicyDAL.findByProjectId(policyType, projectId);
    const policy = policies.find((p) => p.id === inputs.approvalPolicyId);

    if (!policy) return null;

    const p = policy as TCodeSigningPolicy;
    if (!p.isActive) return null;

    return p;
  };

  const canAccess: TApprovalRequestFactoryCanAccess<TCodeSigningPolicyInputs> = async (
    approvalRequestGrantsDAL,
    projectId,
    userId,
    inputs
  ) => {
    const [userGrants, identityGrants] = await Promise.all([
      approvalRequestGrantsDAL.find({
        granteeUserId: userId,
        type: policyType,
        status: ApprovalRequestGrantStatus.Active,
        projectId,
        revokedAt: null
      }),
      approvalRequestGrantsDAL.find({
        granteeMachineIdentityId: userId,
        type: policyType,
        status: ApprovalRequestGrantStatus.Active,
        projectId,
        revokedAt: null
      })
    ]);

    const grants = [...userGrants, ...identityGrants];

    const now = new Date();

    const hasMatchingGrant = grants.some((grant) => {
      const attributes = grant.attributes as TCodeSigningGrantAttributes | null;
      if (!attributes || attributes.signerId !== inputs.signerId) return false;
      if (attributes.windowStart && new Date(attributes.windowStart) > now) return false;
      if (grant.expiresAt && new Date(grant.expiresAt) < now) return false;
      return true;
    });

    return hasMatchingGrant;
  };

  const validateConstraints: TApprovalRequestFactoryValidateConstraints<TCodeSigningPolicy, TCodeSigningRequestData> = (
    policy,
    inputs
  ) => {
    const errors: string[] = [];
    const { maxWindowDuration, maxSignings } = policy.constraints.constraints;

    const hasTimeConstraint = Boolean(maxWindowDuration);
    const hasCountConstraint = Boolean(maxSignings);

    if (hasTimeConstraint) {
      if (!inputs.requestedWindowStart || !inputs.requestedWindowEnd) {
        errors.push("Both requestedWindowStart and requestedWindowEnd are required for this policy");
      } else {
        const startTime = new Date(inputs.requestedWindowStart).getTime();
        const endTime = new Date(inputs.requestedWindowEnd).getTime();
        const requestedDuration = endTime - startTime;

        if (requestedDuration <= 0) {
          errors.push("Requested window end must be after window start");
        }
        if (endTime <= Date.now()) {
          errors.push("Requested window end must be in the future");
        }
        if (maxWindowDuration && requestedDuration > ms(maxWindowDuration)) {
          errors.push(`Requested window duration exceeds maximum of ${maxWindowDuration}`);
        }
      }
    } else if (inputs.requestedWindowStart || inputs.requestedWindowEnd) {
      errors.push("This policy does not allow time-window parameters");
    }

    if (hasCountConstraint) {
      if (!inputs.requestedSignings) {
        errors.push("requestedSignings is required for this policy");
      } else if (maxSignings && inputs.requestedSignings > maxSignings) {
        errors.push(`Requested signings (${inputs.requestedSignings}) exceeds maximum of ${maxSignings}`);
      }
    } else if (inputs.requestedSignings) {
      errors.push("This policy does not allow requestedSignings");
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  };

  const postApprovalRoutine: TApprovalRequestFactoryPostApprovalRoutine = async (approvalRequestGrantsDAL, request) => {
    const requestData = request.requestData.requestData as TCodeSigningRequestData;

    const grantAttributes: TCodeSigningGrantAttributes = {
      signerId: requestData.signerId,
      signerName: requestData.signerName
    };

    let expiresAt: Date | undefined;

    if (requestData.requestedSignings) {
      grantAttributes.maxSignings = requestData.requestedSignings;
    }

    if (requestData.requestedWindowStart) {
      grantAttributes.windowStart = requestData.requestedWindowStart;
    }
    if (requestData.requestedWindowEnd) {
      expiresAt = new Date(requestData.requestedWindowEnd);
    }

    await approvalRequestGrantsDAL.create({
      projectId: request.projectId,
      requestId: request.id,
      granteeUserId: request.requesterId ?? null,
      granteeMachineIdentityId: request.machineIdentityId ?? null,
      status: ApprovalRequestGrantStatus.Active,
      type: request.type,
      attributes: grantAttributes,
      expiresAt: expiresAt ?? null
    });
  };

  const postRejectionRoutine: TApprovalRequestFactoryPostRejectionRoutine = async () => {};

  return {
    matchPolicy,
    canAccess,
    validateConstraints,
    postApprovalRoutine,
    postRejectionRoutine
  };
};
