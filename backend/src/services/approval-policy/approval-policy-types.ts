import { Knex } from "knex";

import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import { TApprovalRequestGrantsDALFactory } from "@app/services/approval-policy/approval-request-dal";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TCertificateRequestDALFactory } from "@app/services/certificate-request/certificate-request-dal";
import { TCertificateApprovalService } from "@app/services/certificate-v3/certificate-approval-fns";

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

export interface TCreateRequestFromPolicyDTO {
  projectId: string;
  organizationId: string;
  policy: TApprovalPolicy;
  requestData: TApprovalRequest["requestData"]["requestData"];
  justification?: string | null;
  expiresAt?: Date | null;
  requesterUserId?: string | null;
  machineIdentityId?: string | null;
  requesterName: string;
  requesterEmail: string;
  tx?: Knex;
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

export type TPostApprovalContext = {
  actor?: {
    type: ActorType;
    id: string;
    authMethod: ActorAuthMethod;
    orgId: string;
  };
  certificateApprovalService?: TCertificateApprovalService;
  certificateRequestDAL?: Pick<TCertificateRequestDALFactory, "updateById" | "findById">;
};

export type TApprovalRequestFactoryPostApprovalRoutine<C extends TPostApprovalContext = TPostApprovalContext> = (
  approvalRequestGrantsDAL: TApprovalRequestGrantsDALFactory,
  request: TApprovalRequest,
  context: C
) => Promise<void>;

export type TApprovalRequestFactoryPostRejectionRoutine<C extends TPostApprovalContext = TPostApprovalContext> = (
  request: TApprovalRequest,
  context: C
) => Promise<void>;

export type TApprovalResourceFactory<
  I extends TApprovalPolicyInputs,
  P extends TApprovalPolicy,
  R extends TApprovalRequestData,
  C extends TPostApprovalContext = TPostApprovalContext
> = (policyType: ApprovalPolicyType) => {
  matchPolicy: TApprovalRequestFactoryMatchPolicy<I, P>;
  canAccess: TApprovalRequestFactoryCanAccess<I>;
  validateConstraints: TApprovalRequestFactoryValidateConstraints<P, R>;
  postApprovalRoutine: TApprovalRequestFactoryPostApprovalRoutine<C>;
  postRejectionRoutine: TApprovalRequestFactoryPostRejectionRoutine<C>;
};
