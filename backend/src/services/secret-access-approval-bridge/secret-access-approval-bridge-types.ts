import { TAccessApprovalPolicyDALFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-dal";
import {
  TCreateAccessApprovalPolicy,
  TDeleteAccessApprovalPolicy,
  TGetAccessApprovalPolicyByIdDTO,
  TUpdateAccessApprovalPolicy
} from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import {
  TReviewAccessRequestDTO,
  TRevokeAccessRequestDTO
} from "@app/ee/services/access-approval-request/access-approval-request-types";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TQueueServiceFactory } from "@app/queue";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import {
  TApprovalPolicyBypassersDALFactory,
  TApprovalPolicyDALFactory,
  TApprovalPolicySecretEnvironmentDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "@app/services/approval-policy/approval-policy-dal";
import {
  TApprovalRequestApprovalsDALFactory,
  TApprovalRequestDALFactory,
  TApprovalRequestGrantsDALFactory,
  TApprovalRequestStepEligibleApproversDALFactory,
  TApprovalRequestStepsDALFactory
} from "@app/services/approval-policy/approval-request-dal";
import { TSecretAccessApprovalResource } from "@app/services/approval-policy/secret-access/secret-access-policy-factory";
import { TSecretAccessPolicy } from "@app/services/approval-policy/secret-access/secret-access-policy-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TMicrosoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import { TProjectMicrosoftTeamsConfigDALFactory } from "@app/services/microsoft-teams/project-microsoft-teams-config-dal";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TSecretAccessApprovalBridgeDALFactory } from "./secret-access-approval-bridge-dal";

export type TSecretAccessApprovalBridgeServiceFactoryDep = {
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findEffectiveProjectSubjectsMembership" | "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find">;
  userDAL: Pick<TUserDALFactory, "find" | "findById">;
  groupDAL: Pick<TGroupDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "findGroupMembershipsByUserIdInOrg">;
  accessApprovalPolicyDAL: Pick<TAccessApprovalPolicyDALFactory, "findPolicyByEnvIdAndSecretPath">;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "create" | "transaction" | "updateById" | "deleteById">;
  approvalPolicyStepsDAL: Pick<TApprovalPolicyStepsDALFactory, "insertMany" | "delete">;
  approvalPolicyStepApproversDAL: Pick<TApprovalPolicyStepApproversDALFactory, "insertMany">;
  approvalPolicyBypassersDAL: Pick<TApprovalPolicyBypassersDALFactory, "insertMany" | "delete">;
  approvalPolicySecretEnvironmentDAL: Pick<
    TApprovalPolicySecretEnvironmentDALFactory,
    "insertMany" | "delete" | "findPolicyByEnvIdsAndSecretPath"
  >;
  approvalRequestDAL: Pick<
    TApprovalRequestDALFactory,
    "create" | "transaction" | "find" | "findOne" | "findByIdForUpdate" | "update" | "updateById"
  >;
  approvalRequestStepsDAL: Pick<TApprovalRequestStepsDALFactory, "create" | "find" | "updateById">;
  approvalRequestStepEligibleApproversDAL: Pick<TApprovalRequestStepEligibleApproversDALFactory, "create" | "find">;
  approvalRequestApprovalsDAL: Pick<TApprovalRequestApprovalsDALFactory, "create" | "find">;
  approvalRequestGrantsDAL: Pick<TApprovalRequestGrantsDALFactory, "update" | "updateById" | "findByIdForUpdate">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "delete">;
  secretAccessApprovalBridgeDAL: Pick<
    TSecretAccessApprovalBridgeDALFactory,
    | "findSecretAccessPolicies"
    | "findSecretAccessRequestById"
    | "findSecretAccessRequests"
    | "findPendingRequests"
    | "findGrantsByRequestIds"
    | "findPrivilegesByGrantIds"
    | "findApprovalsByRequestIds"
    | "findGroupMembers"
    | "findUsersByIds"
    | "findOrgMembershipActivity"
  >;
  smtpService: Pick<TSmtpService, "sendMail">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  microsoftTeamsService: Pick<TMicrosoftTeamsServiceFactory, "sendNotification">;
  projectMicrosoftTeamsConfigDAL: Pick<TProjectMicrosoftTeamsConfigDALFactory, "getIntegrationDetailsByProject">;
  queueService: Pick<TQueueServiceFactory, "queue">;
  secretAccessApprovalResource: Pick<
    TSecretAccessApprovalResource,
    "canAccess" | "validateConstraints" | "postApprovalTxRoutine"
  >;
};

export type TCreateSecretAccessApprovalPolicyDTO = TCreateAccessApprovalPolicy;
export type TUpdateSecretAccessApprovalPolicyDTO = TUpdateAccessApprovalPolicy;
export type TDeleteSecretAccessApprovalPolicyDTO = TDeleteAccessApprovalPolicy;
export type TGetSecretAccessApprovalPolicyByIdDTO = TGetAccessApprovalPolicyByIdDTO;

export type TListSecretAccessApprovalPoliciesDTO = { projectId: string };
export type TCountSecretAccessApprovalPoliciesDTO = { projectId: string; envId: string };

export type TCreateSecretAccessApprovalRequestDTO = {
  policy: TSecretAccessPolicy;
  projectId: string;
  envId: string;
  envSlug: string;
  envName: string;
  secretPath: string;
  requestedByUserId: string;
  actorOrgId: string;
  permissions: unknown;
  isTemporary: boolean;
  temporaryRange?: string;
  note?: string;
};

export type TListSecretAccessApprovalRequestsDTO = { projectId: string };
export type TCountSecretAccessApprovalRequestsDTO = { projectId: string; policyId?: string; requesterId?: string };
export type TReviewSecretAccessApprovalRequestDTO = TReviewAccessRequestDTO;
export type TRevokeSecretAccessApprovalRequestDTO = TRevokeAccessRequestDTO;
