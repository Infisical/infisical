import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { EnforcementLevel, OrgServiceActor, TProjectPermission } from "@app/lib/types";
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
  orgActor: OrgServiceActor;
} & Omit<TProjectPermission, "projectId">;

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
  orgActor: OrgServiceActor;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteAccessApprovalPolicy = {
  policyId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetAccessPolicyCountByEnvironmentDTO = {
  envSlug: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetAccessApprovalPolicyByIdDTO = {
  policyId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListAccessApprovalPoliciesDTO = {
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TSecretAccessApprovalPolicyServiceFactoryDep = {
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findEffectiveProjectSubjectsMembership">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
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
