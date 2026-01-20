import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import { TApprovalRequestGrantsDALFactory } from "@app/services/approval-policy/approval-request-dal";

import { ApprovalPolicyType, ApproverType } from "./approval-policy-enums";
import {
  TCertRequestPolicy,
  TCertRequestPolicyConditions,
  TCertRequestPolicyConstraints,
  TCertRequestPolicyInputs,
  TCertRequestRequest,
  TCertRequestRequestData
} from "./cert-request/cert-request-policy-types";
import {
  TPamAccessPolicy,
  TPamAccessPolicyConditions,
  TPamAccessPolicyConstraints,
  TPamAccessPolicyInputs,
  TPamAccessRequest,
  TPamAccessRequestData
} from "./pam-access/pam-access-policy-types";

export type TApprovalPolicy = TPamAccessPolicy | TCertRequestPolicy;
export type TApprovalPolicyInputs = TPamAccessPolicyInputs | TCertRequestPolicyInputs;
export type TApprovalPolicyConditions = TPamAccessPolicyConditions | TCertRequestPolicyConditions;
export type TApprovalPolicyConstraints = TPamAccessPolicyConstraints | TCertRequestPolicyConstraints;

export type TApprovalRequest = TPamAccessRequest | TCertRequestRequest;
export type TApprovalRequestData = TPamAccessRequestData | TCertRequestRequestData;

export interface ApprovalPolicyStep {
  name?: string | null;
  requiredApprovals: number;
  notifyApprovers?: boolean | null;
  approvers: {
    type: ApproverType;
    id: string;
  }[];
}

// Policy DTOs
export interface TCreatePolicyDTO {
  projectId: TApprovalPolicy["projectId"];
  name: TApprovalPolicy["name"];
  maxRequestTtl?: TApprovalPolicy["maxRequestTtl"];
  conditions: TApprovalPolicy["conditions"]["conditions"];
  constraints: TApprovalPolicy["constraints"]["constraints"];
  steps: ApprovalPolicyStep[];
  bypassForMachineIdentities?: boolean;
}

export interface TUpdatePolicyDTO {
  name?: TApprovalPolicy["name"];
  maxRequestTtl?: TApprovalPolicy["maxRequestTtl"];
  conditions?: TApprovalPolicy["conditions"]["conditions"];
  constraints?: TApprovalPolicy["constraints"]["constraints"];
  steps?: ApprovalPolicyStep[];
  bypassForMachineIdentities?: boolean;
}

// Request DTOs
export interface TCreateRequestDTO {
  projectId: TApprovalRequest["projectId"];
  requestData: TApprovalRequest["requestData"]["requestData"];
  justification?: TApprovalRequest["justification"];
  requestDuration?: string | null;
}

// Factory
export type TApprovalRequestFactoryMatchPolicy<I extends TApprovalPolicyInputs, P extends TApprovalPolicy> = (
  approvalPolicyDAL: TApprovalPolicyDALFactory,
  projectId: string,
  inputs: I
) => Promise<P | null>;
export type TApprovalRequestFactoryCanAccess<I extends TApprovalPolicyInputs> = (
  approvalRequestGrantsDAL: TApprovalRequestGrantsDALFactory,
  projectId: string,
  userId: string,
  inputs: I
) => Promise<boolean>;
export type TApprovalRequestFactoryValidateConstraints<P extends TApprovalPolicy, R extends TApprovalRequestData> = (
  policy: P,
  inputs: R
) => { valid: boolean; errors?: string[] };
export type TApprovalRequestFactoryPostApprovalRoutine = (
  approvalRequestGrantsDAL: TApprovalRequestGrantsDALFactory,
  request: TApprovalRequest
) => Promise<void>;

export type TApprovalResourceFactory<
  I extends TApprovalPolicyInputs,
  P extends TApprovalPolicy,
  R extends TApprovalRequestData
> = (policyType: ApprovalPolicyType) => {
  matchPolicy: TApprovalRequestFactoryMatchPolicy<I, P>;
  canAccess: TApprovalRequestFactoryCanAccess<I>;
  validateConstraints: TApprovalRequestFactoryValidateConstraints<P, R>;
  postApprovalRoutine: TApprovalRequestFactoryPostApprovalRoutine;
};
