import picomatch from "picomatch";

import { ApprovalRequestGrantStatus } from "../approval-policy-enums";
import {
  TApprovalRequestFactoryCanAccess,
  TApprovalRequestFactoryMatchPolicy,
  TApprovalResourceFactory
} from "../approval-policy-types";
import { TPamAccessPolicy, TPamAccessPolicyInputs } from "./pam-access-policy-types";

export const pamAccessPolicyFactory: TApprovalResourceFactory<TPamAccessPolicyInputs, TPamAccessPolicy> = (
  policyType
) => {
  const matchPolicy: TApprovalRequestFactoryMatchPolicy<TPamAccessPolicyInputs, TPamAccessPolicy> = async (
    approvalPolicyDAL,
    projectId,
    inputs
  ) => {
    const policies = await approvalPolicyDAL.find({
      type: policyType,
      projectId
    });

    let bestMatch: { policy: TPamAccessPolicy; wildcardCount: number; pathLength: number } | null = null;

    for (const policy of policies) {
      const p = policy as TPamAccessPolicy;
      for (const c of p.conditions.conditions) {
        if (!c.targetResources.some((r) => r === inputs.resourceId)) {
          // eslint-disable-next-line no-continue
          continue;
        }

        // Find the most specific path pattern
        // TODO: Make matching logic more advanced by accounting for wildcard positions
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

    // TODO: Move some of this check to be part of SQL query
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

  return {
    matchPolicy,
    canAccess
  };
};
