import picomatch from "picomatch";

import { ms } from "@app/lib/ms";

import { ApprovalRequestGrantStatus } from "../approval-policy-enums";
import {
  TApprovalRequestFactoryCanAccess,
  TApprovalRequestFactoryMatchPolicy,
  TApprovalRequestFactoryPostApprovalRoutine,
  TApprovalRequestFactoryValidateConstraints,
  TApprovalResourceFactory
} from "../approval-policy-types";
import { TPamAccessPolicy, TPamAccessPolicyInputs, TPamAccessRequestData } from "./pam-access-policy-types";

export const pamAccessPolicyFactory: TApprovalResourceFactory<
  TPamAccessPolicyInputs,
  TPamAccessPolicy,
  TPamAccessRequestData
> = (policyType) => {
  const matchPolicy: TApprovalRequestFactoryMatchPolicy<TPamAccessPolicyInputs, TPamAccessPolicy> = async (
    approvalPolicyDAL,
    projectId,
    inputs
  ) => {
    const policies = await approvalPolicyDAL.findByProjectId(policyType, projectId);

    let bestMatch: { policy: TPamAccessPolicy; wildcardCount: number; pathLength: number } | null = null;

    const normalizedAccountPath = inputs.accountPath.startsWith("/") ? inputs.accountPath.slice(1) : inputs.accountPath;

    for (const policy of policies) {
      const p = policy as TPamAccessPolicy;
      for (const c of p.conditions.conditions) {
        // Find the most specific path pattern
        // TODO(andrey): Make matching logic more advanced by accounting for wildcard positions
        for (const pathPattern of c.accountPaths) {
          const normalizedPathPattern = pathPattern.startsWith("/") ? pathPattern.slice(1) : pathPattern;
          if (picomatch(normalizedPathPattern)(normalizedAccountPath)) {
            const wildcardCount = (pathPattern.match(/\*/g) || []).length;
            const pathLength = pathPattern.length;

            if (
              !bestMatch ||
              wildcardCount < bestMatch.wildcardCount ||
              (wildcardCount === bestMatch.wildcardCount && pathLength > bestMatch.pathLength)
            ) {
              bestMatch = { policy: p, wildcardCount, pathLength };
            }
          }
        }
      }
    }

    return bestMatch?.policy || null;
  };

  const canAccess: TApprovalRequestFactoryCanAccess<TPamAccessPolicyInputs> = async (
    approvalRequestGrantsDAL,
    projectId,
    userId,
    inputs
  ) => {
    const grants = await approvalRequestGrantsDAL.find({
      granteeUserId: userId,
      type: policyType,
      status: ApprovalRequestGrantStatus.Active,
      projectId,
      revokedAt: null
    });

    const normalizedAccountPath = inputs.accountPath.startsWith("/") ? inputs.accountPath.slice(1) : inputs.accountPath;

    // TODO(andrey): Move some of this check to be part of SQL query
    return grants.some((grant) => {
      const grantAttributes = grant.attributes as TPamAccessPolicyInputs;
      const normalizedGrantPath = grantAttributes.accountPath.startsWith("/")
        ? grantAttributes.accountPath.slice(1)
        : grantAttributes.accountPath;
      const isMatch = picomatch(normalizedGrantPath);
      return isMatch(normalizedAccountPath) && (!grant.expiresAt || grant.expiresAt > new Date());
    });
  };

  const validateConstraints: TApprovalRequestFactoryValidateConstraints<TPamAccessPolicy, TPamAccessRequestData> = (
    policy,
    inputs
  ) => {
    const reqDuration = ms(inputs.accessDuration);
    const durationConstraint = policy.constraints.constraints.accessDuration;
    const minDuration = ms(durationConstraint.min);
    const maxDuration = ms(durationConstraint.max);

    const errors: string[] = [];

    if (reqDuration < minDuration) {
      errors.push(
        `Access duration ${inputs.accessDuration} is below the minimum allowed duration of ${durationConstraint.min}`
      );
    }

    if (reqDuration > maxDuration) {
      errors.push(
        `Access duration ${inputs.accessDuration} exceeds the maximum allowed duration of ${durationConstraint.max}`
      );
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  };

  const postApprovalRoutine: TApprovalRequestFactoryPostApprovalRoutine = async (approvalRequestGrantsDAL, request) => {
    const inputs = request.requestData.requestData;
    const durationMs = ms(inputs.accessDuration);
    const expiresAt = new Date(Date.now() + durationMs);

    await approvalRequestGrantsDAL.create({
      projectId: request.projectId,
      requestId: request.id,
      granteeUserId: request.requesterId,
      status: ApprovalRequestGrantStatus.Active,
      type: request.type,
      attributes: inputs,
      expiresAt
    });
  };

  return {
    matchPolicy,
    canAccess,
    validateConstraints,
    postApprovalRoutine
  };
};
