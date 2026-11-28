import { TSecretAccessApprovalRequestServiceFactory } from "@app/ee/services/access-approval-request/access-approval-request-service";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalResource } from "@app/services/approval-policy/approval-policy-types";
import { TSecretAccessApprovalGlobalResource } from "@app/services/approval-policy/secret-access/secret-access-policy-factory";
import { DelegatedApprovalSupportedPolicyType } from "@app/services/delegated-approval/delegated-approval-maps";

import { TDelegatedApprovalDecisionNotifier } from "./delegated-approval-decision-types";

type TDelegatedApprovalDecisionMapsFactoryDep = {
  secretAccessApprovalGlobalResource: Pick<TSecretAccessApprovalGlobalResource, "postApprovalTxRoutine">;
  secretAccessApprovalRequestService: Pick<TSecretAccessApprovalRequestServiceFactory, "notifyDelegatedDecision">;
};

export const delegatedApprovalDecisionMapsFactory = ({
  secretAccessApprovalGlobalResource,
  secretAccessApprovalRequestService
}: TDelegatedApprovalDecisionMapsFactoryDep) => {
  const approvalResources = {
    [ApprovalPolicyType.SecretAccess]: secretAccessApprovalGlobalResource
  } satisfies Record<DelegatedApprovalSupportedPolicyType, Pick<TApprovalResource, "postApprovalTxRoutine">>;

  const decisionNotifiers = {
    [ApprovalPolicyType.SecretAccess]: ({ approvalRequestId }) =>
      secretAccessApprovalRequestService.notifyDelegatedDecision({ requestId: approvalRequestId })
  } satisfies Record<DelegatedApprovalSupportedPolicyType, TDelegatedApprovalDecisionNotifier>;

  return { approvalResources, decisionNotifiers };
};
