import {
  TAppConnections,
  TApprovalRequests,
  TDelegatedApprovalPolicies,
  TDelegatedApprovalRequests
} from "@app/db/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalRequestDALFactory } from "@app/services/approval-policy/approval-request-dal";

import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "./delegated-approval-enums";
import { TDelegatedApprovalPolicyDALFactory } from "./delegated-approval-policy-dal";
import { TDelegatedApprovalRequestDALFactory } from "./delegated-approval-request-dal";
import { TDelegatedApprovalProviderDetails, TDelegatedApprovalRequestDetails } from "./delegated-approval-schemas";

export type TDelegatedApprovalListItem = {
  name: string;
  type: DelegatedApprovalPolicyType;
  connection: AppConnection;
};

export type TDelegatedApprovalPolicy = Omit<TDelegatedApprovalPolicies, "type"> & {
  type: DelegatedApprovalPolicyType;
};

export type { TDelegatedApprovalProviderDetails, TDelegatedApprovalRequestDetails };

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

export type TLoadDelegatedApprovalContextDeps = {
  delegatedApprovalRequestDAL: Pick<TDelegatedApprovalRequestDALFactory, "findById" | "primaryNode">;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "findById">;
  delegatedApprovalPolicyDAL: Pick<TDelegatedApprovalPolicyDALFactory, "findOne">;
};

export type TRequireDelegatedApprovalConnectionDTO<T extends Pick<TAppConnections, "orgId">> = {
  rawConnection: T | null | undefined;
  delegatedPolicy: Pick<TDelegatedApprovalPolicies, "type" | "connectionId">;
  organizationId: string;
};

export type TFailDelegatedApprovalRequestDeps = {
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "transaction" | "findByIdForUpdate" | "updateById">;
  delegatedApprovalRequestDAL: Pick<TDelegatedApprovalRequestDALFactory, "updateWithDetails">;
};

export type TFailDelegatedApprovalRequestDTO = {
  id: string;
  requestId: string;
  reason: string;
  closeAs?: ApprovalRequestStatus.Cancelled | ApprovalRequestStatus.Expired;
};
