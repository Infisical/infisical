import { TApprovalRequests, TDelegatedApprovalPolicies, TDelegatedApprovalRequests } from "@app/db/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "./delegated-approval-enums";
import { TDelegatedApprovalRequestDetails } from "./delegated-approval-schemas";

export type TDelegatedApprovalListItem = {
  name: string;
  type: DelegatedApprovalPolicyType;
  connection: AppConnection;
};

export type TDelegatedApprovalPolicy = Omit<TDelegatedApprovalPolicies, "type"> & {
  type: DelegatedApprovalPolicyType;
};

export type { TDelegatedApprovalRequestDetails };

export type TDelegatedApprovalRequest = Omit<TDelegatedApprovalRequests, "providerType" | "status" | "details"> & {
  providerType: DelegatedApprovalPolicyType;
  status: DelegatedApprovalRequestStatus;
  details: TDelegatedApprovalRequestDetails;
};

export type TValidateDelegatedApprovalConnectionDTO = {
  type: DelegatedApprovalPolicyType;
  connectionId: string;
  projectId: string;
};

export type TDelegatedApprovalPolicyInput = {
  type: DelegatedApprovalPolicyType;
  connectionId: string;
};

export type TCreateDelegatedApprovalPolicyDTO = TDelegatedApprovalPolicyInput & {
  policyId: string;
};

export type TUpdateDelegatedApprovalPolicyDTO = {
  policyId: string;
  type?: DelegatedApprovalPolicyType;
  connectionId?: string;
};

export type TCreateDelegatedApprovalRequestDTO = {
  approvalRequest: Pick<TApprovalRequests, "id" | "type">;
  delegatedPolicy: Pick<TDelegatedApprovalPolicy, "type">;
};

export type TRetryDelegatedApprovalRequestDispatchDTO = {
  approvalRequest: Pick<TApprovalRequests, "id" | "policyId" | "status" | "expiresAt">;
};
