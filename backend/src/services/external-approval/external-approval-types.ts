import { TExternalApprovalPolicies, TExternalApprovalRequests } from "@app/db/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { ExternalApprovalPolicyType, ExternalApprovalRequestStatus } from "./external-approval-enums";

export type TExternalApprovalListItem = {
  name: string;
  type: ExternalApprovalPolicyType;
  connection: AppConnection;
};

export type TExternalApprovalPolicy = Omit<TExternalApprovalPolicies, "type"> & {
  type: ExternalApprovalPolicyType;
};

export type TExternalApprovalRequest = Omit<TExternalApprovalRequests, "status"> & {
  status: ExternalApprovalRequestStatus;
};

export type TValidateExternalApprovalConnectionDTO = {
  type: ExternalApprovalPolicyType;
  connectionId: string;
  projectId: string;
};

export type TExternalApprovalPolicyInput = {
  type: ExternalApprovalPolicyType;
  connectionId: string;
};

export type TCreateExternalApprovalPolicyDTO = TExternalApprovalPolicyInput & {
  policyId: string;
};

export type TUpdateExternalApprovalPolicyDTO = {
  policyId: string;
  type?: ExternalApprovalPolicyType;
  connectionId?: string;
};

export type TCreateExternalApprovalRequestDTO = {
  requestId: string;
  status?: ExternalApprovalRequestStatus;
  statusReason?: string | null;
};

export type TUpdateExternalApprovalRequestDTO = {
  requestId: string;
  status?: ExternalApprovalRequestStatus;
  statusReason?: string | null;
};
