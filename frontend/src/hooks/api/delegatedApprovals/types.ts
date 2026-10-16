import { AppConnection } from "../appConnections/enums";
import { DelegatedApprovalPolicyType } from "./enums";

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
