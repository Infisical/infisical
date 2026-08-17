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
import { normalizeCodeSigningScope } from "./code-signing-policy-fns";
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

    return (
      grants.find((grant) => {
        const attributes = grant.attributes as TCodeSigningGrantAttributes | null;
        if (!attributes || attributes.signerId !== inputs.signerId) return false;
        if (attributes.windowStart && new Date(attributes.windowStart) > now) return false;
        if (grant.expiresAt && new Date(grant.expiresAt) < now) return false;
        return true;
      }) ?? null
    );
  };

  const validateConstraints: TApprovalRequestFactoryValidateConstraints<TCodeSigningPolicy, TCodeSigningRequestData> = (
    policy,
    inputs
  ) => {
    const errors: string[] = [];
    const { maxWindowDuration, maxSignings } = policy.constraints.constraints;

    if ((maxWindowDuration || maxSignings) && !inputs.requestedWindowDuration && !inputs.requestedSignings) {
      errors.push("A request must ask for a signature count or a signing window");
    }

    if (
      maxWindowDuration &&
      inputs.requestedWindowDuration &&
      ms(inputs.requestedWindowDuration) > ms(maxWindowDuration)
    ) {
      errors.push(`Requested window duration exceeds maximum of ${maxWindowDuration}`);
    }

    if (maxSignings && inputs.requestedSignings && inputs.requestedSignings > maxSignings) {
      errors.push(`Requested signings (${inputs.requestedSignings}) exceeds maximum of ${maxSignings}`);
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

    if (requestData.requestedWindowDuration) {
      const windowStart = new Date();
      grantAttributes.windowStart = windowStart.toISOString();
      expiresAt = new Date(windowStart.getTime() + ms(requestData.requestedWindowDuration));
    }
    const scope = normalizeCodeSigningScope(requestData.scope);
    if (scope) {
      grantAttributes.scope = scope;
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
