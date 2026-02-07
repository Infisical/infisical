import picomatch from "picomatch";

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
import { TPamAccessPolicy, TPamAccessPolicyInputs, TPamAccessRequestData } from "./pam-access-policy-types";

// Helper function to check if a value matches any of the patterns in an array
const matchesAnyPattern = (value: string, patterns: string[]): boolean => {
  return patterns.some((pattern) => picomatch(pattern)(value));
};

// Helper function to calculate specificity score for a pattern
const calculateSpecificity = (pattern: string): { wildcardCount: number; length: number } => {
  const wildcardCount = (pattern.match(/\*/g) || []).length;
  return { wildcardCount, length: pattern.length };
};

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

    let bestMatch: { policy: TPamAccessPolicy; wildcardCount: number; patternLength: number } | null = null;

    let normalizedAccountPath: string | undefined;
    if (inputs.accountPath) {
      normalizedAccountPath = inputs.accountPath.startsWith("/") ? inputs.accountPath.slice(1) : inputs.accountPath;
    } else {
      normalizedAccountPath = undefined;
    }

    for (const policy of policies) {
      const p = policy as TPamAccessPolicy;
      for (const c of p.conditions.conditions) {
        let conditionMatches = false;
        let totalWildcards = 0;
        let totalPatternLength = 0;

        // Check new resource/account name based matching
        const hasResourceNames = c.resourceNames && c.resourceNames.length > 0;
        const hasAccountNames = c.accountNames && c.accountNames.length > 0;

        if (hasResourceNames || hasAccountNames) {
          // New matching logic: resourceNames AND/OR accountNames
          let resourceMatches = true;
          let accountMatches = true;

          if (hasResourceNames && inputs.resourceName) {
            resourceMatches = matchesAnyPattern(inputs.resourceName, c.resourceNames!);
            if (resourceMatches) {
              // Find the best matching pattern for specificity calculation
              for (const pattern of c.resourceNames!) {
                if (picomatch(pattern)(inputs.resourceName)) {
                  const spec = calculateSpecificity(pattern);
                  totalWildcards += spec.wildcardCount;
                  totalPatternLength += spec.length;
                  break;
                }
              }
            }
          } else if (hasResourceNames && !inputs.resourceName) {
            // Resource names required but not provided in inputs
            resourceMatches = false;
          }

          if (hasAccountNames && inputs.accountName) {
            accountMatches = matchesAnyPattern(inputs.accountName, c.accountNames!);
            if (accountMatches) {
              // Find the best matching pattern for specificity calculation
              for (const pattern of c.accountNames!) {
                if (picomatch(pattern)(inputs.accountName)) {
                  const spec = calculateSpecificity(pattern);
                  totalWildcards += spec.wildcardCount;
                  totalPatternLength += spec.length;
                  break;
                }
              }
            }
          } else if (hasAccountNames && !inputs.accountName) {
            // Account names required but not provided in inputs
            accountMatches = false;
          }

          conditionMatches = resourceMatches && accountMatches;
        }

        // Legacy matching: accountPaths (for backwards compatibility)
        const hasAccountPaths = c.accountPaths && c.accountPaths.length > 0;
        if (hasAccountPaths && !conditionMatches && normalizedAccountPath) {
          for (const pathPattern of c.accountPaths!) {
            const normalizedPathPattern = pathPattern.startsWith("/") ? pathPattern.slice(1) : pathPattern;
            if (picomatch(normalizedPathPattern)(normalizedAccountPath)) {
              const spec = calculateSpecificity(pathPattern);
              totalWildcards = spec.wildcardCount;
              totalPatternLength = spec.length;
              conditionMatches = true;
              break;
            }
          }
        }

        if (conditionMatches) {
          // Use specificity to determine the best match (fewer wildcards = more specific)
          if (
            !bestMatch ||
            totalWildcards < bestMatch.wildcardCount ||
            (totalWildcards === bestMatch.wildcardCount && totalPatternLength > bestMatch.patternLength)
          ) {
            bestMatch = { policy: p, wildcardCount: totalWildcards, patternLength: totalPatternLength };
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

    let normalizedAccountPath: string | undefined;
    if (inputs.accountPath) {
      normalizedAccountPath = inputs.accountPath.startsWith("/") ? inputs.accountPath.slice(1) : inputs.accountPath;
    } else {
      normalizedAccountPath = undefined;
    }

    // TODO(andrey): Move some of this check to be part of SQL query
    return grants.some((grant) => {
      const grantAttributes = grant.attributes as TPamAccessPolicyInputs;

      // Check new-style matching (resourceName and/or accountName)
      if (inputs.resourceName || inputs.accountName) {
        let resourceMatches = true;
        let accountMatches = true;

        if (inputs.resourceName && grantAttributes.resourceName) {
          resourceMatches = picomatch(grantAttributes.resourceName)(inputs.resourceName);
        } else if (inputs.resourceName && !grantAttributes.resourceName) {
          resourceMatches = false;
        }

        if (inputs.accountName && grantAttributes.accountName) {
          accountMatches = picomatch(grantAttributes.accountName)(inputs.accountName);
        } else if (inputs.accountName && !grantAttributes.accountName) {
          accountMatches = false;
        }

        if (resourceMatches && accountMatches && (!grant.expiresAt || grant.expiresAt > new Date())) {
          return true;
        }
      }

      // Legacy matching: accountPath
      if (normalizedAccountPath && grantAttributes.accountPath) {
        const normalizedGrantPath = grantAttributes.accountPath.startsWith("/")
          ? grantAttributes.accountPath.slice(1)
          : grantAttributes.accountPath;
        const isMatch = picomatch(normalizedGrantPath);
        if (isMatch(normalizedAccountPath) && (!grant.expiresAt || grant.expiresAt > new Date())) {
          return true;
        }
      }

      return false;
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const inputs = request.requestData.requestData as TPamAccessRequestData;
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

  const postRejectionRoutine: TApprovalRequestFactoryPostRejectionRoutine = async () => {};

  return {
    matchPolicy,
    canAccess,
    validateConstraints,
    postApprovalRoutine,
    postRejectionRoutine
  };
};
