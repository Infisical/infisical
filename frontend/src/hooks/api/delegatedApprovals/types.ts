import { AppConnection } from "../appConnections/enums";
import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "./enums";

export type TDelegatedApprovalOption = {
  name: string;
  type: DelegatedApprovalPolicyType;
  connection: AppConnection;
};

export type TListDelegatedApprovalOptions = {
  delegatedApprovalOptions: TDelegatedApprovalOption[];
};

export type TDelegatedApprovalPolicyInput = {
  type: DelegatedApprovalPolicyType;
  connectionId: string;
};

export type TDelegatedApprovalRequestProvider = {
  type: DelegatedApprovalPolicyType;
  recordNumber: string;
};

export type TDelegatedApprovalRequest = {
  status: DelegatedApprovalRequestStatus;
  statusReason?: string | null;
  provider?: TDelegatedApprovalRequestProvider | null;
};
