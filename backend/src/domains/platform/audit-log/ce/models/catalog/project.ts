import { ProjectType } from "@app/db/schemas";
import { ActorType } from "@app/lib/auth/actor-types";

import { EventType } from "../event-type";
import type { TAuditLogOrgAccessRemovalCause, TAuditLogWorkflowIntegration } from "./shared";

export interface CreateEnvironmentEvent {
  type: EventType.CREATE_ENVIRONMENT;
  metadata: {
    name: string;
    slug: string;
  };
}

export interface GetEnvironmentEvent {
  type: EventType.GET_ENVIRONMENT;
  metadata: {
    id: string;
  };
}

export interface UpdateEnvironmentEvent {
  type: EventType.UPDATE_ENVIRONMENT;
  metadata: {
    oldName: string;
    newName: string;
    oldSlug: string;
    newSlug: string;
    oldPos: number;
    newPos: number;
  };
}

export interface DeleteEnvironmentEvent {
  type: EventType.DELETE_ENVIRONMENT;
  metadata: {
    name: string;
    slug: string;
    hardDelete: boolean;
  };
}

export interface RestoreEnvironmentEvent {
  type: EventType.RESTORE_ENVIRONMENT;
  metadata: {
    name: string;
    slug: string;
  };
}

export interface AddProjectMemberEvent {
  type: EventType.ADD_PROJECT_MEMBER;
  metadata: {
    userId: string;
    email: string;
  };
}

export interface AddBatchProjectMemberEvent {
  type: EventType.ADD_BATCH_PROJECT_MEMBER;
  metadata: {
    members: Array<{
      userId: string;
      email: string;
    }>;
  };
}

export interface RemoveProjectMemberEvent {
  type: EventType.REMOVE_PROJECT_MEMBER;
  metadata: {
    userId: string;
    email: string;
  };
}

export interface GetProjectMemberPermissionAuditEvent {
  type: EventType.GET_PROJECT_MEMBER_PERMISSION_AUDIT;
  metadata: {
    targetUserId: string;
    membershipId: string;
  };
}

export interface CreateFolderEvent {
  type: EventType.CREATE_FOLDER;
  metadata: {
    environment: string;
    folderId: string;
    folderName: string;
    folderPath: string;
    description?: string;
  };
}

export interface UpdateFolderEvent {
  type: EventType.UPDATE_FOLDER;
  metadata: {
    environment: string;
    folderId: string;
    oldFolderName?: string;
    newFolderName: string;
    newFolderDescription?: string;
    folderPath: string;
  };
}

export interface DeleteFolderEvent {
  type: EventType.DELETE_FOLDER;
  metadata: {
    environment: string;
    folderId: string;
    folderName: string;
    folderPath: string;
  };
}

export interface MoveFolderEvent {
  type: EventType.MOVE_FOLDER;
  metadata: {
    folderId: string;
    sourceEnvironment: string;
    sourcePath: string;
    destinationEnvironment: string;
    destinationPath: string;
  };
}

export interface CreateWebhookEvent {
  type: EventType.CREATE_WEBHOOK;
  metadata: {
    webhookId: string;
    environment: string;
    secretPath: string;
    isDisabled: boolean;
    eventsFilter?: {
      eventName: string;
    }[];
  };
}

export interface UpdateWebhookStatusEvent {
  type: EventType.UPDATE_WEBHOOK_STATUS;
  metadata: {
    webhookId: string;
    environment: string;
    secretPath: string;
    isDisabled: boolean;
    eventsFilter?: {
      eventName: string;
    }[];
  };
}

export interface DeleteWebhookEvent {
  type: EventType.DELETE_WEBHOOK;
  metadata: {
    webhookId: string;
    environment: string;
    secretPath: string;
    isDisabled: boolean;
  };
}

export interface WebhookTriggeredEvent {
  type: EventType.WEBHOOK_TRIGGERED;
  metadata: {
    webhookId: string;
    status: string;
  } & TAuditLogWebhookPayload;
}

export interface UpdateUserRole {
  type: EventType.UPDATE_USER_PROJECT_ROLE;
  metadata: {
    userId: string;
    email: string;
    oldRole: string;
    newRole: string;
  };
}

export interface UpdateUserDeniedPermissions {
  type: EventType.UPDATE_USER_PROJECT_DENIED_PERMISSIONS;
  metadata: {
    userId: string;
    email: string;
    deniedPermissions: {
      environmentSlug: string;
      ability: string;
    }[];
  };
}

export interface AddProjectGroupEvent {
  type: EventType.ADD_PROJECT_GROUP;
  metadata: {
    groupId: string;
    roles: string[];
  };
}

export interface UpdateProjectGroupEvent {
  type: EventType.UPDATE_PROJECT_GROUP;
  metadata: {
    groupId: string;
    roles: string[];
  };
}

export interface RemoveProjectGroupEvent {
  type: EventType.REMOVE_PROJECT_GROUP;
  metadata: {
    groupId: string;
  };
}

// Written by the reconcile consumer and by direct org removals, so the actor is the platform and `reason` /
// `groupId` say why.
// `resources` are resource-level grants (PAM, Agent Vault, PKI apps, signers), including ones in projects
// only reached through a group.
export interface RevokeOrgProjectAccessEvent {
  type: EventType.REVOKE_ORG_PROJECT_ACCESS;
  metadata: {
    userId?: string;
    identityId?: string;
    projectIds: string[];
    resources: { projectId: string; resourceType: string; resourceId: string }[];
    reason: TAuditLogOrgAccessRemovalCause;
    groupId?: string;
  };
}

export interface AddGroupToProjectEvent {
  type: EventType.ADD_GROUP_TO_PROJECT;
  metadata: {
    groupId: string;
    groupName: string;
    roles: Array<{
      role: string;
      isTemporary: boolean;
      temporaryMode?: string;
      temporaryRange?: string;
      temporaryAccessStartTime?: string;
    }>;
  };
}

export interface UpdateGroupProjectMembershipEvent {
  type: EventType.UPDATE_GROUP_PROJECT_MEMBERSHIP;
  metadata: {
    groupId: string;
    groupName: string;
    roles: Array<{
      role: string;
      isTemporary: boolean;
      temporaryMode?: string;
      temporaryRange?: string;
      temporaryAccessStartTime?: string;
    }>;
  };
}

export interface RemoveGroupFromProjectEvent {
  type: EventType.REMOVE_GROUP_FROM_PROJECT;
  metadata: {
    groupId: string;
    groupName: string;
  };
}

export interface OrgAdminAccessProjectEvent {
  type: EventType.ORG_ADMIN_ACCESS_PROJECT;
  metadata: {
    userId: string;
    username: string;
    email: string;
    projectId: string;
  }; // no metadata yet
}

export interface UpdateProjectWorkflowIntegrationConfig {
  type: EventType.UPDATE_PROJECT_WORKFLOW_INTEGRATION_CONFIG;
  metadata: {
    id: string;
    integrationId: string;
    integration: TAuditLogWorkflowIntegration;
    isAccessRequestNotificationEnabled: boolean;
    accessRequestChannels?: string | { teamId: string; channelIds: string[] };
    isSecretRequestNotificationEnabled: boolean;
    secretRequestChannels?: string | { teamId: string; channelIds: string[] };
  };
}

export interface GetProjectWorkflowIntegrationConfig {
  type: EventType.GET_PROJECT_WORKFLOW_INTEGRATION_CONFIG;
  metadata: {
    id: string;
    integration: TAuditLogWorkflowIntegration;
  };
}

export interface GetProjectTemplatesEvent {
  type: EventType.GET_PROJECT_TEMPLATES;
  metadata: {
    count: number;
    templateIds: string[];
  };
}

export interface GetProjectTemplateEvent {
  type: EventType.GET_PROJECT_TEMPLATE;
  metadata: {
    templateId: string;
  };
}

export interface CreateProjectTemplateEvent {
  type: EventType.CREATE_PROJECT_TEMPLATE;
  metadata: TAuditLogProjectTemplate;
}

export interface UpdateProjectTemplateEvent {
  type: EventType.UPDATE_PROJECT_TEMPLATE;
  metadata: Partial<TAuditLogProjectTemplate> & { templateId: string };
}

export interface DeleteProjectTemplateEvent {
  type: EventType.DELETE_PROJECT_TEMPLATE;
  metadata: {
    templateId: string;
  };
}

export interface GetProjectPitCommitsEvent {
  type: EventType.GET_PROJECT_PIT_COMMITS;
  metadata: {
    commitCount: string;
    environment: string;
    path: string;
    offset: string;
    limit: string;
    search?: string;
    sort: string;
    filteredActorId?: string;
    filteredActorName?: string;
    filteredActorType?: string;
  };
}

export interface GetProjectPitCommitAuthorsEvent {
  type: EventType.GET_PROJECT_PIT_COMMIT_AUTHORS;
  metadata: {
    environment: string;
    path: string;
    authorCount: string;
  };
}

export interface GetProjectPitCommitChangesEvent {
  type: EventType.GET_PROJECT_PIT_COMMIT_CHANGES;
  metadata: {
    changesCount: string;
    commitId: string;
  };
}

export interface GetProjectPitCommitCountEvent {
  type: EventType.GET_PROJECT_PIT_COMMIT_COUNT;
  metadata: {
    environment: string;
    path: string;
    commitCount: string;
  };
}

export interface PitRollbackCommitEvent {
  type: EventType.PIT_ROLLBACK_COMMIT;
  metadata: {
    targetCommitId: string;
    folderId: string;
    deepRollback: boolean;
    message: string;
    totalChanges: string;
    environment: string;
  };
}

export interface PitRevertCommitEvent {
  type: EventType.PIT_REVERT_COMMIT;
  metadata: {
    commitId: string;
    revertCommitId?: string;
    changesReverted?: string;
  };
}

export interface PitGetFolderStateEvent {
  type: EventType.PIT_GET_FOLDER_STATE;
  metadata: {
    commitId: string;
    folderId: string;
    resourceCount: string;
  };
}

export interface PitCompareFolderStatesEvent {
  type: EventType.PIT_COMPARE_FOLDER_STATES;
  metadata: {
    targetCommitId: string;
    folderId: string;
    deepRollback: boolean;
    diffsCount: string;
    environment: string;
    folderPath: string;
  };
}

export interface PitProcessNewCommitRawEvent {
  type: EventType.PIT_PROCESS_NEW_COMMIT_RAW;
  metadata: {
    projectId: string;
    environment: string;
    secretPath: string;
    message: string;
    approvalId?: string;
    approvalSlug?: string;
    commitId?: string;
  };
}

export interface ProjectCreateEvent {
  type: EventType.CREATE_PROJECT;
  metadata: {
    name: string;
    slug?: string;
    type: ProjectType;
  };
}

export interface ProjectUpdateEvent {
  type: EventType.UPDATE_PROJECT;
  metadata: {
    name?: string;
    description?: string;
    autoCapitalization?: boolean;
    hasDeleteProtection?: boolean;
    slug?: string;
    secretSharing?: boolean;
    pitVersionLimit?: number;
    auditLogsRetentionDays?: number;
  };
}

export interface ProjectDeleteEvent {
  type: EventType.DELETE_PROJECT;
  metadata: {
    id: string;
    name: string;
    // true: actor soft-deleted the project (marked for deletion).
    // false: the async cleanup worker hard-deleted an expired soft-deleted project.
    softDelete?: boolean;
    // true: deleted without a restore window (Delete Now, or a project type that has none).
    hardDelete?: boolean;
    deleteAfter?: Date | null;
  };
}

export interface ProjectRestoreEvent {
  type: EventType.RESTORE_PROJECT;
  metadata: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface ViewSecretManagementInsightsCalendarEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_CALENDAR;
  metadata: {
    projectId: string;
    month: number;
    year: number;
  };
}

export interface ViewSecretManagementInsightsAccessVolumeEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_ACCESS_VOLUME;
  metadata: {
    projectId: string;
  };
}

export interface ViewSecretManagementInsightsUnusedAccessEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_UNUSED_ACCESS;
  metadata: {
    projectId: string;
    // Set when one principal's unused secrets were viewed rather than the project list.
    principalType?: string;
    principalId?: string;
    principalName?: string;
  };
}

export interface ViewSecretManagementInsightsOrgAuthMethodDistributionEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_ORG_AUTH_METHOD_DISTRIBUTION;
  metadata: {
    totalFetches: number;
  };
}

export interface ViewSecretManagementInsightsAccessLocationsEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_ACCESS_LOCATIONS;
  metadata: {
    projectId: string;
    days: number;
  };
}

export interface ViewInsightsAuthMethodsEvent {
  type: EventType.VIEW_INSIGHTS_AUTH_METHODS;
  metadata: {
    projectId: string;
    days: number;
  };
}

export interface ViewSecretManagementInsightsSummaryEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_SUMMARY;
  metadata: {
    projectId: string;
  };
}

export interface ViewInsightsOrgSecretsDuplicationEvent {
  type: EventType.VIEW_INSIGHTS_ORG_SECRETS_DUPLICATION;
  metadata: {
    groupCount: number;
  };
}

export interface ViewInsightsSecretsDuplicationEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_DUPLICATION;
  metadata: {
    projectId: string;
  };
}

export interface ViewSecretManagementInsightsCountsEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_COUNTS;
  metadata: {
    projectId: string;
  };
}

export interface ViewSecretManagementInsightsUsageEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_USAGE;
  metadata: {
    activeLeases: number;
    users: number;
    identities: number;
  };
}

export interface ViewSecretManagementInsightsProjectWarningsEvent {
  type: EventType.VIEW_INSIGHTS_SECRETS_MANAGEMENT_PROJECT_WARNINGS;
  metadata: {
    totalProjects: number;
    projectsWithIssues: number;
    offset: number;
    limit: number;
  };
}

export interface ProjectRoleCreateEvent {
  type: EventType.CREATE_PROJECT_ROLE;
  metadata: {
    roleId: string;
    slug: string;
    name: string;
    description?: string | null;
    permissions: string;
  };
}

export interface ProjectRoleUpdateEvent {
  type: EventType.UPDATE_PROJECT_ROLE;
  metadata: {
    roleId: string;
    slug?: string;
    name?: string;
    description?: string | null;
    permissions?: string;
  };
}

export interface ProjectRoleDeleteEvent {
  type: EventType.DELETE_PROJECT_ROLE;
  metadata: {
    roleId: string;
    slug: string;
    name: string;
  };
}

export interface ProjectRoleListEvent {
  type: EventType.LIST_PROJECT_ROLES;
  metadata: {
    projectId: string;
  };
}

export interface ProjectRoleGetEvent {
  type: EventType.GET_PROJECT_ROLE;
  metadata: {
    projectId: string;
    slug: string;
  };
}

export type TAuditLogWebhookActor = {
  type: ActorType.USER | ActorType.IDENTITY;
  id: string;
  name: string;
  email: string | null;
};

export type TAuditLogWebhookPolicy = { id: string; name: string; enforcementLevel: string };

export type TAuditLogWebhookPayload =
  | {
      type: "secrets.modified";
      payload: {
        projectName?: string;
        projectId: string;
        environment: string;
        environmentName: string;
        secretPath?: string;
        type?: string | null;
        changedBy?: string;
        changedByActorType?: ActorType;
      };
    }
  | {
      type: "secrets.rotation-failed";
      payload: {
        rotationName?: string;
        projectName?: string;
        projectId: string;
        environment: string;
        environmentName: string;
        secretPath?: string;
        triggeredManually?: boolean;
        errorMessage?: string;
        type?: string | null;
      };
    }
  | {
      type: "honey-token.triggered";
      payload: {
        honeyTokenName: string;
        projectName?: string;
        projectId: string;
        environment: string;
        environmentName: string;
        secretPath?: string;
        type?: string | null;
        eventName: string;
        sourceIp?: string;
        awsRegion: string;
      };
    }
  | {
      type: "secrets.change-request.modified";
      payload: {
        projectId: string;
        projectName?: string;
        environment: string;
        environmentName?: string;
        secretPath?: string;
        type?: string | null;
        action: "created" | "reviewed" | "closed" | "reopened" | "merged";
        request: {
          id: string;
          slug: string;
          url: string;
          status: string;
          hasMerged: boolean;
          isBypassed: boolean;
          policy: TAuditLogWebhookPolicy;
          requestedBy: TAuditLogWebhookActor | null;
          createdAt: string;
          updatedAt: string;
        };
      };
    }
  | {
      type: "secrets.access-request.modified";
      payload: {
        projectId: string;
        projectName?: string;
        environment: string;
        environmentName?: string;
        secretPath?: string;
        type?: string | null;
        action: "created" | "edited" | "reviewed" | "revoked";
        request: {
          id: string;
          url: string;
          status: string;
          isBypassed: boolean;
          policy: TAuditLogWebhookPolicy & { hasSequencedApprovers: boolean };
          requestedAccess: {
            isTemporary: boolean;
            temporaryRange: string | null;
            permissions: { subject: string; actions: string[] }[];
          };
          requestedBy: TAuditLogWebhookActor | null;
          expiresAt: string | null;
          approvedAt: string | null;
          revokedAt: string | null;
          createdAt: string;
          updatedAt: string;
        };
      };
    }
  | {
      type: "test";
      payload: {
        projectName?: string;
        projectId: string;
        environment: string;
        environmentName: string;
        secretPath?: string;
        type?: string | null;
      };
    };

export type TAuditLogProjectTemplate = {
  name: string;
  type: ProjectType;
  description?: string;
  roles: { slug: string; name: string; permissions: Record<string, unknown>[] }[];
  environments?: { name: string; slug: string; position: number }[] | null;
  users?: { username: string; roles: string[] }[] | null;
  groups?: { groupSlug: string; roles: string[] }[] | null;
  identities?: { identityId: string; roles: string[] }[] | null;
  projectManagedIdentities?: { name: string; roles: string[] }[] | null;
};

export type TProjectAuditLogEvent =
  | CreateEnvironmentEvent
  | GetEnvironmentEvent
  | UpdateEnvironmentEvent
  | DeleteEnvironmentEvent
  | RestoreEnvironmentEvent
  | AddProjectMemberEvent
  | AddBatchProjectMemberEvent
  | RemoveProjectMemberEvent
  | GetProjectMemberPermissionAuditEvent
  | CreateFolderEvent
  | UpdateFolderEvent
  | DeleteFolderEvent
  | MoveFolderEvent
  | CreateWebhookEvent
  | UpdateWebhookStatusEvent
  | DeleteWebhookEvent
  | WebhookTriggeredEvent
  | UpdateUserRole
  | UpdateUserDeniedPermissions
  | AddProjectGroupEvent
  | UpdateProjectGroupEvent
  | RemoveProjectGroupEvent
  | RevokeOrgProjectAccessEvent
  | AddGroupToProjectEvent
  | UpdateGroupProjectMembershipEvent
  | RemoveGroupFromProjectEvent
  | OrgAdminAccessProjectEvent
  | UpdateProjectWorkflowIntegrationConfig
  | GetProjectWorkflowIntegrationConfig
  | GetProjectTemplatesEvent
  | GetProjectTemplateEvent
  | CreateProjectTemplateEvent
  | UpdateProjectTemplateEvent
  | DeleteProjectTemplateEvent
  | GetProjectPitCommitsEvent
  | GetProjectPitCommitAuthorsEvent
  | GetProjectPitCommitChangesEvent
  | GetProjectPitCommitCountEvent
  | PitRollbackCommitEvent
  | PitRevertCommitEvent
  | PitGetFolderStateEvent
  | PitCompareFolderStatesEvent
  | PitProcessNewCommitRawEvent
  | ProjectCreateEvent
  | ProjectUpdateEvent
  | ProjectDeleteEvent
  | ProjectRestoreEvent
  | ViewSecretManagementInsightsCalendarEvent
  | ViewSecretManagementInsightsAccessVolumeEvent
  | ViewSecretManagementInsightsUnusedAccessEvent
  | ViewSecretManagementInsightsOrgAuthMethodDistributionEvent
  | ViewSecretManagementInsightsAccessLocationsEvent
  | ViewInsightsAuthMethodsEvent
  | ViewSecretManagementInsightsSummaryEvent
  | ViewInsightsOrgSecretsDuplicationEvent
  | ViewInsightsSecretsDuplicationEvent
  | ViewSecretManagementInsightsCountsEvent
  | ViewSecretManagementInsightsUsageEvent
  | ViewSecretManagementInsightsProjectWarningsEvent
  | ProjectRoleCreateEvent
  | ProjectRoleUpdateEvent
  | ProjectRoleDeleteEvent
  | ProjectRoleListEvent
  | ProjectRoleGetEvent;
