import { TLicenseService } from "@app/domains/platform/license/ce/module";
import { TSecretsPermissionService } from "@app/domains/secrets-manager/secrets/ce/module";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { EnforcementLevel, TActorInput } from "@app/lib/types";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import {
  TApprovalPolicyBypassersDALFactory,
  TApprovalPolicyDALFactory,
  TApprovalPolicySecretEnvironmentDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "@app/services/approval-policy/approval-policy-dal";
import {
  TApprovalRequestDALFactory,
  TApprovalRequestGrantsDALFactory,
  TApprovalRequestStepEligibleApproversDALFactory,
  TApprovalRequestStepsDALFactory
} from "@app/services/approval-policy/approval-request-dal";
import { TDelegatedApprovalServiceFactory } from "@app/services/delegated-approval/delegated-approval-service";
import { TDelegatedApprovalPolicyInput } from "@app/services/delegated-approval/delegated-approval-types";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TSecretAccessApprovalPolicyDALFactory } from "./access-approval-policy-dal";

export enum ApproverType {
  Group = "group",
  User = "user"
}

export enum BypasserType {
  Group = "group",
  User = "user"
}

export type TCreateAccessApprovalPolicy = {
  approvals: number;
  secretPath: string;
  environment?: string;
  environments?: string[];
  approvers: (
    | { type: ApproverType.Group; id: string; sequence?: number }
    | { type: ApproverType.User; id?: string; username?: string; sequence?: number }
  )[];
  bypassers?: (
    | { type: BypasserType.Group; id: string }
    | { type: BypasserType.User; id?: string; username?: string }
  )[];
  projectSlug: string;
  name: string;
  enforcementLevel: EnforcementLevel;
  allowedSelfApprovals?: boolean;
  approvalsRequired?: { numberOfApprovals: number; stepNumber: number }[];
  maxTimePeriod?: string | null;
  requestExpirationTime?: string | null;
  delegatedApproval?: TDelegatedApprovalPolicyInput;
} & TActorInput;

export type TUpdateAccessApprovalPolicy = {
  policyId: string;
  approvals?: number;
  approvers: (
    | { type: ApproverType.Group; id: string; sequence?: number }
    | { type: ApproverType.User; id?: string; username?: string; sequence?: number }
  )[];
  bypassers?: (
    | { type: BypasserType.Group; id: string }
    | { type: BypasserType.User; id?: string; username?: string }
  )[];
  secretPath?: string;
  name?: string;
  enforcementLevel?: EnforcementLevel;
  allowedSelfApprovals?: boolean;
  approvalsRequired?: { numberOfApprovals: number; stepNumber: number }[];
  environments?: string[];
  maxTimePeriod?: string | null;
  requestExpirationTime?: string | null;
  delegatedApproval?: TDelegatedApprovalPolicyInput | null;
} & TActorInput;

export type TDeleteAccessApprovalPolicy = {
  policyId: string;
} & TActorInput;

export type TGetAccessPolicyCountByEnvironmentDTO = {
  envSlug: string;
  projectSlug: string;
} & TActorInput;

export type TGetAccessApprovalPolicyByIdDTO = {
  policyId: string;
} & TActorInput;

export type TListAccessApprovalPoliciesDTO = {
  projectSlug: string;
} & TActorInput;

export type TSecretAccessApprovalPolicyServiceFactoryDep = {
  licenseService: TLicenseService;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findEffectiveProjectSubjectsMembership">;
  secretsPermissionService: TSecretsPermissionService;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find" | "findOne">;
  userDAL: Pick<TUserDALFactory, "find">;
  groupDAL: Pick<TGroupDALFactory, "find">;
  approvalPolicyDAL: Pick<
    TApprovalPolicyDALFactory,
    "create" | "transaction" | "updateById" | "deleteById" | "findByIdForUpdate"
  >;
  approvalPolicyStepsDAL: Pick<TApprovalPolicyStepsDALFactory, "insertMany" | "delete">;
  approvalPolicyStepApproversDAL: Pick<TApprovalPolicyStepApproversDALFactory, "insertMany">;
  approvalPolicyBypassersDAL: Pick<TApprovalPolicyBypassersDALFactory, "insertMany" | "delete">;
  approvalPolicySecretEnvironmentDAL: Pick<
    TApprovalPolicySecretEnvironmentDALFactory,
    "insertMany" | "delete" | "findPolicyByEnvIdsAndSecretPath" | "findByPolicyIdForUpdate"
  >;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "find" | "update" | "findPendingByPolicyIdForUpdate">;
  approvalRequestStepsDAL: Pick<TApprovalRequestStepsDALFactory, "create" | "delete">;
  approvalRequestStepEligibleApproversDAL: Pick<TApprovalRequestStepEligibleApproversDALFactory, "create">;
  approvalRequestGrantsDAL: Pick<TApprovalRequestGrantsDALFactory, "update">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "delete">;
  secretAccessApprovalPolicyDAL: Pick<TSecretAccessApprovalPolicyDALFactory, "findSecretAccessPolicies">;
  delegatedApprovalService: Pick<
    TDelegatedApprovalServiceFactory,
    "validateConnection" | "assertPlanAllowsPolicyEdit" | "createPolicy" | "updatePolicy" | "deletePolicyByPolicyId"
  >;
};
