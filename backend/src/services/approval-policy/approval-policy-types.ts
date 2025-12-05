import { TApprovalPolicyDALFactory, TApprovalRequestGrantsDALFactory } from "./approval-policy-dal";
import { ApprovalPolicyType, ApproverType } from "./approval-policy-enums";
import {
  TPamAccessPolicy,
  TPamAccessPolicyConditions,
  TPamAccessPolicyConstraints,
  TPamAccessPolicyInputs
} from "./pam-access/pam-access-policy-types";

export type TApprovalPolicy = TPamAccessPolicy;
export type TApprovalPolicyInputs = TPamAccessPolicyInputs;
export type TApprovalPolicyConditions = TPamAccessPolicyConditions;
export type TApprovalPolicyConstraints = TPamAccessPolicyConstraints;

// DTOs
export interface TCreatePolicyDTO {
  projectId: TApprovalPolicy["projectId"];
  organizationId: TApprovalPolicy["organizationId"];
  name: TApprovalPolicy["name"];
  maxRequestTtlSeconds?: TApprovalPolicy["maxRequestTtlSeconds"];
  conditions: TApprovalPolicy["conditions"]["conditions"];
  constraints: TApprovalPolicy["constraints"]["constraints"];
  steps: {
    name?: string | null;
    requiredApprovals: number;
    notifyApprovers?: boolean;
    approvers: {
      type: ApproverType.User | ApproverType.Group;
      id: string;
    }[];
  }[];
}

export interface TUpdatePolicyDTO {
  name?: TApprovalPolicy["name"];
  maxRequestTtlSeconds?: TApprovalPolicy["maxRequestTtlSeconds"];
  conditions?: TApprovalPolicy["conditions"]["conditions"];
  constraints?: TApprovalPolicy["constraints"]["constraints"];
  steps?: {
    name?: string | null;
    requiredApprovals: number;
    notifyApprovers?: boolean;
    approvers: {
      type: ApproverType.User | ApproverType.Group;
      id: string;
    }[];
  }[];
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

export type TApprovalResourceFactory<I extends TApprovalPolicyInputs, P extends TApprovalPolicy> = (
  policyType: ApprovalPolicyType
) => {
  matchPolicy: TApprovalRequestFactoryMatchPolicy<I, P>;
  canAccess: TApprovalRequestFactoryCanAccess<I>;
};
