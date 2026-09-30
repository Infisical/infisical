import { TAccessApprovalPolicyDALFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-dal";
import {
  TCreateAccessApprovalPolicy,
  TDeleteAccessApprovalPolicy,
  TGetAccessApprovalPolicyByIdDTO,
  TUpdateAccessApprovalPolicy
} from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  TApprovalPolicyBypassersDALFactory,
  TApprovalPolicyDALFactory,
  TApprovalPolicySecretEnvironmentDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "@app/services/approval-policy/approval-policy-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TSecretAccessApprovalBridgeDALFactory } from "./secret-access-approval-bridge-dal";

export type TSecretAccessApprovalBridgeServiceFactoryDep = {
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findEffectiveProjectSubjectsMembership">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find">;
  userDAL: Pick<TUserDALFactory, "find">;
  groupDAL: Pick<TGroupDALFactory, "find">;
  accessApprovalPolicyDAL: Pick<TAccessApprovalPolicyDALFactory, "findPolicyByEnvIdAndSecretPath">;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "create" | "transaction" | "updateById" | "deleteById">;
  approvalPolicyStepsDAL: Pick<TApprovalPolicyStepsDALFactory, "insertMany" | "delete">;
  approvalPolicyStepApproversDAL: Pick<TApprovalPolicyStepApproversDALFactory, "insertMany">;
  approvalPolicyBypassersDAL: Pick<TApprovalPolicyBypassersDALFactory, "insertMany" | "delete">;
  approvalPolicySecretEnvironmentDAL: Pick<
    TApprovalPolicySecretEnvironmentDALFactory,
    "insertMany" | "delete" | "findPolicyByEnvIdsAndSecretPath"
  >;
  secretAccessApprovalBridgeDAL: Pick<TSecretAccessApprovalBridgeDALFactory, "findSecretAccessPolicies">;
};

export type TCreateSecretAccessApprovalPolicyDTO = TCreateAccessApprovalPolicy;
export type TUpdateSecretAccessApprovalPolicyDTO = TUpdateAccessApprovalPolicy;
export type TDeleteSecretAccessApprovalPolicyDTO = TDeleteAccessApprovalPolicy;
export type TGetSecretAccessApprovalPolicyByIdDTO = TGetAccessApprovalPolicyByIdDTO;

export type TListSecretAccessApprovalPoliciesDTO = { projectId: string };
export type TCountSecretAccessApprovalPoliciesDTO = { projectId: string; envId: string };

export type TCreateSecretAccessApprovalRequestDTO = {
  policy: { id: string; name: string };
  projectId: string;
  envId: string;
  envSlug: string;
  secretPath: string;
  requestedByUserId: string;
  permissions: unknown;
  isTemporary: boolean;
  temporaryRange?: string;
  note?: string;
};
