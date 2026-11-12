import { Knex } from "knex";

import { TProjectEnvironments, TSecretApprovalPolicies } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { EnforcementLevel, TProjectPermission } from "@app/lib/types";
import {
  TApprovalPolicyBypassersDALFactory,
  TApprovalPolicyDALFactory,
  TApprovalPolicySecretEnvironmentDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "@app/services/approval-policy/approval-policy-dal";
import { TApprovalRequestDALFactory } from "@app/services/approval-policy/approval-request-dal";
import { TDelegatedApprovalPolicyInput } from "@app/services/delegated-approval/delegated-approval-types";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { ApproverType, BypasserType } from "../access-approval-policy/access-approval-policy-types";
import { TLicenseServiceFactory } from "../license/license-service";
import { TSecretChangePolicyDALFactory } from "./secret-change-policy-dal";

export type TCreateSapDTO = {
  approvals: number;
  secretPath: string;
  environment?: string;
  environments?: string[];
  approvers: ({ type: ApproverType.Group; id: string } | { type: ApproverType.User; id?: string; username?: string })[];
  bypassers?: (
    | { type: BypasserType.Group; id: string }
    | { type: BypasserType.User; id?: string; username?: string }
  )[];
  projectId: string;
  name: string;
  enforcementLevel: EnforcementLevel;
  allowedSelfApprovals: boolean;
  bypassForMachineIdentities: boolean;
  delegatedApproval?: TDelegatedApprovalPolicyInput;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateSapDTO = {
  secretPolicyId: string;
  approvals?: number;
  secretPath?: string;
  approvers: ({ type: ApproverType.Group; id: string } | { type: ApproverType.User; id?: string; username?: string })[];
  bypassers?: (
    | { type: BypasserType.Group; id: string }
    | { type: BypasserType.User; id?: string; username?: string }
  )[];
  name?: string;
  enforcementLevel?: EnforcementLevel;
  allowedSelfApprovals?: boolean;
  bypassForMachineIdentities?: boolean;
  environments?: string[];
  delegatedApproval?: TDelegatedApprovalPolicyInput;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteSapDTO = {
  secretPolicyId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListSapDTO = TProjectPermission;

export type TGetSapByIdDTO = Omit<TProjectPermission, "projectId"> & { sapId: string };

export type TGetBoardSapDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
} & Omit<TProjectPermission, "projectId">;

export type TSecretChangePolicyEnvironment = Pick<TProjectEnvironments, "id" | "name" | "slug">;

export type TSecretChangePolicyApprover = { type: ApproverType; id: string; username?: string | null };
export type TSecretChangePolicyBypasser = { type: BypasserType; id: string; username?: string | null };

export type TSecretChangePolicy = TSecretApprovalPolicies & {
  projectId: string;
  environments: TSecretChangePolicyEnvironment[];
  environment: TSecretChangePolicyEnvironment;
  approvers: TSecretChangePolicyApprover[];
  bypassers: TSecretChangePolicyBypasser[];
  userApprovers: { userId: string }[];
};

export type TSecretChangePolicyMethods = {
  createSecretApprovalPolicy: (dto: TCreateSapDTO) => Promise<TSecretChangePolicy>;
  updateSecretApprovalPolicy: (dto: TUpdateSapDTO) => Promise<TSecretChangePolicy>;
  deleteSecretApprovalPolicy: (dto: TDeleteSapDTO) => Promise<TSecretChangePolicy>;
  findSecretChangePolicyById: (policyId: string, tx?: Knex) => Promise<TSecretChangePolicy | undefined>;
  getSecretApprovalPolicyById: (dto: TGetSapByIdDTO) => Promise<TSecretChangePolicy>;
  getSecretApprovalPolicyByProjectId: (dto: TListSapDTO) => Promise<TSecretChangePolicy[]>;
  getSecretApprovalPolicy: (
    projectId: string,
    environment: string,
    path: string,
    tx?: Knex
  ) => Promise<TSecretChangePolicy | undefined>;
  getSecretApprovalPolicyByPaths: (
    projectId: string,
    environment: string,
    secretPaths: string[],
    tx?: Knex
  ) => Promise<Map<string, TSecretChangePolicy>>;
  getSecretApprovalPolicyOfFolder: (dto: TGetBoardSapDTO) => Promise<TSecretChangePolicy | undefined>;
};

export type TSecretChangePolicyServiceFactoryDep = {
  approvalPolicyDAL: Pick<
    TApprovalPolicyDALFactory,
    "findByIdForUpdate" | "create" | "updateById" | "deleteById" | "transaction"
  >;
  approvalPolicyStepsDAL: Pick<TApprovalPolicyStepsDALFactory, "create" | "updateById">;
  approvalPolicyStepApproversDAL: Pick<TApprovalPolicyStepApproversDALFactory, "insertMany" | "delete">;
  approvalPolicyBypassersDAL: Pick<TApprovalPolicyBypassersDALFactory, "insertMany" | "delete">;
  approvalPolicySecretEnvironmentDAL: Pick<
    TApprovalPolicySecretEnvironmentDALFactory,
    "insertMany" | "delete" | "findSecretChangePolicyByEnvIdsAndSecretPath"
  >;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "update">;
  secretChangePolicyDAL: Pick<TSecretChangePolicyDALFactory, "findSecretChangePolicies">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find" | "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findEffectiveProjectSubjectsMembership">;
  userDAL: Pick<TUserDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};
