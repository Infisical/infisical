import { Knex as KnexOriginal } from "knex";

import {
  TableName,
  TAccessApprovalPolicies,
  TAccessApprovalPoliciesApprovers,
  TAccessApprovalPoliciesApproversInsert,
  TAccessApprovalPoliciesApproversUpdate,
  TAccessApprovalPoliciesInsert,
  TAccessApprovalPoliciesUpdate,
  TAccessApprovalRequests,
  TAccessApprovalRequestsInsert,
  TAccessApprovalRequestsReviewers,
  TAccessApprovalRequestsReviewersInsert,
  TAccessApprovalRequestsReviewersUpdate,
  TAccessApprovalRequestsUpdate,
  TApiKeys,
  TApiKeysInsert,
  TApiKeysUpdate,
  TAuditLogs,
  TAuditLogsInsert,
  TAuditLogStreams,
  TAuditLogStreamsInsert,
  TAuditLogStreamsUpdate,
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
  TCertificateAuthorities,
  TCertificateAuthoritiesInsert,
  TCertificateAuthoritiesUpdate,
  TCertificateAuthorityCerts,
  TCertificateAuthorityCertsInsert,
  TCertificateAuthorityCertsUpdate,
  TCertificateAuthorityCrl,
  TCertificateAuthorityCrlInsert,
  TCertificateAuthorityCrlUpdate,
  TCertificateAuthoritySecret,
  TCertificateAuthoritySecretInsert,
  TCertificateAuthoritySecretUpdate,
  TCertificateBodies,
  TCertificateBodiesInsert,
  TCertificateBodiesUpdate,
  TCertificates,
  TCertificateSecrets,
  TCertificateSecretsInsert,
  TCertificateSecretsUpdate,
  TCertificatesInsert,
  TCertificatesUpdate,
  TCertificateTemplateEstConfigs,
  TCertificateTemplateEstConfigsInsert,
  TCertificateTemplateEstConfigsUpdate,
  TCertificateTemplates,
  TCertificateTemplatesInsert,
  TCertificateTemplatesUpdate,
  TDynamicSecretLeases,
  TDynamicSecretLeasesInsert,
  TDynamicSecretLeasesUpdate,
  TDynamicSecrets,
  TDynamicSecretsInsert,
  TDynamicSecretsUpdate,
  TExternalKms,
  TExternalKmsInsert,
  TExternalKmsUpdate,
  TGitAppInstallSessions,
  TGitAppInstallSessionsInsert,
  TGitAppInstallSessionsUpdate,
  TGitAppOrg,
  TGitAppOrgInsert,
  TGitAppOrgUpdate,
  TGroupProjectMembershipRoles,
  TGroupProjectMembershipRolesInsert,
  TGroupProjectMembershipRolesUpdate,
  TGroupProjectMemberships,
  TGroupProjectMembershipsInsert,
  TGroupProjectMembershipsUpdate,
  TGroups,
  TGroupsInsert,
  TGroupsUpdate,
  TIdentities,
  TIdentitiesInsert,
  TIdentitiesUpdate,
  TIdentityAccessTokens,
  TIdentityAccessTokensInsert,
  TIdentityAccessTokensUpdate,
  TIdentityAwsAuths,
  TIdentityAwsAuthsInsert,
  TIdentityAwsAuthsUpdate,
  TIdentityAzureAuths,
  TIdentityAzureAuthsInsert,
  TIdentityAzureAuthsUpdate,
  TIdentityGcpAuths,
  TIdentityGcpAuthsInsert,
  TIdentityGcpAuthsUpdate,
  TIdentityJwtAuths,
  TIdentityJwtAuthsInsert,
  TIdentityJwtAuthsUpdate,
  TIdentityKubernetesAuths,
  TIdentityKubernetesAuthsInsert,
  TIdentityKubernetesAuthsUpdate,
  TIdentityMetadata,
  TIdentityMetadataInsert,
  TIdentityMetadataUpdate,
  TIdentityOidcAuths,
  TIdentityOidcAuthsInsert,
  TIdentityOidcAuthsUpdate,
  TIdentityOrgMemberships,
  TIdentityOrgMembershipsInsert,
  TIdentityOrgMembershipsUpdate,
  TIdentityProjectAdditionalPrivilege,
  TIdentityProjectAdditionalPrivilegeInsert,
  TIdentityProjectAdditionalPrivilegeUpdate,
  TIdentityProjectMembershipRole,
  TIdentityProjectMembershipRoleInsert,
  TIdentityProjectMembershipRoleUpdate,
  TIdentityProjectMemberships,
  TIdentityProjectMembershipsInsert,
  TIdentityProjectMembershipsUpdate,
  TIdentityTokenAuths,
  TIdentityTokenAuthsInsert,
  TIdentityTokenAuthsUpdate,
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
  TInternalKms,
  TInternalKmsInsert,
  TInternalKmsUpdate,
  TKmsKeys,
  TKmsKeysInsert,
  TKmsKeysUpdate,
  TKmsKeyVersions,
  TKmsKeyVersionsInsert,
  TKmsKeyVersionsUpdate,
  TKmsRootConfig,
  TKmsRootConfigInsert,
  TKmsRootConfigUpdate,
  TLdapConfigs,
  TLdapConfigsInsert,
  TLdapConfigsUpdate,
  TLdapGroupMaps,
  TLdapGroupMapsInsert,
  TLdapGroupMapsUpdate,
  TOidcConfigs,
  TOidcConfigsInsert,
  TOidcConfigsUpdate,
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
  TPkiAlerts,
  TPkiAlertsInsert,
  TPkiAlertsUpdate,
  TPkiCollectionItems,
  TPkiCollectionItemsInsert,
  TPkiCollectionItemsUpdate,
  TPkiCollections,
  TPkiCollectionsInsert,
  TPkiCollectionsUpdate,
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
  TProjectSlackConfigs,
  TProjectSlackConfigsInsert,
  TProjectSlackConfigsUpdate,
  TProjectSplitBackfillIds,
  TProjectSplitBackfillIdsInsert,
  TProjectSplitBackfillIdsUpdate,
  TProjectsUpdate,
  TProjectTemplates,
  TProjectTemplatesInsert,
  TProjectTemplatesUpdate,
  TProjectUserAdditionalPrivilege,
  TProjectUserAdditionalPrivilegeInsert,
  TProjectUserAdditionalPrivilegeUpdate,
  TProjectUserMembershipRoles,
  TProjectUserMembershipRolesInsert,
  TProjectUserMembershipRolesUpdate,
  TRateLimit,
  TRateLimitInsert,
  TRateLimitUpdate,
  TSamlConfigs,
  TSamlConfigsInsert,
  TSamlConfigsUpdate,
  TScimTokens,
  TScimTokensInsert,
  TScimTokensUpdate,
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
  TSecretApprovalRequestSecretTagsV2,
  TSecretApprovalRequestSecretTagsV2Insert,
  TSecretApprovalRequestSecretTagsV2Update,
  TSecretApprovalRequestsInsert,
  TSecretApprovalRequestsReviewers,
  TSecretApprovalRequestsReviewersInsert,
  TSecretApprovalRequestsReviewersUpdate,
  TSecretApprovalRequestsSecrets,
  TSecretApprovalRequestsSecretsInsert,
  TSecretApprovalRequestsSecretsUpdate,
  TSecretApprovalRequestsSecretsV2,
  TSecretApprovalRequestsSecretsV2Insert,
  TSecretApprovalRequestsSecretsV2Update,
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
  TSecretReferences,
  TSecretReferencesInsert,
  TSecretReferencesUpdate,
  TSecretReferencesV2,
  TSecretReferencesV2Insert,
  TSecretReferencesV2Update,
  TSecretRotationOutputs,
  TSecretRotationOutputsInsert,
  TSecretRotationOutputsUpdate,
  TSecretRotationOutputV2,
  TSecretRotationOutputV2Insert,
  TSecretRotationOutputV2Update,
  TSecretRotations,
  TSecretRotationsInsert,
  TSecretRotationsUpdate,
  TSecrets,
  TSecretScanningGitRisks,
  TSecretScanningGitRisksInsert,
  TSecretScanningGitRisksUpdate,
  TSecretSharing,
  TSecretSharingInsert,
  TSecretSharingUpdate,
  TSecretsInsert,
  TSecretSnapshotFolders,
  TSecretSnapshotFoldersInsert,
  TSecretSnapshotFoldersUpdate,
  TSecretSnapshots,
  TSecretSnapshotSecrets,
  TSecretSnapshotSecretsInsert,
  TSecretSnapshotSecretsUpdate,
  TSecretSnapshotSecretsV2,
  TSecretSnapshotSecretsV2Insert,
  TSecretSnapshotSecretsV2Update,
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
  TSecretVersionV2TagJunction,
  TSecretVersionV2TagJunctionInsert,
  TSecretVersionV2TagJunctionUpdate,
  TServiceTokens,
  TServiceTokensInsert,
  TServiceTokensUpdate,
  TSlackIntegrations,
  TSlackIntegrationsInsert,
  TSlackIntegrationsUpdate,
  TSshCertificateAuthorities,
  TSshCertificateAuthoritiesInsert,
  TSshCertificateAuthoritiesUpdate,
  TSshCertificateAuthoritySecrets,
  TSshCertificateAuthoritySecretsInsert,
  TSshCertificateAuthoritySecretsUpdate,
  TSshCertificateBodies,
  TSshCertificateBodiesInsert,
  TSshCertificateBodiesUpdate,
  TSshCertificates,
  TSshCertificatesInsert,
  TSshCertificatesUpdate,
  TSshCertificateTemplates,
  TSshCertificateTemplatesInsert,
  TSshCertificateTemplatesUpdate,
  TSuperAdmin,
  TSuperAdminInsert,
  TSuperAdminUpdate,
  TTotpConfigs,
  TTotpConfigsInsert,
  TTotpConfigsUpdate,
  TTrustedIps,
  TTrustedIpsInsert,
  TTrustedIpsUpdate,
  TUserActions,
  TUserActionsInsert,
  TUserActionsUpdate,
  TUserAliases,
  TUserAliasesInsert,
  TUserAliasesUpdate,
  TUserEncryptionKeys,
  TUserEncryptionKeysInsert,
  TUserEncryptionKeysUpdate,
  TUserGroupMembership,
  TUserGroupMembershipInsert,
  TUserGroupMembershipUpdate,
  TUsers,
  TUserSecrets,
  TUserSecretsInsert,
  TUserSecretsUpdate,
  TUsersInsert,
  TUsersUpdate,
  TWebhooks,
  TWebhooksInsert,
  TWebhooksUpdate,
  TWorkflowIntegrations,
  TWorkflowIntegrationsInsert,
  TWorkflowIntegrationsUpdate
} from "@app/db/schemas";
import { TAppConnections, TAppConnectionsInsert, TAppConnectionsUpdate } from "@app/db/schemas/app-connections";
import {
  TExternalGroupOrgRoleMappings,
  TExternalGroupOrgRoleMappingsInsert,
  TExternalGroupOrgRoleMappingsUpdate
} from "@app/db/schemas/external-group-org-role-mappings";
import {
  TSecretV2TagJunction,
  TSecretV2TagJunctionInsert,
  TSecretV2TagJunctionUpdate
} from "@app/db/schemas/secret-v2-tag-junction";
import {
  TSecretVersionsV2,
  TSecretVersionsV2Insert,
  TSecretVersionsV2Update
} from "@app/db/schemas/secret-versions-v2";
import { TSecretsV2, TSecretsV2Insert, TSecretsV2Update } from "@app/db/schemas/secrets-v2";

declare module "knex" {
  namespace Knex {
    interface QueryInterface {
      primaryNode(): KnexOriginal;
      replicaNode(): KnexOriginal;
    }
  }
}

declare module "knex/types/tables" {
  interface Tables {
    [TableName.Users]: KnexOriginal.CompositeTableType<TUsers, TUsersInsert, TUsersUpdate>;
    [TableName.Groups]: KnexOriginal.CompositeTableType<TGroups, TGroupsInsert, TGroupsUpdate>;
    [TableName.SshCertificateAuthority]: KnexOriginal.CompositeTableType<
      TSshCertificateAuthorities,
      TSshCertificateAuthoritiesInsert,
      TSshCertificateAuthoritiesUpdate
    >;
    [TableName.SshCertificateAuthoritySecret]: KnexOriginal.CompositeTableType<
      TSshCertificateAuthoritySecrets,
      TSshCertificateAuthoritySecretsInsert,
      TSshCertificateAuthoritySecretsUpdate
    >;
    [TableName.SshCertificateTemplate]: KnexOriginal.CompositeTableType<
      TSshCertificateTemplates,
      TSshCertificateTemplatesInsert,
      TSshCertificateTemplatesUpdate
    >;
    [TableName.SshCertificate]: KnexOriginal.CompositeTableType<
      TSshCertificates,
      TSshCertificatesInsert,
      TSshCertificatesUpdate
    >;
    [TableName.SshCertificateBody]: KnexOriginal.CompositeTableType<
      TSshCertificateBodies,
      TSshCertificateBodiesInsert,
      TSshCertificateBodiesUpdate
    >;
    [TableName.CertificateAuthority]: KnexOriginal.CompositeTableType<
      TCertificateAuthorities,
      TCertificateAuthoritiesInsert,
      TCertificateAuthoritiesUpdate
    >;
    [TableName.CertificateAuthorityCert]: KnexOriginal.CompositeTableType<
      TCertificateAuthorityCerts,
      TCertificateAuthorityCertsInsert,
      TCertificateAuthorityCertsUpdate
    >;
    [TableName.CertificateAuthoritySecret]: KnexOriginal.CompositeTableType<
      TCertificateAuthoritySecret,
      TCertificateAuthoritySecretInsert,
      TCertificateAuthoritySecretUpdate
    >;
    [TableName.CertificateAuthorityCrl]: KnexOriginal.CompositeTableType<
      TCertificateAuthorityCrl,
      TCertificateAuthorityCrlInsert,
      TCertificateAuthorityCrlUpdate
    >;
    [TableName.Certificate]: KnexOriginal.CompositeTableType<TCertificates, TCertificatesInsert, TCertificatesUpdate>;
    [TableName.CertificateTemplate]: KnexOriginal.CompositeTableType<
      TCertificateTemplates,
      TCertificateTemplatesInsert,
      TCertificateTemplatesUpdate
    >;
    [TableName.CertificateTemplateEstConfig]: KnexOriginal.CompositeTableType<
      TCertificateTemplateEstConfigs,
      TCertificateTemplateEstConfigsInsert,
      TCertificateTemplateEstConfigsUpdate
    >;
    [TableName.CertificateBody]: KnexOriginal.CompositeTableType<
      TCertificateBodies,
      TCertificateBodiesInsert,
      TCertificateBodiesUpdate
    >;
    [TableName.CertificateSecret]: KnexOriginal.CompositeTableType<
      TCertificateSecrets,
      TCertificateSecretsInsert,
      TCertificateSecretsUpdate
    >;
    [TableName.PkiAlert]: KnexOriginal.CompositeTableType<TPkiAlerts, TPkiAlertsInsert, TPkiAlertsUpdate>;
    [TableName.PkiCollection]: KnexOriginal.CompositeTableType<
      TPkiCollections,
      TPkiCollectionsInsert,
      TPkiCollectionsUpdate
    >;
    [TableName.PkiCollectionItem]: KnexOriginal.CompositeTableType<
      TPkiCollectionItems,
      TPkiCollectionItemsInsert,
      TPkiCollectionItemsUpdate
    >;
    [TableName.UserGroupMembership]: KnexOriginal.CompositeTableType<
      TUserGroupMembership,
      TUserGroupMembershipInsert,
      TUserGroupMembershipUpdate
    >;
    [TableName.GroupProjectMembership]: KnexOriginal.CompositeTableType<
      TGroupProjectMemberships,
      TGroupProjectMembershipsInsert,
      TGroupProjectMembershipsUpdate
    >;
    [TableName.GroupProjectMembershipRole]: KnexOriginal.CompositeTableType<
      TGroupProjectMembershipRoles,
      TGroupProjectMembershipRolesInsert,
      TGroupProjectMembershipRolesUpdate
    >;
    [TableName.UserAliases]: KnexOriginal.CompositeTableType<TUserAliases, TUserAliasesInsert, TUserAliasesUpdate>;
    [TableName.UserEncryptionKey]: KnexOriginal.CompositeTableType<
      TUserEncryptionKeys,
      TUserEncryptionKeysInsert,
      TUserEncryptionKeysUpdate
    >;
    [TableName.AuthTokens]: KnexOriginal.CompositeTableType<TAuthTokens, TAuthTokensInsert, TAuthTokensUpdate>;
    [TableName.AuthTokenSession]: KnexOriginal.CompositeTableType<
      TAuthTokenSessions,
      TAuthTokenSessionsInsert,
      TAuthTokenSessionsUpdate
    >;
    [TableName.BackupPrivateKey]: KnexOriginal.CompositeTableType<
      TBackupPrivateKey,
      TBackupPrivateKeyInsert,
      TBackupPrivateKeyUpdate
    >;
    [TableName.Organization]: KnexOriginal.CompositeTableType<
      TOrganizations,
      TOrganizationsInsert,
      TOrganizationsUpdate
    >;
    [TableName.OrgMembership]: KnexOriginal.CompositeTableType<
      TOrgMemberships,
      TOrgMembershipsInsert,
      TOrgMembershipsUpdate
    >;
    [TableName.OrgRoles]: KnexOriginal.CompositeTableType<TOrgRoles, TOrgRolesInsert, TOrgRolesUpdate>;
    [TableName.IncidentContact]: KnexOriginal.CompositeTableType<
      TIncidentContacts,
      TIncidentContactsInsert,
      TIncidentContactsUpdate
    >;
    [TableName.UserAction]: KnexOriginal.CompositeTableType<TUserActions, TUserActionsInsert, TUserActionsUpdate>;
    [TableName.SuperAdmin]: KnexOriginal.CompositeTableType<TSuperAdmin, TSuperAdminInsert, TSuperAdminUpdate>;
    [TableName.ApiKey]: KnexOriginal.CompositeTableType<TApiKeys, TApiKeysInsert, TApiKeysUpdate>;
    [TableName.Project]: KnexOriginal.CompositeTableType<TProjects, TProjectsInsert, TProjectsUpdate>;
    [TableName.ProjectMembership]: KnexOriginal.CompositeTableType<
      TProjectMemberships,
      TProjectMembershipsInsert,
      TProjectMembershipsUpdate
    >;
    [TableName.Environment]: KnexOriginal.CompositeTableType<
      TProjectEnvironments,
      TProjectEnvironmentsInsert,
      TProjectEnvironmentsUpdate
    >;
    [TableName.ProjectBot]: KnexOriginal.CompositeTableType<TProjectBots, TProjectBotsInsert, TProjectBotsUpdate>;
    [TableName.ProjectUserMembershipRole]: KnexOriginal.CompositeTableType<
      TProjectUserMembershipRoles,
      TProjectUserMembershipRolesInsert,
      TProjectUserMembershipRolesUpdate
    >;
    [TableName.ProjectRoles]: KnexOriginal.CompositeTableType<TProjectRoles, TProjectRolesInsert, TProjectRolesUpdate>;
    [TableName.ProjectUserAdditionalPrivilege]: KnexOriginal.CompositeTableType<
      TProjectUserAdditionalPrivilege,
      TProjectUserAdditionalPrivilegeInsert,
      TProjectUserAdditionalPrivilegeUpdate
    >;
    [TableName.ProjectKeys]: KnexOriginal.CompositeTableType<TProjectKeys, TProjectKeysInsert, TProjectKeysUpdate>;
    [TableName.Secret]: KnexOriginal.CompositeTableType<TSecrets, TSecretsInsert, TSecretsUpdate>;
    [TableName.SecretReference]: KnexOriginal.CompositeTableType<
      TSecretReferences,
      TSecretReferencesInsert,
      TSecretReferencesUpdate
    >;
    [TableName.SecretBlindIndex]: KnexOriginal.CompositeTableType<
      TSecretBlindIndexes,
      TSecretBlindIndexesInsert,
      TSecretBlindIndexesUpdate
    >;
    [TableName.SecretVersion]: KnexOriginal.CompositeTableType<
      TSecretVersions,
      TSecretVersionsInsert,
      TSecretVersionsUpdate
    >;
    [TableName.SecretFolder]: KnexOriginal.CompositeTableType<
      TSecretFolders,
      TSecretFoldersInsert,
      TSecretFoldersUpdate
    >;
    [TableName.SecretFolderVersion]: KnexOriginal.CompositeTableType<
      TSecretFolderVersions,
      TSecretFolderVersionsInsert,
      TSecretFolderVersionsUpdate
    >;
    [TableName.SecretSharing]: KnexOriginal.CompositeTableType<
      TSecretSharing,
      TSecretSharingInsert,
      TSecretSharingUpdate
    >;
    [TableName.UserSecrets]: KnexOriginal.CompositeTableType<TUserSecrets, TUserSecretsInsert, TUserSecretsUpdate>;
    [TableName.RateLimit]: KnexOriginal.CompositeTableType<TRateLimit, TRateLimitInsert, TRateLimitUpdate>;
    [TableName.SecretTag]: KnexOriginal.CompositeTableType<TSecretTags, TSecretTagsInsert, TSecretTagsUpdate>;
    [TableName.SecretImport]: KnexOriginal.CompositeTableType<
      TSecretImports,
      TSecretImportsInsert,
      TSecretImportsUpdate
    >;
    [TableName.Integration]: KnexOriginal.CompositeTableType<TIntegrations, TIntegrationsInsert, TIntegrationsUpdate>;
    [TableName.Webhook]: KnexOriginal.CompositeTableType<TWebhooks, TWebhooksInsert, TWebhooksUpdate>;
    [TableName.ServiceToken]: KnexOriginal.CompositeTableType<
      TServiceTokens,
      TServiceTokensInsert,
      TServiceTokensUpdate
    >;
    [TableName.IntegrationAuth]: KnexOriginal.CompositeTableType<
      TIntegrationAuths,
      TIntegrationAuthsInsert,
      TIntegrationAuthsUpdate
    >;
    [TableName.Identity]: KnexOriginal.CompositeTableType<TIdentities, TIdentitiesInsert, TIdentitiesUpdate>;
    [TableName.IdentityTokenAuth]: KnexOriginal.CompositeTableType<
      TIdentityTokenAuths,
      TIdentityTokenAuthsInsert,
      TIdentityTokenAuthsUpdate
    >;
    [TableName.IdentityUniversalAuth]: KnexOriginal.CompositeTableType<
      TIdentityUniversalAuths,
      TIdentityUniversalAuthsInsert,
      TIdentityUniversalAuthsUpdate
    >;
    [TableName.IdentityMetadata]: KnexOriginal.CompositeTableType<
      TIdentityMetadata,
      TIdentityMetadataInsert,
      TIdentityMetadataUpdate
    >;
    [TableName.IdentityKubernetesAuth]: KnexOriginal.CompositeTableType<
      TIdentityKubernetesAuths,
      TIdentityKubernetesAuthsInsert,
      TIdentityKubernetesAuthsUpdate
    >;
    [TableName.IdentityGcpAuth]: KnexOriginal.CompositeTableType<
      TIdentityGcpAuths,
      TIdentityGcpAuthsInsert,
      TIdentityGcpAuthsUpdate
    >;
    [TableName.IdentityAwsAuth]: KnexOriginal.CompositeTableType<
      TIdentityAwsAuths,
      TIdentityAwsAuthsInsert,
      TIdentityAwsAuthsUpdate
    >;
    [TableName.IdentityAzureAuth]: KnexOriginal.CompositeTableType<
      TIdentityAzureAuths,
      TIdentityAzureAuthsInsert,
      TIdentityAzureAuthsUpdate
    >;
    [TableName.IdentityOidcAuth]: KnexOriginal.CompositeTableType<
      TIdentityOidcAuths,
      TIdentityOidcAuthsInsert,
      TIdentityOidcAuthsUpdate
    >;
    [TableName.IdentityJwtAuth]: KnexOriginal.CompositeTableType<
      TIdentityJwtAuths,
      TIdentityJwtAuthsInsert,
      TIdentityJwtAuthsUpdate
    >;
    [TableName.IdentityUaClientSecret]: KnexOriginal.CompositeTableType<
      TIdentityUaClientSecrets,
      TIdentityUaClientSecretsInsert,
      TIdentityUaClientSecretsUpdate
    >;
    [TableName.IdentityAccessToken]: KnexOriginal.CompositeTableType<
      TIdentityAccessTokens,
      TIdentityAccessTokensInsert,
      TIdentityAccessTokensUpdate
    >;
    [TableName.IdentityOrgMembership]: KnexOriginal.CompositeTableType<
      TIdentityOrgMemberships,
      TIdentityOrgMembershipsInsert,
      TIdentityOrgMembershipsUpdate
    >;
    [TableName.IdentityProjectMembership]: KnexOriginal.CompositeTableType<
      TIdentityProjectMemberships,
      TIdentityProjectMembershipsInsert,
      TIdentityProjectMembershipsUpdate
    >;
    [TableName.IdentityProjectMembershipRole]: KnexOriginal.CompositeTableType<
      TIdentityProjectMembershipRole,
      TIdentityProjectMembershipRoleInsert,
      TIdentityProjectMembershipRoleUpdate
    >;
    [TableName.IdentityProjectAdditionalPrivilege]: KnexOriginal.CompositeTableType<
      TIdentityProjectAdditionalPrivilege,
      TIdentityProjectAdditionalPrivilegeInsert,
      TIdentityProjectAdditionalPrivilegeUpdate
    >;

    [TableName.AccessApprovalPolicy]: KnexOriginal.CompositeTableType<
      TAccessApprovalPolicies,
      TAccessApprovalPoliciesInsert,
      TAccessApprovalPoliciesUpdate
    >;

    [TableName.AccessApprovalPolicyApprover]: KnexOriginal.CompositeTableType<
      TAccessApprovalPoliciesApprovers,
      TAccessApprovalPoliciesApproversInsert,
      TAccessApprovalPoliciesApproversUpdate
    >;

    [TableName.AccessApprovalRequest]: KnexOriginal.CompositeTableType<
      TAccessApprovalRequests,
      TAccessApprovalRequestsInsert,
      TAccessApprovalRequestsUpdate
    >;

    [TableName.AccessApprovalRequestReviewer]: KnexOriginal.CompositeTableType<
      TAccessApprovalRequestsReviewers,
      TAccessApprovalRequestsReviewersInsert,
      TAccessApprovalRequestsReviewersUpdate
    >;

    [TableName.ScimToken]: KnexOriginal.CompositeTableType<TScimTokens, TScimTokensInsert, TScimTokensUpdate>;
    [TableName.SecretApprovalPolicy]: KnexOriginal.CompositeTableType<
      TSecretApprovalPolicies,
      TSecretApprovalPoliciesInsert,
      TSecretApprovalPoliciesUpdate
    >;
    [TableName.SecretApprovalPolicyApprover]: KnexOriginal.CompositeTableType<
      TSecretApprovalPoliciesApprovers,
      TSecretApprovalPoliciesApproversInsert,
      TSecretApprovalPoliciesApproversUpdate
    >;
    [TableName.SecretApprovalRequest]: KnexOriginal.CompositeTableType<
      TSecretApprovalRequests,
      TSecretApprovalRequestsInsert,
      TSecretApprovalRequestsUpdate
    >;
    [TableName.SecretApprovalRequestReviewer]: KnexOriginal.CompositeTableType<
      TSecretApprovalRequestsReviewers,
      TSecretApprovalRequestsReviewersInsert,
      TSecretApprovalRequestsReviewersUpdate
    >;
    [TableName.SecretApprovalRequestSecret]: KnexOriginal.CompositeTableType<
      TSecretApprovalRequestsSecrets,
      TSecretApprovalRequestsSecretsInsert,
      TSecretApprovalRequestsSecretsUpdate
    >;
    [TableName.SecretApprovalRequestSecretTag]: KnexOriginal.CompositeTableType<
      TSecretApprovalRequestSecretTags,
      TSecretApprovalRequestSecretTagsInsert,
      TSecretApprovalRequestSecretTagsUpdate
    >;
    [TableName.SecretRotation]: KnexOriginal.CompositeTableType<
      TSecretRotations,
      TSecretRotationsInsert,
      TSecretRotationsUpdate
    >;
    [TableName.SecretRotationOutput]: KnexOriginal.CompositeTableType<
      TSecretRotationOutputs,
      TSecretRotationOutputsInsert,
      TSecretRotationOutputsUpdate
    >;
    [TableName.Snapshot]: KnexOriginal.CompositeTableType<
      TSecretSnapshots,
      TSecretSnapshotsInsert,
      TSecretSnapshotsUpdate
    >;
    [TableName.SnapshotSecret]: KnexOriginal.CompositeTableType<
      TSecretSnapshotSecrets,
      TSecretSnapshotSecretsInsert,
      TSecretSnapshotSecretsUpdate
    >;
    [TableName.SnapshotFolder]: KnexOriginal.CompositeTableType<
      TSecretSnapshotFolders,
      TSecretSnapshotFoldersInsert,
      TSecretSnapshotFoldersUpdate
    >;
    [TableName.DynamicSecret]: KnexOriginal.CompositeTableType<
      TDynamicSecrets,
      TDynamicSecretsInsert,
      TDynamicSecretsUpdate
    >;
    [TableName.DynamicSecretLease]: KnexOriginal.CompositeTableType<
      TDynamicSecretLeases,
      TDynamicSecretLeasesInsert,
      TDynamicSecretLeasesUpdate
    >;
    [TableName.SamlConfig]: KnexOriginal.CompositeTableType<TSamlConfigs, TSamlConfigsInsert, TSamlConfigsUpdate>;
    [TableName.OidcConfig]: KnexOriginal.CompositeTableType<TOidcConfigs, TOidcConfigsInsert, TOidcConfigsUpdate>;
    [TableName.LdapConfig]: KnexOriginal.CompositeTableType<TLdapConfigs, TLdapConfigsInsert, TLdapConfigsUpdate>;
    [TableName.LdapGroupMap]: KnexOriginal.CompositeTableType<
      TLdapGroupMaps,
      TLdapGroupMapsInsert,
      TLdapGroupMapsUpdate
    >;
    [TableName.OrgBot]: KnexOriginal.CompositeTableType<TOrgBots, TOrgBotsInsert, TOrgBotsUpdate>;
    [TableName.AuditLog]: KnexOriginal.CompositeTableType<TAuditLogs, TAuditLogsInsert, TAuditLogsUpdate>;
    [TableName.AuditLogStream]: KnexOriginal.CompositeTableType<
      TAuditLogStreams,
      TAuditLogStreamsInsert,
      TAuditLogStreamsUpdate
    >;
    [TableName.GitAppInstallSession]: KnexOriginal.CompositeTableType<
      TGitAppInstallSessions,
      TGitAppInstallSessionsInsert,
      TGitAppInstallSessionsUpdate
    >;
    [TableName.GitAppOrg]: KnexOriginal.CompositeTableType<TGitAppOrg, TGitAppOrgInsert, TGitAppOrgUpdate>;
    [TableName.SecretScanningGitRisk]: KnexOriginal.CompositeTableType<
      TSecretScanningGitRisks,
      TSecretScanningGitRisksInsert,
      TSecretScanningGitRisksUpdate
    >;
    [TableName.TrustedIps]: KnexOriginal.CompositeTableType<TTrustedIps, TTrustedIpsInsert, TTrustedIpsUpdate>;
    [TableName.SecretV2]: KnexOriginal.CompositeTableType<TSecretsV2, TSecretsV2Insert, TSecretsV2Update>;
    [TableName.SecretVersionV2]: KnexOriginal.CompositeTableType<
      TSecretVersionsV2,
      TSecretVersionsV2Insert,
      TSecretVersionsV2Update
    >;
    [TableName.SecretReferenceV2]: KnexOriginal.CompositeTableType<
      TSecretReferencesV2,
      TSecretReferencesV2Insert,
      TSecretReferencesV2Update
    >;
    // Junction tables
    [TableName.SecretV2JnTag]: KnexOriginal.CompositeTableType<
      TSecretV2TagJunction,
      TSecretV2TagJunctionInsert,
      TSecretV2TagJunctionUpdate
    >;
    [TableName.JnSecretTag]: KnexOriginal.CompositeTableType<
      TSecretTagJunction,
      TSecretTagJunctionInsert,
      TSecretTagJunctionUpdate
    >;
    [TableName.SecretVersionTag]: KnexOriginal.CompositeTableType<
      TSecretVersionTagJunction,
      TSecretVersionTagJunctionInsert,
      TSecretVersionTagJunctionUpdate
    >;
    [TableName.SecretVersionV2Tag]: KnexOriginal.CompositeTableType<
      TSecretVersionV2TagJunction,
      TSecretVersionV2TagJunctionInsert,
      TSecretVersionV2TagJunctionUpdate
    >;
    [TableName.SnapshotSecretV2]: KnexOriginal.CompositeTableType<
      TSecretSnapshotSecretsV2,
      TSecretSnapshotSecretsV2Insert,
      TSecretSnapshotSecretsV2Update
    >;
    [TableName.SecretApprovalRequestSecretV2]: KnexOriginal.CompositeTableType<
      TSecretApprovalRequestsSecretsV2,
      TSecretApprovalRequestsSecretsV2Insert,
      TSecretApprovalRequestsSecretsV2Update
    >;
    [TableName.SecretApprovalRequestSecretTagV2]: KnexOriginal.CompositeTableType<
      TSecretApprovalRequestSecretTagsV2,
      TSecretApprovalRequestSecretTagsV2Insert,
      TSecretApprovalRequestSecretTagsV2Update
    >;
    [TableName.SecretRotationOutputV2]: KnexOriginal.CompositeTableType<
      TSecretRotationOutputV2,
      TSecretRotationOutputV2Insert,
      TSecretRotationOutputV2Update
    >;
    // KMS service
    [TableName.KmsServerRootConfig]: KnexOriginal.CompositeTableType<
      TKmsRootConfig,
      TKmsRootConfigInsert,
      TKmsRootConfigUpdate
    >;
    [TableName.InternalKms]: KnexOriginal.CompositeTableType<TInternalKms, TInternalKmsInsert, TInternalKmsUpdate>;
    [TableName.ExternalKms]: KnexOriginal.CompositeTableType<TExternalKms, TExternalKmsInsert, TExternalKmsUpdate>;
    [TableName.KmsKey]: KnexOriginal.CompositeTableType<TKmsKeys, TKmsKeysInsert, TKmsKeysUpdate>;
    [TableName.KmsKeyVersion]: KnexOriginal.CompositeTableType<
      TKmsKeyVersions,
      TKmsKeyVersionsInsert,
      TKmsKeyVersionsUpdate
    >;
    [TableName.SlackIntegrations]: KnexOriginal.CompositeTableType<
      TSlackIntegrations,
      TSlackIntegrationsInsert,
      TSlackIntegrationsUpdate
    >;
    [TableName.ProjectSlackConfigs]: KnexOriginal.CompositeTableType<
      TProjectSlackConfigs,
      TProjectSlackConfigsInsert,
      TProjectSlackConfigsUpdate
    >;
    [TableName.WorkflowIntegrations]: KnexOriginal.CompositeTableType<
      TWorkflowIntegrations,
      TWorkflowIntegrationsInsert,
      TWorkflowIntegrationsUpdate
    >;
    [TableName.ExternalGroupOrgRoleMapping]: KnexOriginal.CompositeTableType<
      TExternalGroupOrgRoleMappings,
      TExternalGroupOrgRoleMappingsInsert,
      TExternalGroupOrgRoleMappingsUpdate
    >;
    [TableName.ProjectTemplates]: KnexOriginal.CompositeTableType<
      TProjectTemplates,
      TProjectTemplatesInsert,
      TProjectTemplatesUpdate
    >;
    [TableName.TotpConfig]: KnexOriginal.CompositeTableType<TTotpConfigs, TTotpConfigsInsert, TTotpConfigsUpdate>;
    [TableName.ProjectSplitBackfillIds]: KnexOriginal.CompositeTableType<
      TProjectSplitBackfillIds,
      TProjectSplitBackfillIdsInsert,
      TProjectSplitBackfillIdsUpdate
    >;
    [TableName.AppConnection]: KnexOriginal.CompositeTableType<
      TAppConnections,
      TAppConnectionsInsert,
      TAppConnectionsUpdate
    >;
  }
}
