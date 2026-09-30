import { TAccessApprovalPolicyDALFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-dal";
import { TCreateAccessApprovalPolicy } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
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

export type TSecretAccessApprovalBridgeServiceFactoryDep = {
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findEffectiveProjectSubjectsMembership">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find">;
  userDAL: Pick<TUserDALFactory, "find">;
  accessApprovalPolicyDAL: Pick<TAccessApprovalPolicyDALFactory, "findPolicyByEnvIdAndSecretPath">;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "create" | "transaction">;
  approvalPolicyStepsDAL: Pick<TApprovalPolicyStepsDALFactory, "insertMany">;
  approvalPolicyStepApproversDAL: Pick<TApprovalPolicyStepApproversDALFactory, "insertMany">;
  approvalPolicyBypassersDAL: Pick<TApprovalPolicyBypassersDALFactory, "insertMany">;
  approvalPolicySecretEnvironmentDAL: Pick<
    TApprovalPolicySecretEnvironmentDALFactory,
    "insertMany" | "findPolicyByEnvIdsAndSecretPath"
  >;
};

export type TCreateSecretAccessApprovalPolicyDTO = TCreateAccessApprovalPolicy;

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
