import { TApprovalRequests, TDelegatedApprovalPolicies, TDelegatedApprovalRequests } from "@app/db/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "./delegated-approval-enums";

export type TDelegatedApprovalListItem = {
  name: string;
  type: DelegatedApprovalPolicyType;
  connection: AppConnection;
};

export type TDelegatedApprovalPolicy = Omit<TDelegatedApprovalPolicies, "type"> & {
  type: DelegatedApprovalPolicyType;
};

export type TDelegatedApprovalRequest = Omit<TDelegatedApprovalRequests, "status"> & {
  status: DelegatedApprovalRequestStatus;
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
};

export type TRetryDelegatedApprovalRequestDispatchDTO = {
  approvalRequest: Pick<TApprovalRequests, "id" | "policyId" | "status" | "expiresAt">;
};

export type TUpdateDelegatedApprovalRequestDTO = {
  requestId: string;
  status?: DelegatedApprovalRequestStatus;
  statusReason?: string | null;
};
