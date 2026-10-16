import { ProjectType, TApprovalRequests } from "@app/db/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";

import { DelegatedApprovalPolicyType } from "../delegated-approval-enums";

export type TSecretAccessDispatchDetails = {
  policyType: ApprovalPolicyType.SecretAccess;
  environment: string;
  secretPath: string;
  permissions: string[];
  isTemporary: boolean;
  temporaryRange: string | null;
};

// Discriminated by the approval policy type. Another policy type is dispatched by adding its arm here
// and a builder for it in DELEGATED_APPROVAL_DISPATCH_DETAILS_BUILDER_MAP.
export type TDelegatedApprovalDispatchDetails = TSecretAccessDispatchDetails;

export type TDelegatedApprovalDispatchInput = {
  delegatedRequestId: string;
  approvalRequestId: string;
  organizationId: string;
  productType: ProjectType;
  project?: { id: string; name: string }; // project is optional because it is possible that PAM and PKI don't need it
  requester: { name: string; email: string };
  justification: string | null;
  // The token is plaintext only here, on its way to the provider. It is never persisted or logged.
  callback: { url: string; token: string };
  details: TDelegatedApprovalDispatchDetails;
};

export type TDelegatedApprovalDispatchResult = {
  providerRequestId: string;
  // The provider already held this request from an earlier attempt whose response was lost. Safe to treat
  // as delivered because every attempt sends the same callback token.
  duplicate: boolean;
};

export type TDelegatedApprovalProvider = {
  type: DelegatedApprovalPolicyType;
  app: AppConnection;
  dispatch: (
    input: TDelegatedApprovalDispatchInput,
    connection: TAppConnection
  ) => Promise<TDelegatedApprovalDispatchResult>;
};

export type TDelegatedApprovalDispatchDetailsBuilder = (
  request: TApprovalRequests
) => TDelegatedApprovalDispatchDetails;

export type TDelegatedApprovalDispatchJobPayload = { delegatedRequestId: string };
