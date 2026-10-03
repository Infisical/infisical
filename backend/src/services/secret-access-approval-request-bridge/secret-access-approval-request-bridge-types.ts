import {
  TReviewAccessRequestDTO,
  TRevokeAccessRequestDTO
} from "@app/ee/services/access-approval-request/access-approval-request-types";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TQueueServiceFactory } from "@app/queue";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
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
import { TSecretAccessApprovalPolicyBridgeDALFactory } from "@app/services/secret-access-approval-policy-bridge/secret-access-approval-policy-bridge-dal";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TSecretAccessApprovalRequestBridgeDALFactory } from "./secret-access-approval-request-bridge-dal";

export type TSecretAccessApprovalRequestBridgeServiceFactoryDep = {
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  userDAL: Pick<TUserDALFactory, "find" | "findById">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "findGroupMembershipsByUserIdInOrg">;
  approvalRequestDAL: Pick<
    TApprovalRequestDALFactory,
    "create" | "transaction" | "findOne" | "findByIdForUpdate" | "updateById"
  >;
  approvalRequestStepsDAL: Pick<TApprovalRequestStepsDALFactory, "create" | "find" | "updateById">;
  approvalRequestStepEligibleApproversDAL: Pick<TApprovalRequestStepEligibleApproversDALFactory, "create" | "find">;
  approvalRequestApprovalsDAL: Pick<TApprovalRequestApprovalsDALFactory, "create" | "find">;
  approvalRequestGrantsDAL: Pick<TApprovalRequestGrantsDALFactory, "updateById" | "findByIdForUpdate">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "delete">;
  secretAccessApprovalPolicyBridgeDAL: Pick<TSecretAccessApprovalPolicyBridgeDALFactory, "findSecretAccessPolicies">;
  secretAccessApprovalRequestBridgeDAL: Pick<
    TSecretAccessApprovalRequestBridgeDALFactory,
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
    "canAccess" | "validateConstraints" | "postApprovalTxRoutine" | "isBreakGlassEligible"
  >;
};

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
