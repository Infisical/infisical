import {
  TApprovalPolicyDALFactory,
  TApprovalRequestGrantsDALFactory
} from "@app/services/approval-policy/approval-policy-dal";

import { ApprovalPolicyType, ApproverType } from "./approval-policy-enums";
import {
  TPamAccessPolicy,
  TPamAccessPolicyConditions,
  TPamAccessPolicyConstraints,
  TPamAccessPolicyInputs,
  TPamAccessRequest,
  TPamAccessRequestData
} from "./pam-access/pam-access-policy-types";

export type TApprovalPolicy = TPamAccessPolicy;
export type TApprovalPolicyInputs = TPamAccessPolicyInputs;
export type TApprovalPolicyConditions = TPamAccessPolicyConditions;
export type TApprovalPolicyConstraints = TPamAccessPolicyConstraints;

export type TApprovalRequest = TPamAccessRequest;
export type TApprovalRequestData = TPamAccessRequestData;

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
}

export interface TUpdatePolicyDTO {
  name?: TApprovalPolicy["name"];
  maxRequestTtl?: TApprovalPolicy["maxRequestTtl"];
  conditions?: TApprovalPolicy["conditions"]["conditions"];
  constraints?: TApprovalPolicy["constraints"]["constraints"];
  steps?: ApprovalPolicyStep[];
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
) => boolean;
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
