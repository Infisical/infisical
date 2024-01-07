import { Knex } from "knex";

import {
  TableName,
  TApiKeys,
  TApiKeysInsert,
  TApiKeysUpdate,
  TAuthTokens,
  TAuthTokenSessions,
  TAuthTokenSessionsInsert,
  TAuthTokenSessionsUpdate,
  TAuthTokensUpdate,
  TBackupPrivateKey,
  TBackupPrivateKeyInsert,
  TBackupPrivateKeyUpdate,
  TIdentities,
  TIdentitiesInsert,
  TIdentitiesUpdate,
  TIdentityAccessTokens,
  TIdentityAccessTokensInsert,
  TIdentityAccessTokensUpdate,
  TIdentityOrgMemberships,
  TIdentityOrgMembershipsInsert,
  TIdentityOrgMembershipsUpdate,
  TIdentityProjectMemberships,
  TIdentityProjectMembershipsInsert,
  TIdentityProjectMembershipsUpdate,
  TIdentityUaClientSecrets,
  TIdentityUaClientSecretsInsert,
  TIdentityUaClientSecretsUpdate,
  TIdentityUniversalAuths,
  TIdentityUniversalAuthsInsert,
  TIdentityUniversalAuthsUpdate,
  TIncidentContacts,
  TIncidentContactsInsert,
  TIncidentContactsUpdate,
  TIntegrationAuths,
  TIntegrationAuthsInsert,
  TIntegrationAuthsUpdate,
  TIntegrations,
  TIntegrationsInsert,
  TIntegrationsUpdate,
  TOrganizations,
  TOrganizationsInsert,
  TOrganizationsUpdate,
  TOrgMemberships,
  TOrgMembershipsInsert,
  TOrgMembershipsUpdate,
  TOrgRoles,
  TOrgRolesInsert,
  TOrgRolesUpdate,
  TProjectBots,
  TProjectBotsInsert,
  TProjectBotsUpdate,
  TProjectEnvironments,
  TProjectEnvironmentsInsert,
  TProjectEnvironmentsUpdate,
  TProjectKeys,
  TProjectKeysInsert,
  TProjectKeysUpdate,
  TProjectMemberships,
  TProjectMembershipsInsert,
  TProjectMembershipsUpdate,
  TProjectRoles,
  TProjectRolesInsert,
  TProjectRolesUpdate,
  TProjects,
  TProjectsInsert,
  TProjectsUpdate,
  TSapApprovers,
  TSapApproversInsert,
  TSapApproversUpdate,
  TSaRequestSecrets,
  TSaRequestSecretsInsert,
  TSaRequestSecretsUpdate,
  TSaRequestSecretTags,
  TSaRequestSecretTagsInsert,
  TSaRequestSecretTagsUpdate,
  TSarReviewers,
  TSarReviewersInsert,
  TSarReviewersUpdate,
  TSecretApprovalPolicies,
  TSecretApprovalPoliciesInsert,
  TSecretApprovalPoliciesUpdate,
  TSecretApprovalRequests,
  TSecretApprovalRequestsInsert,
  TSecretApprovalRequestsUpdate,
  TSecretBlindIndexes,
  TSecretBlindIndexesInsert,
  TSecretBlindIndexesUpdate,
  TSecretFolders,
  TSecretFoldersInsert,
  TSecretFoldersUpdate,
  TSecretFolderVersions,
  TSecretFolderVersionsInsert,
  TSecretFolderVersionsUpdate,
  TSecretImports,
  TSecretImportsInsert,
  TSecretImportsUpdate,
  TSecretRotationOutputs,
  TSecretRotationOutputsInsert,
  TSecretRotationOutputsUpdate,
  TSecretRotations,
  TSecretRotationsInsert,
  TSecretRotationsUpdate,
  TSecrets,
  TSecretsInsert,
  TSecretSnapshotFolders,
  TSecretSnapshotFoldersInsert,
  TSecretSnapshotFoldersUpdate,
  TSecretSnapshots,
  TSecretSnapshotSecrets,
  TSecretSnapshotSecretsInsert,
  TSecretSnapshotSecretsUpdate,
  TSecretSnapshotsInsert,
  TSecretSnapshotsUpdate,
  TSecretsUpdate,
  TSecretTagJunction,
  TSecretTagJunctionInsert,
  TSecretTagJunctionUpdate,
  TSecretTags,
  TSecretTagsInsert,
  TSecretTagsUpdate,
  TSecretVersions,
  TSecretVersionsInsert,
  TSecretVersionsUpdate,
  TServiceTokens,
  TServiceTokensInsert,
  TServiceTokensUpdate,
  TSuperAdmin,
  TSuperAdminInsert,
  TSuperAdminUpdate,
  TUserActions,
  TUserActionsInsert,
  TUserActionsUpdate,
  TUserEncryptionKeys,
  TUserEncryptionKeysInsert,
  TUserEncryptionKeysUpdate,
  TUsers,
  TUsersInsert,
  TUsersUpdate,
  TWebhooks,
  TWebhooksInsert,
  TWebhooksUpdate
} from "@app/db/schemas";

declare module "knex/types/tables" {
  interface Tables {
    [TableName.Users]: Knex.CompositeTableType<TUsers, TUsersInsert, TUsersUpdate>;
    [TableName.UserEncryptionKey]: Knex.CompositeTableType<
      TUserEncryptionKeys,
      TUserEncryptionKeysInsert,
      TUserEncryptionKeysUpdate
    >;
    [TableName.AuthTokens]: Knex.CompositeTableType<
      TAuthTokens,
      TAuthTokensInsert,
      TAuthTokensUpdate
    >;
    [TableName.AuthTokenSession]: Knex.CompositeTableType<
      TAuthTokenSessions,
      TAuthTokenSessionsInsert,
      TAuthTokenSessionsUpdate
    >;
    [TableName.BackupPrivateKey]: Knex.CompositeTableType<
      TBackupPrivateKey,
      TBackupPrivateKeyInsert,
      TBackupPrivateKeyUpdate
    >;
    [TableName.Organization]: Knex.CompositeTableType<
      TOrganizations,
      TOrganizationsInsert,
      TOrganizationsUpdate
    >;
    [TableName.OrgMembership]: Knex.CompositeTableType<
      TOrgMemberships,
      TOrgMembershipsInsert,
      TOrgMembershipsUpdate
    >;
    [TableName.OrgRoles]: Knex.CompositeTableType<TOrgRoles, TOrgRolesInsert, TOrgRolesUpdate>;
    [TableName.IncidentContact]: Knex.CompositeTableType<
      TIncidentContacts,
      TIncidentContactsInsert,
      TIncidentContactsUpdate
    >;
    [TableName.UserAction]: Knex.CompositeTableType<
      TUserActions,
      TUserActionsInsert,
      TUserActionsUpdate
    >;
    [TableName.SuperAdmin]: Knex.CompositeTableType<
      TSuperAdmin,
      TSuperAdminInsert,
      TSuperAdminUpdate
    >;
    [TableName.ApiKey]: Knex.CompositeTableType<TApiKeys, TApiKeysInsert, TApiKeysUpdate>;
    [TableName.Project]: Knex.CompositeTableType<TProjects, TProjectsInsert, TProjectsUpdate>;
    [TableName.ProjectMembership]: Knex.CompositeTableType<
      TProjectMemberships,
      TProjectMembershipsInsert,
      TProjectMembershipsUpdate
    >;
    [TableName.Environment]: Knex.CompositeTableType<
      TProjectEnvironments,
      TProjectEnvironmentsInsert,
      TProjectEnvironmentsUpdate
    >;
    [TableName.ProjectBot]: Knex.CompositeTableType<
      TProjectBots,
      TProjectBotsInsert,
      TProjectBotsUpdate
    >;
    [TableName.ProjectRoles]: Knex.CompositeTableType<
      TProjectRoles,
      TProjectRolesInsert,
      TProjectRolesUpdate
    >;
    [TableName.ProjectKeys]: Knex.CompositeTableType<
      TProjectKeys,
      TProjectKeysInsert,
      TProjectKeysUpdate
    >;
    [TableName.Secret]: Knex.CompositeTableType<TSecrets, TSecretsInsert, TSecretsUpdate>;
    [TableName.SecretBlindIndex]: Knex.CompositeTableType<
      TSecretBlindIndexes,
      TSecretBlindIndexesInsert,
      TSecretBlindIndexesUpdate
    >;
    [TableName.SecretVersion]: Knex.CompositeTableType<
      TSecretVersions,
      TSecretVersionsInsert,
      TSecretVersionsUpdate
    >;
    [TableName.SecretFolder]: Knex.CompositeTableType<
      TSecretFolders,
      TSecretFoldersInsert,
      TSecretFoldersUpdate
    >;
    [TableName.SecretFolderVersion]: Knex.CompositeTableType<
      TSecretFolderVersions,
      TSecretFolderVersionsInsert,
      TSecretFolderVersionsUpdate
    >;
    [TableName.SecretTag]: Knex.CompositeTableType<
      TSecretTags,
      TSecretTagsInsert,
      TSecretTagsUpdate
    >;
    [TableName.SecretImport]: Knex.CompositeTableType<
      TSecretImports,
      TSecretImportsInsert,
      TSecretImportsUpdate
    >;
    [TableName.SecretSnapshot]: Knex.CompositeTableType<
      TSecretSnapshots,
      TSecretSnapshotsInsert,
      TSecretSnapshotsUpdate
    >;
    [TableName.Integration]: Knex.CompositeTableType<
      TIntegrations,
      TIntegrationsInsert,
      TIntegrationsUpdate
    >;
    [TableName.Webhook]: Knex.CompositeTableType<TWebhooks, TWebhooksInsert, TWebhooksUpdate>;
    [TableName.ServiceToken]: Knex.CompositeTableType<
      TServiceTokens,
      TServiceTokensInsert,
      TServiceTokensUpdate
    >;
    [TableName.IntegrationAuth]: Knex.CompositeTableType<
      TIntegrationAuths,
      TIntegrationAuthsInsert,
      TIntegrationAuthsUpdate
    >;
    [TableName.Identity]: Knex.CompositeTableType<
      TIdentities,
      TIdentitiesInsert,
      TIdentitiesUpdate
    >;
    [TableName.IdentityUniversalAuth]: Knex.CompositeTableType<
      TIdentityUniversalAuths,
      TIdentityUniversalAuthsInsert,
      TIdentityUniversalAuthsUpdate
    >;
    [TableName.IdentityUaClientSecret]: Knex.CompositeTableType<
      TIdentityUaClientSecrets,
      TIdentityUaClientSecretsInsert,
      TIdentityUaClientSecretsUpdate
    >;
    [TableName.IdentityAccessToken]: Knex.CompositeTableType<
      TIdentityAccessTokens,
      TIdentityAccessTokensInsert,
      TIdentityAccessTokensUpdate
    >;
    [TableName.IdentityOrgMembership]: Knex.CompositeTableType<
      TIdentityOrgMemberships,
      TIdentityOrgMembershipsInsert,
      TIdentityOrgMembershipsUpdate
    >;
    [TableName.IdentityProjectMembership]: Knex.CompositeTableType<
      TIdentityProjectMemberships,
      TIdentityProjectMembershipsInsert,
      TIdentityProjectMembershipsUpdate
    >;
    [TableName.SecretApprovalPolicy]: Knex.CompositeTableType<
      TSecretApprovalPolicies,
      TSecretApprovalPoliciesInsert,
      TSecretApprovalPoliciesUpdate
    >;
    [TableName.SapApprover]: Knex.CompositeTableType<
      TSapApprovers,
      TSapApproversInsert,
      TSapApproversUpdate
    >;
    [TableName.SecretApprovalRequest]: Knex.CompositeTableType<
      TSecretApprovalRequests,
      TSecretApprovalRequestsInsert,
      TSecretApprovalRequestsUpdate
    >;
    [TableName.SarReviewer]: Knex.CompositeTableType<
      TSarReviewers,
      TSarReviewersInsert,
      TSarReviewersUpdate
    >;
    [TableName.SarSecret]: Knex.CompositeTableType<
      TSaRequestSecrets,
      TSaRequestSecretsInsert,
      TSaRequestSecretsUpdate
    >;
    [TableName.SarSecretTag]: Knex.CompositeTableType<
      TSaRequestSecretTags,
      TSaRequestSecretTagsInsert,
      TSaRequestSecretTagsUpdate
    >;
    [TableName.SecretRotation]: Knex.CompositeTableType<
      TSecretRotations,
      TSecretRotationsInsert,
      TSecretRotationsUpdate
    >;
    [TableName.SecretRotationOutput]: Knex.CompositeTableType<
      TSecretRotationOutputs,
      TSecretRotationOutputsInsert,
      TSecretRotationOutputsUpdate
    >;
    [TableName.Snapshot]: Knex.CompositeTableType<
      TSecretSnapshots,
      TSecretSnapshotsInsert,
      TSecretSnapshotsUpdate
    >;
    [TableName.SnapshotSecret]: Knex.CompositeTableType<
      TSecretSnapshotSecrets,
      TSecretSnapshotSecretsInsert,
      TSecretSnapshotSecretsUpdate
    >;
    [TableName.SnapshotFolder]: Knex.CompositeTableType<
      TSecretSnapshotFolders,
      TSecretSnapshotFoldersInsert,
      TSecretSnapshotFoldersUpdate
    >;
    // Junction tables
    [TableName.JnSecretTag]: Knex.CompositeTableType<
      TSecretTagJunction,
      TSecretTagJunctionInsert,
      TSecretTagJunctionUpdate
    >;
  }
}
