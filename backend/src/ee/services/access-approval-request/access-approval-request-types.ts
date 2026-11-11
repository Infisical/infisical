import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TProjectPermission } from "@app/lib/types";
import { TQueueServiceFactory } from "@app/queue";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import {
  TApprovalRequestApprovalsDALFactory,
  TApprovalRequestDALFactory,
  TApprovalRequestGrantsDALFactory,
  TApprovalRequestStepEligibleApproversDALFactory,
  TApprovalRequestStepsDALFactory
} from "@app/services/approval-policy/approval-request-dal";
import { TSecretAccessApprovalGlobalResource } from "@app/services/approval-policy/secret-access/secret-access-policy-factory";
import { TDelegatedApprovalServiceFactory } from "@app/services/delegated-approval/delegated-approval-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TMicrosoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import { TProjectMicrosoftTeamsConfigDALFactory } from "@app/services/microsoft-teams/project-microsoft-teams-config-dal";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TSecretAccessApprovalPolicyDALFactory } from "../access-approval-policy/access-approval-policy-dal";
import { TSecretAccessApprovalRequestDALFactory } from "./access-approval-request-dal";

export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  REVOKED = "revoked"
}

export type TVerifyPermission = {
  permissions: unknown;
};

export type TGetAccessRequestCountDTO = {
  projectSlug: string;
  policyId?: string;
} & Omit<TProjectPermission, "projectId">;

export type TReviewAccessRequestDTO = {
  requestId: string;
  status: ApprovalStatus;
  envName?: string;
  bypassReason?: string;
} & Omit<TProjectPermission, "projectId">;

export type TCreateAccessApprovalRequestDTO = {
  projectSlug: string;
  permissions: unknown;
  isTemporary: boolean;
  temporaryRange?: string;
  note?: string;
} & Omit<TProjectPermission, "projectId">;

export type TRevokeAccessRequestDTO = {
  requestId: string;
} & Omit<TProjectPermission, "projectId">;

export type TRetryDelegatedApprovalDispatchDTO = {
  requestId: string;
} & Omit<TProjectPermission, "projectId">;

export type TCancelAccessRequestDTO = {
  requestId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListApprovalRequestsDTO = {
  projectSlug: string;
  authorUserId?: string;
  envSlug?: string;
} & Omit<TProjectPermission, "projectId">;

export type TNotifyDelegatedDecisionDTO = {
  requestId: string;
};

export type TSecretAccessApprovalRequestServiceFactoryDep = {
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findProjectBySlug" | "checkProjectUpgradeStatus">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find" | "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  userDAL: Pick<TUserDALFactory, "find" | "findById">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "findGroupMembershipsByUserIdInOrg">;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "create" | "transaction" | "findByIdForUpdate" | "updateById">;
  approvalRequestStepsDAL: Pick<TApprovalRequestStepsDALFactory, "create" | "find" | "updateById">;
  approvalRequestStepEligibleApproversDAL: Pick<TApprovalRequestStepEligibleApproversDALFactory, "create" | "find">;
  approvalRequestApprovalsDAL: Pick<TApprovalRequestApprovalsDALFactory, "create" | "find">;
  approvalRequestGrantsDAL: Pick<TApprovalRequestGrantsDALFactory, "updateById" | "findByIdForUpdate">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "delete">;
  secretAccessApprovalPolicyDAL: Pick<TSecretAccessApprovalPolicyDALFactory, "findSecretAccessPolicies">;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findByIdForShare" | "findStepsByPolicyId">;
  secretAccessApprovalRequestDAL: Pick<
    TSecretAccessApprovalRequestDALFactory,
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
  delegatedApprovalService: Pick<
    TDelegatedApprovalServiceFactory,
    "getPolicyByPolicyId" | "createRequest" | "getRequestByRequestId" | "getRequestsByRequestIds" | "retryDispatch"
  >;
  smtpService: Pick<TSmtpService, "sendMail">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  microsoftTeamsService: Pick<TMicrosoftTeamsServiceFactory, "sendNotification">;
  projectMicrosoftTeamsConfigDAL: Pick<TProjectMicrosoftTeamsConfigDALFactory, "getIntegrationDetailsByProject">;
  queueService: Pick<TQueueServiceFactory, "queue">;
  secretAccessApprovalGlobalResource: Pick<
    TSecretAccessApprovalGlobalResource,
    "canAccess" | "validateConstraints" | "postApprovalTxRoutine" | "isBreakGlassEligible" | "matchPolicy"
  >;
};
