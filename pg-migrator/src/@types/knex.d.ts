import { Knex } from "knex";

import {
  TableName,
  TApiKeys,
  TApiKeysInsert,
  TApiKeysUpdate,
  TAuditLogs,
  TAuditLogsInsert,
  TAuditLogsUpdate,
  TAuthTokens,
  TAuthTokenSessions,
  TAuthTokenSessionsInsert,
  TAuthTokenSessionsUpdate,
  TAuthTokensInsert,
  TAuthTokensUpdate,
  TBackupPrivateKey,
  TBackupPrivateKeyInsert,
  TBackupPrivateKeyUpdate,
  TGitAppInstallSessions,
  TGitAppInstallSessionsInsert,
  TGitAppInstallSessionsUpdate,
  TGitAppOrg,
  TGitAppOrgInsert,
  TGitAppOrgUpdate,
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
  TOrgBots,
  TOrgBotsInsert,
  TOrgBotsUpdate,
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
  TSamlConfigs,
  TSamlConfigsInsert,
  TSamlConfigsUpdate,
  TSecretApprovalPolicies,
  TSecretApprovalPoliciesApprovers,
  TSecretApprovalPoliciesApproversInsert,
  TSecretApprovalPoliciesApproversUpdate,
  TSecretApprovalPoliciesInsert,
  TSecretApprovalPoliciesUpdate,
  TSecretApprovalRequests,
  TSecretApprovalRequestSecretTags,
  TSecretApprovalRequestSecretTagsInsert,
  TSecretApprovalRequestSecretTagsUpdate,
  TSecretApprovalRequestsInsert,
  TSecretApprovalRequestsReviewers,
  TSecretApprovalRequestsReviewersInsert,
  TSecretApprovalRequestsReviewersUpdate,
  TSecretApprovalRequestsSecrets,
  TSecretApprovalRequestsSecretsInsert,
  TSecretApprovalRequestsSecretsUpdate,
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
  TSecretScanningGitRisks,
  TSecretScanningGitRisksInsert,
  TSecretScanningGitRisksUpdate,
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
  TSecretVersionTagJunction,
  TSecretVersionTagJunctionInsert,
  TSecretVersionTagJunctionUpdate,
  TServiceTokens,
  TServiceTokensInsert,
  TServiceTokensUpdate,
  TSuperAdmin,
  TSuperAdminInsert,
  TSuperAdminUpdate,
  TTrustedIps,
  TTrustedIpsInsert,
  TTrustedIpsUpdate,
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
  TWebhooksUpdate,
} from "../schemas";

declare module "knex/types/tables" {
  interface Tables {
    [TableName.Users]: Knex.CompositeTableType<
      TUsers,
      TUsersInsert,
      TUsersUpdate
    >;
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
    [TableName.OrgRoles]: Knex.CompositeTableType<
      TOrgRoles,
      TOrgRolesInsert,
      TOrgRolesUpdate
    >;
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
    [TableName.ApiKey]: Knex.CompositeTableType<
      TApiKeys,
      TApiKeysInsert,
      TApiKeysUpdate
    >;
    [TableName.Project]: Knex.CompositeTableType<
      TProjects,
      TProjectsInsert,
      TProjectsUpdate
    >;
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
    [TableName.Secret]: Knex.CompositeTableType<
      TSecrets,
      TSecretsInsert,
      TSecretsUpdate
    >;
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
    [TableName.Integration]: Knex.CompositeTableType<
      TIntegrations,
      TIntegrationsInsert,
      TIntegrationsUpdate
    >;
    [TableName.Webhook]: Knex.CompositeTableType<
      TWebhooks,
      TWebhooksInsert,
      TWebhooksUpdate
    >;
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
    [TableName.SecretApprovalPolicyApprover]: Knex.CompositeTableType<
      TSecretApprovalPoliciesApprovers,
      TSecretApprovalPoliciesApproversInsert,
      TSecretApprovalPoliciesApproversUpdate
    >;
    [TableName.SecretApprovalRequest]: Knex.CompositeTableType<
      TSecretApprovalRequests,
      TSecretApprovalRequestsInsert,
      TSecretApprovalRequestsUpdate
    >;
    [TableName.SecretApprovalRequestReviewer]: Knex.CompositeTableType<
      TSecretApprovalRequestsReviewers,
      TSecretApprovalRequestsReviewersInsert,
      TSecretApprovalRequestsReviewersUpdate
    >;
    [TableName.SecretApprovalRequestSecret]: Knex.CompositeTableType<
      TSecretApprovalRequestsSecrets,
      TSecretApprovalRequestsSecretsInsert,
      TSecretApprovalRequestsSecretsUpdate
    >;
    [TableName.SecretApprovalRequestSecretTag]: Knex.CompositeTableType<
      TSecretApprovalRequestSecretTags,
      TSecretApprovalRequestSecretTagsInsert,
      TSecretApprovalRequestSecretTagsUpdate
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
    [TableName.SamlConfig]: Knex.CompositeTableType<
      TSamlConfigs,
      TSamlConfigsInsert,
      TSamlConfigsUpdate
    >;
    [TableName.OrgBot]: Knex.CompositeTableType<
      TOrgBots,
      TOrgBotsInsert,
      TOrgBotsUpdate
    >;
    [TableName.AuditLog]: Knex.CompositeTableType<
      TAuditLogs,
      TAuditLogsInsert,
      TAuditLogsUpdate
    >;
    [TableName.GitAppInstallSession]: Knex.CompositeTableType<
      TGitAppInstallSessions,
      TGitAppInstallSessionsInsert,
      TGitAppInstallSessionsUpdate
    >;
    [TableName.GitAppOrg]: Knex.CompositeTableType<
      TGitAppOrg,
      TGitAppOrgInsert,
      TGitAppOrgUpdate
    >;
    [TableName.SecretScanningGitRisk]: Knex.CompositeTableType<
      TSecretScanningGitRisks,
      TSecretScanningGitRisksInsert,
      TSecretScanningGitRisksUpdate
    >;
    [TableName.TrustedIps]: Knex.CompositeTableType<
      TTrustedIps,
      TTrustedIpsInsert,
      TTrustedIpsUpdate
    >;
    // Junction tables
    [TableName.JnSecretTag]: Knex.CompositeTableType<
      TSecretTagJunction,
      TSecretTagJunctionInsert,
      TSecretTagJunctionUpdate
    >;
    [TableName.SecretVersionTag]: Knex.CompositeTableType<
      TSecretVersionTagJunction,
      TSecretVersionTagJunctionInsert,
      TSecretVersionTagJunctionUpdate
    >;
  }
}
