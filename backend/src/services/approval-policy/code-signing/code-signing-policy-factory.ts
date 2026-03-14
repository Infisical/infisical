import { BadRequestError } from "@app/lib/errors";
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
import { CodeSigningApprovalMode } from "./code-signing-policy-schemas";
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
    const { approvalMode, maxWindowDuration, maxSignings } = policy.constraints.constraints;

    if (inputs.approvalMode !== approvalMode) {
      errors.push(`Request approval mode '${inputs.approvalMode}' does not match policy mode '${approvalMode}'`);
    }

    if (approvalMode === CodeSigningApprovalMode.Manual) {
      if (inputs.requestedWindowStart || inputs.requestedWindowEnd) {
        errors.push("Manual mode does not accept time-window parameters");
      }
      if (inputs.requestedSignings) {
        errors.push("Manual mode does not accept requestedSignings");
      }
    }

    if (approvalMode === CodeSigningApprovalMode.TimeWindow) {
      if (!inputs.requestedWindowStart || !inputs.requestedWindowEnd) {
        errors.push("Time-window mode requires requestedWindowStart and requestedWindowEnd");
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
      if (inputs.requestedSignings) {
        errors.push("Time-window mode does not accept requestedSignings");
      }
    }

    if (approvalMode === CodeSigningApprovalMode.NSignings) {
      if (!inputs.requestedSignings) {
        errors.push("Count-limited mode requires requestedSignings");
      } else if (maxSignings && inputs.requestedSignings > maxSignings) {
        errors.push(`Requested signings (${inputs.requestedSignings}) exceeds maximum of ${maxSignings}`);
      }
      if (inputs.requestedWindowStart || inputs.requestedWindowEnd) {
        errors.push("Count-limited mode does not accept time-window parameters");
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  };

  const postApprovalRoutine: TApprovalRequestFactoryPostApprovalRoutine = async (approvalRequestGrantsDAL, request) => {
    const requestData = request.requestData.requestData as TCodeSigningRequestData;
    const approvalMode = requestData.approvalMode ?? CodeSigningApprovalMode.Manual;

    const grantAttributes: TCodeSigningGrantAttributes = {
      signerId: requestData.signerId,
      signerName: requestData.signerName
    };

    let expiresAt: Date | undefined;

    switch (approvalMode) {
      case CodeSigningApprovalMode.Manual:
        grantAttributes.maxSignings = 1;
        break;
      case CodeSigningApprovalMode.TimeWindow:
        if (requestData.requestedWindowStart) {
          grantAttributes.windowStart = requestData.requestedWindowStart;
        }
        if (requestData.requestedWindowEnd) {
          expiresAt = new Date(requestData.requestedWindowEnd);
        }
        break;
      case CodeSigningApprovalMode.NSignings:
        if (!requestData.requestedSignings) {
          throw new BadRequestError({ message: "NSignings mode requires requestedSignings to be set" });
        }
        grantAttributes.maxSignings = requestData.requestedSignings;
        break;
      default:
        grantAttributes.maxSignings = 1;
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
