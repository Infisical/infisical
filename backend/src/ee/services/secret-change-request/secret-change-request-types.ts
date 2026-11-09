import { Knex } from "knex";

import {
  TSecretApprovalPolicies,
  TSecretApprovalRequests,
  TSecretApprovalRequestsReviewers,
  TSecretApprovalRequestsSecretsV2,
  TSecretApprovalRequestsSecretsV2Insert,
  TSecretFolders
} from "@app/db/schemas";
import { Actor, Event } from "@app/ee/services/audit-log/audit-log-types";
import { OrderByDirection, TProjectPermission } from "@app/lib/types";
import { TQueueServiceFactory } from "@app/queue";
import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import {
  TApprovalRequestApprovalsDALFactory,
  TApprovalRequestDALFactory,
  TApprovalRequestStepEligibleApproversDALFactory,
  TApprovalRequestStepsDALFactory
} from "@app/services/approval-policy/approval-request-dal";
import { ActorType } from "@app/services/auth/auth-type";
import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";
import { TFolderCommitServiceFactory } from "@app/services/folder-commit/folder-commit-service";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TMembershipUserDALFactory } from "@app/services/membership-user/membership-user-dal";
import { TMicrosoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import { TProjectMicrosoftTeamsConfigDALFactory } from "@app/services/microsoft-teams/project-microsoft-teams-config-dal";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { ResourceMetadataWithEncryptionDTO } from "@app/services/resource-metadata/resource-metadata-schema";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { SecretUpdateMode } from "@app/services/secret-v2-bridge/secret-v2-bridge-types";
import { TSecretVersionV2DALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "@app/services/secret-v2-bridge/secret-version-tag-dal";
import { TSecretValidationRuleServiceFactory } from "@app/services/secret-validation-rule/secret-validation-rule-service";
import { TSecretQueueFactory } from "@app/services/secret/secret-queue";
import { SecretOperations } from "@app/services/secret/secret-types";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TUserGroupMembershipDALFactory } from "../group/user-group-membership-dal";
import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TSecretChangePolicyServiceFactory } from "../secret-change-policy/secret-change-policy-service";
import { TSecretChangeRequestDALFactory } from "./secret-change-request-dal";
import { TFormattedSecretApprovalCommitV2Bridge } from "./secret-change-request-details-fns";
import { TMergedSecretsV2Bridge } from "./secret-change-request-merge-fns";

export enum RequestState {
  Open = "open",
  Closed = "close"
}

export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected"
}

export enum SecretApprovalRequestOrderBy {
  Environment = "environment",
  SecretPath = "secretPath",
  Author = "author",
  CreatedAt = "createdAt"
}

export type TApprovalCreateSecretV2Bridge = {
  secretKey: string;
  secretValue?: string;
  secretComment?: string;
  reminderNote?: string | null;
  reminderRepeatDays?: number | null;
  secretReminderRecipients?: string[] | null;
  skipMultilineEncoding?: boolean | null;
  metadata?: Record<string, string>;
  secretMetadata?: ResourceMetadataWithEncryptionDTO;
  tagIds?: string[];
};

export type TApprovalUpdateSecretV2Bridge = Partial<TApprovalCreateSecretV2Bridge> & {
  secretKey: string;
  newSecretName?: string;
  tagIds?: string[];
};

export type TGenerateSecretApprovalRequestV2BridgeDTO = {
  environment: string;
  secretPath: string;
  commitMessage?: string;
  policy: TSecretApprovalPolicies;
  updateMode?: SecretUpdateMode;
  folder?: Pick<TSecretFolders, "id" | "envId">;
  data: {
    [SecretOperations.Create]?: TApprovalCreateSecretV2Bridge[];
    [SecretOperations.Update]?: TApprovalUpdateSecretV2Bridge[];
    [SecretOperations.Delete]?: { secretKey: string }[];
  };
} & TProjectPermission;

export type TSecretApprovalRequestCommitV2 = Omit<
  TSecretApprovalRequestsSecretsV2Insert,
  "requestId" | "secretChangeId"
> & {
  tagIds?: string[];
};

export type TCreateSecretApprovalRequestV2BridgeDTO = {
  policy: Pick<TSecretApprovalPolicies, "id">;
  folderId: string;
  actor: ActorType;
  actorId: string;
  commits: TSecretApprovalRequestCommitV2[];
  isReplicated?: boolean;
  commitMessage?: string;
};

export type TCreateSecretApprovalSideEffectsDTO = {
  secretApprovalRequest: Pick<TSecretApprovalRequests, "id" | "policyId"> & { commits: { id: string }[] };
  environment: string;
  secretPath: string;
  secretKeys: string[];
  tx?: Knex;
} & Omit<TProjectPermission, "actorAuthMethod">;

export type TMergeSecretApprovalRequestDTO = {
  approvalId: string;
  bypassReason?: string;
  requireApprovals?: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TStatusChangeDTO = {
  approvalId: string;
  status: RequestState;
} & Omit<TProjectPermission, "projectId">;

export type TReviewRequestDTO = {
  approvalId: string;
  status: ApprovalStatus;
  comment?: string;
} & Omit<TProjectPermission, "projectId">;

export type TApprovalRequestCountDTO = TProjectPermission & { policyId?: string };

export type TListApprovalsDTO = {
  projectId: string;
  status?: RequestState;
  environment?: string;
  committer?: string;
  limit?: number;
  offset?: number;
  search?: string;
  orderBy?: SecretApprovalRequestOrderBy;
  orderDirection?: OrderByDirection;
} & TProjectPermission;

export type TSecretApprovalDetailsDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TSecretApprovalRequestListFilter = {
  projectId: string;
  userId?: string;
  status?: RequestState;
  environment?: string;
  committer?: string;
  limit?: number;
  offset?: number;
  search?: string;
  orderBy?: SecretApprovalRequestOrderBy;
  orderDirection?: OrderByDirection;
};

export enum InternalMetadataType {
  MoveSecret = "move-secret"
}

export type TInternalMetadataMoveSecret = {
  type: InternalMetadataType.MoveSecret;
  payload: {
    source: {
      environment: string;
      secretPath: string;
    };
  };
};

export type TInternalMetadata = TInternalMetadataMoveSecret;

// Everything a secret change request carries lives on secret_change_requests and its commits, so the
// generic request envelope holds no data of its own.
export type TSecretChangeRequestData = Record<string, never>;

export type TSecretChangeRequest = TSecretApprovalRequests & { commits: TSecretApprovalRequestsSecretsV2[] };

export type TSecretChangeRequestBase = Omit<TSecretChangeRequest, "commits" | "policyId"> & { policyId: string | null };

export type TSecretChangeRequestCommitInsert = Omit<
  TSecretApprovalRequestsSecretsV2Insert,
  "requestId" | "secretChangeId"
>;

export type TSecretChangeRequestReview = TSecretApprovalRequestsReviewers & { projectId: string };

export type TSecretChangeRequestMergeResult = {
  secrets: TMergedSecretsV2Bridge;
  approval: TSecretChangeRequest;
  projectId: string;
  secretMutationEvents: Event[];
  isMergedViaBypass: boolean;
  requestedByActor?: Actor;
};

export type TSecretChangeRequestStatusResult = Omit<TSecretChangeRequest, "commits"> & { projectId: string };

export type TApprovalRequestUser = {
  userId: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username: string;
};

export type TSecretChangeRequestPolicySummary = {
  id: string;
  name: string;
  approvals: number;
  secretPath: string | null;
  enforcementLevel: string;
  allowedSelfApprovals: boolean;
  deletedAt: Date | null;
};

export type TSecretChangeRequestCommitter = {
  committerUser: TApprovalRequestUser | null;
  committerIdentity: { identityId: string; name: string } | null;
};

export type TSecretChangeRequestDetails = TSecretChangeRequestBase &
  TSecretChangeRequestCommitter & {
    projectId: string;
    environment: string;
    secretPath: string;
    policy: TSecretChangeRequestPolicySummary & {
      approvers: (TApprovalRequestUser & { isOrgMembershipActive: boolean | null })[];
      bypassers: TApprovalRequestUser[];
    };
    statusChangedByUser?: TApprovalRequestUser;
    reviewers: (TApprovalRequestUser & {
      status: string;
      comment: string;
      createdAt: Date;
      isOrgMembershipActive: boolean | null;
    })[];
    commits: TFormattedSecretApprovalCommitV2Bridge[];
  };

export type TSecretChangeRequestListItem = TSecretChangeRequestBase &
  TSecretChangeRequestCommitter & {
    projectId: string;
    environment: string;
    environmentName: string | null;
    policy: TSecretChangeRequestPolicySummary & { approvers: { userId: string }[]; bypassers: { userId: string }[] };
    reviewers: { userId: string; status: string }[];
    commits: { op: string; secretId: string | null }[];
    approvers: { userId: string }[];
    bypassers: { userId: string }[];
  };

export type TSecretChangeRequestListResult = { approvals: TSecretChangeRequestListItem[]; totalCount: number };

export type TSecretChangeRequestCount = { open: number; closed: number };

export type TCountSecretChangeRequestsDTO = { projectId: string; userId?: string; policyId?: string };

export type TSecretChangeRequestMethods = {
  generateSecretApprovalRequestV2Bridge: (
    dto: TGenerateSecretApprovalRequestV2BridgeDTO & { trx?: Knex; skipPostProcessing?: boolean }
  ) => Promise<TSecretChangeRequest>;
  createSecretApprovalRequestV2Bridge: (
    dto: TCreateSecretApprovalRequestV2BridgeDTO,
    tx?: Knex
  ) => Promise<TSecretChangeRequest>;
  createSecretApprovalSideEffects: (dto: TCreateSecretApprovalSideEffectsDTO) => Promise<void>;
  mergeSecretApprovalRequest: (dto: TMergeSecretApprovalRequestDTO) => Promise<TSecretChangeRequestMergeResult>;
  reviewApproval: (dto: TReviewRequestDTO) => Promise<TSecretChangeRequestReview>;
  updateApprovalStatus: (dto: TStatusChangeDTO) => Promise<TSecretChangeRequestStatusResult>;
  getSecretApprovalDetails: (dto: TSecretApprovalDetailsDTO) => Promise<TSecretChangeRequestDetails>;
  listSecretChangeRequests: (filter: TSecretApprovalRequestListFilter) => Promise<TSecretChangeRequestListResult>;
  countSecretChangeRequests: (dto: TCountSecretChangeRequestsDTO) => Promise<TSecretChangeRequestCount>;
};

export type TSecretChangeRequestServiceFactoryDep = {
  approvalRequestDAL: Pick<
    TApprovalRequestDALFactory,
    | "find"
    | "findById"
    | "findByIdForUpdate"
    | "findStepsByRequestId"
    | "findStepsByRequestIds"
    | "create"
    | "updateById"
    | "transaction"
  >;
  approvalRequestStepsDAL: Pick<TApprovalRequestStepsDALFactory, "create">;
  approvalRequestStepEligibleApproversDAL: Pick<TApprovalRequestStepEligibleApproversDALFactory, "create">;
  approvalRequestApprovalsDAL: Pick<TApprovalRequestApprovalsDALFactory, "findOne" | "create" | "updateById">;
  approvalPolicyDAL: Pick<
    TApprovalPolicyDALFactory,
    "findByIdForShare" | "findStepsByPolicyId" | "findBypassersByPolicyIds"
  >;
  secretChangeRequestDAL: Pick<
    TSecretChangeRequestDALFactory,
    | "create"
    | "find"
    | "findOne"
    | "updateById"
    | "findByProjectId"
    | "countByProjectId"
    | "insertV2Bridge"
    | "insertApprovalSecretV2Tags"
    | "updateV2ById"
    | "findBySecretChangeIdBridgeSecretV2"
    | "findCommitsBySecretChangeIds"
  >;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "find">;
  secretChangePolicyService: Pick<TSecretChangePolicyServiceFactory, "findSecretChangePolicyById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "findGroupMembershipsByUserIdInOrg" | "find">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findSecretPathByFolderIds">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findProjectWithOrg">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  secretV2BridgeDAL: Pick<
    TSecretV2BridgeDALFactory,
    | "insertMany"
    | "upsertSecretReferences"
    | "findBySecretKeys"
    | "bulkUpdate"
    | "deleteMany"
    | "find"
    | "invalidateSecretCacheByProjectId"
    | "updateById"
    | "findReferencedSecretReferencesBySecretKey"
    | "updateSecretReferenceSecretKey"
    | "updateSecretReferenceEnvAndPath"
    | "findOne"
  >;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "findLatestVersionMany" | "insertMany">;
  secretVersionTagV2BridgeDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  secretTagDAL: Pick<TSecretTagDALFactory, "findManyTagsById" | "saveTagsToSecretV2" | "deleteTagsToSecretV2" | "find">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  eventEmitter: TEventEmitter;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets" | "removeSecretReminder">;
  secretValidationRuleService: Pick<TSecretValidationRuleServiceFactory, "validateSecrets">;
  userDAL: Pick<TUserDALFactory, "findById" | "find" | "findOne">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  projectMicrosoftTeamsConfigDAL: Pick<TProjectMicrosoftTeamsConfigDALFactory, "getIntegrationDetailsByProject">;
  microsoftTeamsService: Pick<TMicrosoftTeamsServiceFactory, "sendNotification">;
  smtpService: Pick<TSmtpService, "sendMail">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  queueService: Pick<TQueueServiceFactory, "queue">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
};
