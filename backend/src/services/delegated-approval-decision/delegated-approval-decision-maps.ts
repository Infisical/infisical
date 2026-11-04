import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalResource } from "@app/services/approval-policy/approval-policy-types";
import { TSecretAccessApprovalGlobalResource } from "@app/services/approval-policy/secret-access/secret-access-policy-factory";
import { DelegatedApprovalSupportedPolicyType } from "@app/services/delegated-approval/delegated-approval-maps";
import { TSecretAccessApprovalGlobalRequestBridgeServiceFactory } from "@app/services/secret-access-approval-global-request-bridge/secret-access-approval-global-request-bridge-service";

import { TDelegatedApprovalDecisionNotifier } from "./delegated-approval-decision-types";

type TDelegatedApprovalDecisionMapsFactoryDep = {
  secretAccessApprovalGlobalResource: Pick<TSecretAccessApprovalGlobalResource, "postApprovalTxRoutine">;
  secretAccessApprovalGlobalRequestBridgeService: Pick<
    TSecretAccessApprovalGlobalRequestBridgeServiceFactory,
    "notifyDelegatedDecision"
  >;
};

export const delegatedApprovalDecisionMapsFactory = ({
  secretAccessApprovalGlobalResource,
  secretAccessApprovalGlobalRequestBridgeService
}: TDelegatedApprovalDecisionMapsFactoryDep) => {
  const approvalResources = {
    [ApprovalPolicyType.SecretAccess]: secretAccessApprovalGlobalResource
  } satisfies Record<DelegatedApprovalSupportedPolicyType, Pick<TApprovalResource, "postApprovalTxRoutine">>;

  const decisionNotifiers = {
    [ApprovalPolicyType.SecretAccess]: ({ approvalRequestId }) =>
      secretAccessApprovalGlobalRequestBridgeService.notifyDelegatedDecision({ requestId: approvalRequestId })
  } satisfies Record<DelegatedApprovalSupportedPolicyType, TDelegatedApprovalDecisionNotifier>;

  return { approvalResources, decisionNotifiers };
};
