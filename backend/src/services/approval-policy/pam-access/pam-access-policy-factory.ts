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

    for (const policy of policies) {
      const p = policy as TPamAccessPolicy;
      for (const c of p.conditions.conditions) {
        if (c.resourceIds && !c.resourceIds.some((r) => r === inputs.resourceId)) {
          // eslint-disable-next-line no-continue
          continue;
        }

        // Find the most specific path pattern
        // TODO(andrey): Make matching logic more advanced by accounting for wildcard positions
        for (const pathPattern of c.accountPaths) {
          if (picomatch(pathPattern)(inputs.accountPath)) {
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

    // TODO(andrey): Move some of this check to be part of SQL query
    return grants.some((grant) => {
      const grantAttributes = grant.attributes as TPamAccessPolicyInputs;
      const isMatch = picomatch(grantAttributes.accountPath);
      return (
        grantAttributes.resourceId === inputs.resourceId &&
        isMatch(inputs.accountPath) &&
        (!grant.expiresAt || grant.expiresAt > new Date())
      );
    });
  };

  const validateConstraints: TApprovalRequestFactoryValidateConstraints<TPamAccessPolicy, TPamAccessRequestData> = (
    policy,
    inputs
  ) => {
    const reqDuration = ms(inputs.accessDuration);
    const durationConstraint = policy.constraints.constraints.accessDuration;

    return reqDuration >= ms(durationConstraint.min) && reqDuration <= ms(durationConstraint.max);
  };

  const postApprovalRoutine: TApprovalRequestFactoryPostApprovalRoutine = async (_request) => {
    // Placeholder
  };

  return {
    matchPolicy,
    canAccess,
    validateConstraints,
    postApprovalRoutine
  };
};
