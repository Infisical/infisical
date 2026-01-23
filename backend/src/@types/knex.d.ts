import { Knex as KnexOriginal } from "knex";

import { TAccessApprovalPolicies, TAccessApprovalPoliciesInsert, TAccessApprovalPoliciesUpdate } from "@app/db/schemas/access-approval-policies";
import { TAccessApprovalPoliciesApprovers, TAccessApprovalPoliciesApproversInsert, TAccessApprovalPoliciesApproversUpdate } from "@app/db/schemas/access-approval-policies-approvers";
import { TAccessApprovalPoliciesBypassers, TAccessApprovalPoliciesBypassersInsert, TAccessApprovalPoliciesBypassersUpdate } from "@app/db/schemas/access-approval-policies-bypassers";
import { TAccessApprovalRequests, TAccessApprovalRequestsInsert, TAccessApprovalRequestsUpdate } from "@app/db/schemas/access-approval-requests";
import { TAccessApprovalRequestsReviewers, TAccessApprovalRequestsReviewersInsert, TAccessApprovalRequestsReviewersUpdate } from "@app/db/schemas/access-approval-requests-reviewers";
import { TAdditionalPrivileges, TAdditionalPrivilegesInsert, TAdditionalPrivilegesUpdate } from "@app/db/schemas/additional-privileges";
import { TAiMcpActivityLogs, TAiMcpActivityLogsInsert, TAiMcpActivityLogsUpdate } from "@app/db/schemas/ai-mcp-activity-logs";
import { TAiMcpEndpointServerTools, TAiMcpEndpointServerToolsInsert, TAiMcpEndpointServerToolsUpdate } from "@app/db/schemas/ai-mcp-endpoint-server-tools";
import { TAiMcpEndpointServers, TAiMcpEndpointServersInsert, TAiMcpEndpointServersUpdate } from "@app/db/schemas/ai-mcp-endpoint-servers";
import { TAiMcpEndpoints, TAiMcpEndpointsInsert, TAiMcpEndpointsUpdate } from "@app/db/schemas/ai-mcp-endpoints";
import { TAiMcpServerTools, TAiMcpServerToolsInsert, TAiMcpServerToolsUpdate } from "@app/db/schemas/ai-mcp-server-tools";
import { TAiMcpServerUserCredentials, TAiMcpServerUserCredentialsInsert, TAiMcpServerUserCredentialsUpdate } from "@app/db/schemas/ai-mcp-server-user-credentials";
import { TAiMcpServers, TAiMcpServersInsert, TAiMcpServersUpdate } from "@app/db/schemas/ai-mcp-servers";
import { TApiKeys, TApiKeysInsert, TApiKeysUpdate } from "@app/db/schemas/api-keys";
import { TAppConnections, TAppConnectionsInsert, TAppConnectionsUpdate } from "@app/db/schemas/app-connections";
import { TApprovalPolicies, TApprovalPoliciesInsert, TApprovalPoliciesUpdate } from "@app/db/schemas/approval-policies";
import { TApprovalPolicyStepApprovers, TApprovalPolicyStepApproversInsert, TApprovalPolicyStepApproversUpdate } from "@app/db/schemas/approval-policy-step-approvers";
import { TApprovalPolicySteps, TApprovalPolicyStepsInsert, TApprovalPolicyStepsUpdate } from "@app/db/schemas/approval-policy-steps";
import { TApprovalRequestApprovals, TApprovalRequestApprovalsInsert, TApprovalRequestApprovalsUpdate } from "@app/db/schemas/approval-request-approvals";
import { TApprovalRequestGrants, TApprovalRequestGrantsInsert, TApprovalRequestGrantsUpdate } from "@app/db/schemas/approval-request-grants";
import { TApprovalRequestStepEligibleApprovers, TApprovalRequestStepEligibleApproversInsert, TApprovalRequestStepEligibleApproversUpdate } from "@app/db/schemas/approval-request-step-eligible-approvers";
import { TApprovalRequestSteps, TApprovalRequestStepsInsert, TApprovalRequestStepsUpdate } from "@app/db/schemas/approval-request-steps";
import { TApprovalRequests, TApprovalRequestsInsert, TApprovalRequestsUpdate } from "@app/db/schemas/approval-requests";
import { TAuditLogStreams, TAuditLogStreamsInsert, TAuditLogStreamsUpdate } from "@app/db/schemas/audit-log-streams";
import { TAuditLogs, TAuditLogsInsert, TAuditLogsUpdate } from "@app/db/schemas/audit-logs";
import { TAuthTokenSessions, TAuthTokenSessionsInsert, TAuthTokenSessionsUpdate } from "@app/db/schemas/auth-token-sessions";
import { TAuthTokens, TAuthTokensInsert, TAuthTokensUpdate } from "@app/db/schemas/auth-tokens";
import { TBackupPrivateKey, TBackupPrivateKeyInsert, TBackupPrivateKeyUpdate } from "@app/db/schemas/backup-private-key";
import { TCertificateAuthorities, TCertificateAuthoritiesInsert, TCertificateAuthoritiesUpdate } from "@app/db/schemas/certificate-authorities";
import { TCertificateAuthorityCerts, TCertificateAuthorityCertsInsert, TCertificateAuthorityCertsUpdate } from "@app/db/schemas/certificate-authority-certs";
import { TCertificateAuthorityCrl, TCertificateAuthorityCrlInsert, TCertificateAuthorityCrlUpdate } from "@app/db/schemas/certificate-authority-crl";
import { TCertificateAuthoritySecret, TCertificateAuthoritySecretInsert, TCertificateAuthoritySecretUpdate } from "@app/db/schemas/certificate-authority-secret";
import { TCertificateBodies, TCertificateBodiesInsert, TCertificateBodiesUpdate } from "@app/db/schemas/certificate-bodies";
import { TCertificateSecrets, TCertificateSecretsInsert, TCertificateSecretsUpdate } from "@app/db/schemas/certificate-secrets";
import { TCertificateSyncs, TCertificateSyncsInsert, TCertificateSyncsUpdate } from "@app/db/schemas/certificate-syncs";
import { TCertificateTemplateEstConfigs, TCertificateTemplateEstConfigsInsert, TCertificateTemplateEstConfigsUpdate } from "@app/db/schemas/certificate-template-est-configs";
import { TCertificateTemplates, TCertificateTemplatesInsert, TCertificateTemplatesUpdate } from "@app/db/schemas/certificate-templates";
import { TCertificates, TCertificatesInsert, TCertificatesUpdate } from "@app/db/schemas/certificates";
import { TDynamicSecretLeases, TDynamicSecretLeasesInsert, TDynamicSecretLeasesUpdate } from "@app/db/schemas/dynamic-secret-leases";
import { TDynamicSecrets, TDynamicSecretsInsert, TDynamicSecretsUpdate } from "@app/db/schemas/dynamic-secrets";
import { TExternalCertificateAuthorities, TExternalCertificateAuthoritiesInsert, TExternalCertificateAuthoritiesUpdate } from "@app/db/schemas/external-certificate-authorities";
import { TExternalGroupOrgRoleMappings, TExternalGroupOrgRoleMappingsInsert, TExternalGroupOrgRoleMappingsUpdate } from "@app/db/schemas/external-group-org-role-mappings";
import { TExternalKms, TExternalKmsInsert, TExternalKmsUpdate } from "@app/db/schemas/external-kms";
import { TFolderCheckpointResources, TFolderCheckpointResourcesInsert, TFolderCheckpointResourcesUpdate } from "@app/db/schemas/folder-checkpoint-resources";
import { TFolderCheckpoints, TFolderCheckpointsInsert, TFolderCheckpointsUpdate } from "@app/db/schemas/folder-checkpoints";
import { TFolderCommitChanges, TFolderCommitChangesInsert, TFolderCommitChangesUpdate } from "@app/db/schemas/folder-commit-changes";
import { TFolderCommits, TFolderCommitsInsert, TFolderCommitsUpdate } from "@app/db/schemas/folder-commits";
import { TFolderTreeCheckpointResources, TFolderTreeCheckpointResourcesInsert, TFolderTreeCheckpointResourcesUpdate } from "@app/db/schemas/folder-tree-checkpoint-resources";
import { TFolderTreeCheckpoints, TFolderTreeCheckpointsInsert, TFolderTreeCheckpointsUpdate } from "@app/db/schemas/folder-tree-checkpoints";
import { TGateways, TGatewaysInsert, TGatewaysUpdate } from "@app/db/schemas/gateways";
import { TGatewaysV2, TGatewaysV2Insert, TGatewaysV2Update } from "@app/db/schemas/gateways-v2";
import { TGitAppInstallSessions, TGitAppInstallSessionsInsert, TGitAppInstallSessionsUpdate } from "@app/db/schemas/git-app-install-sessions";
import { TGitAppOrg, TGitAppOrgInsert, TGitAppOrgUpdate } from "@app/db/schemas/git-app-org";
import { TGithubOrgSyncConfigs, TGithubOrgSyncConfigsInsert, TGithubOrgSyncConfigsUpdate } from "@app/db/schemas/github-org-sync-configs";
import { TGroups, TGroupsInsert, TGroupsUpdate } from "@app/db/schemas/groups";
import { TIdentities, TIdentitiesInsert, TIdentitiesUpdate } from "@app/db/schemas/identities";
import { TIdentityAccessTokens, TIdentityAccessTokensInsert, TIdentityAccessTokensUpdate } from "@app/db/schemas/identity-access-tokens";
import { TIdentityAlicloudAuths, TIdentityAlicloudAuthsInsert, TIdentityAlicloudAuthsUpdate } from "@app/db/schemas/identity-alicloud-auths";
import { TIdentityAwsAuths, TIdentityAwsAuthsInsert, TIdentityAwsAuthsUpdate } from "@app/db/schemas/identity-aws-auths";
import { TIdentityAzureAuths, TIdentityAzureAuthsInsert, TIdentityAzureAuthsUpdate } from "@app/db/schemas/identity-azure-auths";
import { TIdentityGcpAuths, TIdentityGcpAuthsInsert, TIdentityGcpAuthsUpdate } from "@app/db/schemas/identity-gcp-auths";
import { TIdentityGroupMembership, TIdentityGroupMembershipInsert, TIdentityGroupMembershipUpdate } from "@app/db/schemas/identity-group-membership";
import { TIdentityJwtAuths, TIdentityJwtAuthsInsert, TIdentityJwtAuthsUpdate } from "@app/db/schemas/identity-jwt-auths";
import { TIdentityKubernetesAuths, TIdentityKubernetesAuthsInsert, TIdentityKubernetesAuthsUpdate } from "@app/db/schemas/identity-kubernetes-auths";
import { TIdentityMetadata, TIdentityMetadataInsert, TIdentityMetadataUpdate } from "@app/db/schemas/identity-metadata";
import { TIdentityOciAuths, TIdentityOciAuthsInsert, TIdentityOciAuthsUpdate } from "@app/db/schemas/identity-oci-auths";
import { TIdentityOidcAuths, TIdentityOidcAuthsInsert, TIdentityOidcAuthsUpdate } from "@app/db/schemas/identity-oidc-auths";
import { TIdentityTlsCertAuths, TIdentityTlsCertAuthsInsert, TIdentityTlsCertAuthsUpdate } from "@app/db/schemas/identity-tls-cert-auths";
import { TIdentityTokenAuths, TIdentityTokenAuthsInsert, TIdentityTokenAuthsUpdate } from "@app/db/schemas/identity-token-auths";
import { TIdentityUaClientSecrets, TIdentityUaClientSecretsInsert, TIdentityUaClientSecretsUpdate } from "@app/db/schemas/identity-ua-client-secrets";
import { TIdentityUniversalAuths, TIdentityUniversalAuthsInsert, TIdentityUniversalAuthsUpdate } from "@app/db/schemas/identity-universal-auths";
import { TIncidentContacts, TIncidentContactsInsert, TIncidentContactsUpdate } from "@app/db/schemas/incident-contacts";
import { TInstanceRelayConfig, TInstanceRelayConfigInsert, TInstanceRelayConfigUpdate } from "@app/db/schemas/instance-relay-config";
import { TIntegrationAuths, TIntegrationAuthsInsert, TIntegrationAuthsUpdate } from "@app/db/schemas/integration-auths";
import { TIntegrations, TIntegrationsInsert, TIntegrationsUpdate } from "@app/db/schemas/integrations";
import { TInternalCertificateAuthorities, TInternalCertificateAuthoritiesInsert, TInternalCertificateAuthoritiesUpdate } from "@app/db/schemas/internal-certificate-authorities";
import { TInternalKms, TInternalKmsInsert, TInternalKmsUpdate } from "@app/db/schemas/internal-kms";
import { TKeyValueStore, TKeyValueStoreInsert, TKeyValueStoreUpdate } from "@app/db/schemas/key-value-store";
import { TKmipClientCertificates, TKmipClientCertificatesInsert, TKmipClientCertificatesUpdate } from "@app/db/schemas/kmip-client-certificates";
import { TKmipClients, TKmipClientsInsert, TKmipClientsUpdate } from "@app/db/schemas/kmip-clients";
import { TKmipOrgConfigs, TKmipOrgConfigsInsert, TKmipOrgConfigsUpdate } from "@app/db/schemas/kmip-org-configs";
import { TKmipOrgServerCertificates, TKmipOrgServerCertificatesInsert, TKmipOrgServerCertificatesUpdate } from "@app/db/schemas/kmip-org-server-certificates";
import { TKmsKeyVersions, TKmsKeyVersionsInsert, TKmsKeyVersionsUpdate } from "@app/db/schemas/kms-key-versions";
import { TKmsKeys, TKmsKeysInsert, TKmsKeysUpdate } from "@app/db/schemas/kms-keys";
import { TKmsRootConfig, TKmsRootConfigInsert, TKmsRootConfigUpdate } from "@app/db/schemas/kms-root-config";
import { TLdapConfigs, TLdapConfigsInsert, TLdapConfigsUpdate } from "@app/db/schemas/ldap-configs";
import { TLdapGroupMaps, TLdapGroupMapsInsert, TLdapGroupMapsUpdate } from "@app/db/schemas/ldap-group-maps";
import { TMembershipRoles, TMembershipRolesInsert, TMembershipRolesUpdate } from "@app/db/schemas/membership-roles";
import { TMemberships, TMembershipsInsert, TMembershipsUpdate } from "@app/db/schemas/memberships";
import { TableName } from "@app/db/schemas/models";
import { TNamespaces, TNamespacesInsert, TNamespacesUpdate } from "@app/db/schemas/namespaces";
import { TOidcConfigs, TOidcConfigsInsert, TOidcConfigsUpdate } from "@app/db/schemas/oidc-configs";
import { TOrgBots, TOrgBotsInsert, TOrgBotsUpdate } from "@app/db/schemas/org-bots";
import { TOrgGatewayConfig, TOrgGatewayConfigInsert, TOrgGatewayConfigUpdate } from "@app/db/schemas/org-gateway-config";
import { TOrgGatewayConfigV2, TOrgGatewayConfigV2Insert, TOrgGatewayConfigV2Update } from "@app/db/schemas/org-gateway-config-v2";
import { TOrgRelayConfig, TOrgRelayConfigInsert, TOrgRelayConfigUpdate } from "@app/db/schemas/org-relay-config";
import { TOrganizationAssets, TOrganizationAssetsInsert, TOrganizationAssetsUpdate } from "@app/db/schemas/organization-assets";
import { TOrganizations, TOrganizationsInsert, TOrganizationsUpdate } from "@app/db/schemas/organizations";
import { TPkiAcmeAccounts, TPkiAcmeAccountsInsert, TPkiAcmeAccountsUpdate } from "@app/db/schemas/pki-acme-accounts";
import { TPkiAcmeAuths, TPkiAcmeAuthsInsert, TPkiAcmeAuthsUpdate } from "@app/db/schemas/pki-acme-auths";
import { TPkiAcmeChallenges, TPkiAcmeChallengesInsert, TPkiAcmeChallengesUpdate } from "@app/db/schemas/pki-acme-challenges";
import { TPkiAcmeEnrollmentConfigs, TPkiAcmeEnrollmentConfigsInsert, TPkiAcmeEnrollmentConfigsUpdate } from "@app/db/schemas/pki-acme-enrollment-configs";
import { TPkiAcmeOrderAuths, TPkiAcmeOrderAuthsInsert, TPkiAcmeOrderAuthsUpdate } from "@app/db/schemas/pki-acme-order-auths";
import { TPkiAcmeOrders, TPkiAcmeOrdersInsert, TPkiAcmeOrdersUpdate } from "@app/db/schemas/pki-acme-orders";
import { TPkiAlertChannels, TPkiAlertChannelsInsert, TPkiAlertChannelsUpdate } from "@app/db/schemas/pki-alert-channels";
import { TPkiAlertHistory, TPkiAlertHistoryInsert, TPkiAlertHistoryUpdate } from "@app/db/schemas/pki-alert-history";
import { TPkiAlertHistoryCertificate, TPkiAlertHistoryCertificateInsert, TPkiAlertHistoryCertificateUpdate } from "@app/db/schemas/pki-alert-history-certificate";
import { TPkiAlerts, TPkiAlertsInsert, TPkiAlertsUpdate } from "@app/db/schemas/pki-alerts";
import { TPkiAlertsV2, TPkiAlertsV2Insert, TPkiAlertsV2Update } from "@app/db/schemas/pki-alerts-v2";
import { TPkiApiEnrollmentConfigs, TPkiApiEnrollmentConfigsInsert, TPkiApiEnrollmentConfigsUpdate } from "@app/db/schemas/pki-api-enrollment-configs";
import { TPkiCertificatePolicies, TPkiCertificatePoliciesInsert, TPkiCertificatePoliciesUpdate } from "@app/db/schemas/pki-certificate-policies";
import { TPkiCertificateProfiles, TPkiCertificateProfilesInsert, TPkiCertificateProfilesUpdate } from "@app/db/schemas/pki-certificate-profiles";
import { TPkiCertificateTemplatesV2, TPkiCertificateTemplatesV2Insert, TPkiCertificateTemplatesV2Update } from "@app/db/schemas/pki-certificate-templates-v2";
import { TPkiCollectionItems, TPkiCollectionItemsInsert, TPkiCollectionItemsUpdate } from "@app/db/schemas/pki-collection-items";
import { TPkiCollections, TPkiCollectionsInsert, TPkiCollectionsUpdate } from "@app/db/schemas/pki-collections";
import { TPkiEstEnrollmentConfigs, TPkiEstEnrollmentConfigsInsert, TPkiEstEnrollmentConfigsUpdate } from "@app/db/schemas/pki-est-enrollment-configs";
import { TPkiSubscribers, TPkiSubscribersInsert, TPkiSubscribersUpdate } from "@app/db/schemas/pki-subscribers";
import { TPkiSyncs, TPkiSyncsInsert, TPkiSyncsUpdate } from "@app/db/schemas/pki-syncs";
import { TProjectBots, TProjectBotsInsert, TProjectBotsUpdate } from "@app/db/schemas/project-bots";
import { TProjectEnvironments, TProjectEnvironmentsInsert, TProjectEnvironmentsUpdate } from "@app/db/schemas/project-environments";
import { TProjectGateways, TProjectGatewaysInsert, TProjectGatewaysUpdate } from "@app/db/schemas/project-gateways";
import { TProjectKeys, TProjectKeysInsert, TProjectKeysUpdate } from "@app/db/schemas/project-keys";
import { TProjectSlackConfigs, TProjectSlackConfigsInsert, TProjectSlackConfigsUpdate } from "@app/db/schemas/project-slack-configs";
import { TProjectSplitBackfillIds, TProjectSplitBackfillIdsInsert, TProjectSplitBackfillIdsUpdate } from "@app/db/schemas/project-split-backfill-ids";
import { TProjectSshConfigs, TProjectSshConfigsInsert, TProjectSshConfigsUpdate } from "@app/db/schemas/project-ssh-configs";
import { TProjectTemplateGroupMemberships, TProjectTemplateGroupMembershipsInsert, TProjectTemplateGroupMembershipsUpdate } from "@app/db/schemas/project-template-group-memberships";
import { TProjectTemplateUserMemberships, TProjectTemplateUserMembershipsInsert, TProjectTemplateUserMembershipsUpdate } from "@app/db/schemas/project-template-user-memberships";
import { TProjectTemplates, TProjectTemplatesInsert, TProjectTemplatesUpdate } from "@app/db/schemas/project-templates";
import { TProjects, TProjectsInsert, TProjectsUpdate } from "@app/db/schemas/projects";
import { TRateLimit, TRateLimitInsert, TRateLimitUpdate } from "@app/db/schemas/rate-limit";
import { TRelays, TRelaysInsert, TRelaysUpdate } from "@app/db/schemas/relays";
import { TResourceMetadata, TResourceMetadataInsert, TResourceMetadataUpdate } from "@app/db/schemas/resource-metadata";
import { TRoles, TRolesInsert, TRolesUpdate } from "@app/db/schemas/roles";
import { TSamlConfigs, TSamlConfigsInsert, TSamlConfigsUpdate } from "@app/db/schemas/saml-configs";
import { TScimEvents, TScimEventsInsert, TScimEventsUpdate } from "@app/db/schemas/scim-events";
import { TScimTokens, TScimTokensInsert, TScimTokensUpdate } from "@app/db/schemas/scim-tokens";
import { TSecretApprovalPolicies, TSecretApprovalPoliciesInsert, TSecretApprovalPoliciesUpdate } from "@app/db/schemas/secret-approval-policies";
import { TSecretApprovalPoliciesApprovers, TSecretApprovalPoliciesApproversInsert, TSecretApprovalPoliciesApproversUpdate } from "@app/db/schemas/secret-approval-policies-approvers";
import { TSecretApprovalPoliciesBypassers, TSecretApprovalPoliciesBypassersInsert, TSecretApprovalPoliciesBypassersUpdate } from "@app/db/schemas/secret-approval-policies-bypassers";
import { TSecretApprovalRequestSecretTags, TSecretApprovalRequestSecretTagsInsert, TSecretApprovalRequestSecretTagsUpdate } from "@app/db/schemas/secret-approval-request-secret-tags";
import { TSecretApprovalRequestSecretTagsV2, TSecretApprovalRequestSecretTagsV2Insert, TSecretApprovalRequestSecretTagsV2Update } from "@app/db/schemas/secret-approval-request-secret-tags-v2";
import { TSecretApprovalRequests, TSecretApprovalRequestsInsert, TSecretApprovalRequestsUpdate } from "@app/db/schemas/secret-approval-requests";
import { TSecretApprovalRequestsReviewers, TSecretApprovalRequestsReviewersInsert, TSecretApprovalRequestsReviewersUpdate } from "@app/db/schemas/secret-approval-requests-reviewers";
import { TSecretApprovalRequestsSecrets, TSecretApprovalRequestsSecretsInsert, TSecretApprovalRequestsSecretsUpdate } from "@app/db/schemas/secret-approval-requests-secrets";
import { TSecretApprovalRequestsSecretsV2, TSecretApprovalRequestsSecretsV2Insert, TSecretApprovalRequestsSecretsV2Update } from "@app/db/schemas/secret-approval-requests-secrets-v2";
import { TSecretBlindIndexes, TSecretBlindIndexesInsert, TSecretBlindIndexesUpdate } from "@app/db/schemas/secret-blind-indexes";
import { TSecretFolderVersions, TSecretFolderVersionsInsert, TSecretFolderVersionsUpdate } from "@app/db/schemas/secret-folder-versions";
import { TSecretFolders, TSecretFoldersInsert, TSecretFoldersUpdate } from "@app/db/schemas/secret-folders";
import { TSecretImports, TSecretImportsInsert, TSecretImportsUpdate } from "@app/db/schemas/secret-imports";
import { TSecretReferences, TSecretReferencesInsert, TSecretReferencesUpdate } from "@app/db/schemas/secret-references";
import { TSecretReferencesV2, TSecretReferencesV2Insert, TSecretReferencesV2Update } from "@app/db/schemas/secret-references-v2";
import { TSecretRotationOutputV2, TSecretRotationOutputV2Insert, TSecretRotationOutputV2Update } from "@app/db/schemas/secret-rotation-output-v2";
import { TSecretRotationOutputs, TSecretRotationOutputsInsert, TSecretRotationOutputsUpdate } from "@app/db/schemas/secret-rotation-outputs";
import { TSecretRotationV2SecretMappings, TSecretRotationV2SecretMappingsInsert, TSecretRotationV2SecretMappingsUpdate } from "@app/db/schemas/secret-rotation-v2-secret-mappings";
import { TSecretRotations, TSecretRotationsInsert, TSecretRotationsUpdate } from "@app/db/schemas/secret-rotations";
import { TSecretRotationsV2, TSecretRotationsV2Insert, TSecretRotationsV2Update } from "@app/db/schemas/secret-rotations-v2";
import { TSecretScanningConfigs, TSecretScanningConfigsInsert, TSecretScanningConfigsUpdate } from "@app/db/schemas/secret-scanning-configs";
import { TSecretScanningDataSources, TSecretScanningDataSourcesInsert, TSecretScanningDataSourcesUpdate } from "@app/db/schemas/secret-scanning-data-sources";
import { TSecretScanningFindings, TSecretScanningFindingsInsert, TSecretScanningFindingsUpdate } from "@app/db/schemas/secret-scanning-findings";
import { TSecretScanningGitRisks, TSecretScanningGitRisksInsert, TSecretScanningGitRisksUpdate } from "@app/db/schemas/secret-scanning-git-risks";
import { TSecretScanningResources, TSecretScanningResourcesInsert, TSecretScanningResourcesUpdate } from "@app/db/schemas/secret-scanning-resources";
import { TSecretScanningScans, TSecretScanningScansInsert, TSecretScanningScansUpdate } from "@app/db/schemas/secret-scanning-scans";
import { TSecretSharing, TSecretSharingInsert, TSecretSharingUpdate } from "@app/db/schemas/secret-sharing";
import { TSecretSnapshotFolders, TSecretSnapshotFoldersInsert, TSecretSnapshotFoldersUpdate } from "@app/db/schemas/secret-snapshot-folders";
import { TSecretSnapshotSecrets, TSecretSnapshotSecretsInsert, TSecretSnapshotSecretsUpdate } from "@app/db/schemas/secret-snapshot-secrets";
import { TSecretSnapshotSecretsV2, TSecretSnapshotSecretsV2Insert, TSecretSnapshotSecretsV2Update } from "@app/db/schemas/secret-snapshot-secrets-v2";
import { TSecretSnapshots, TSecretSnapshotsInsert, TSecretSnapshotsUpdate } from "@app/db/schemas/secret-snapshots";
import { TSecretSyncs, TSecretSyncsInsert, TSecretSyncsUpdate } from "@app/db/schemas/secret-syncs";
import { TSecretTagJunction, TSecretTagJunctionInsert, TSecretTagJunctionUpdate } from "@app/db/schemas/secret-tag-junction";
import { TSecretTags, TSecretTagsInsert, TSecretTagsUpdate } from "@app/db/schemas/secret-tags";
import { TSecretV2TagJunction, TSecretV2TagJunctionInsert, TSecretV2TagJunctionUpdate } from "@app/db/schemas/secret-v2-tag-junction";
import { TSecretVersionTagJunction, TSecretVersionTagJunctionInsert, TSecretVersionTagJunctionUpdate } from "@app/db/schemas/secret-version-tag-junction";
import { TSecretVersionV2TagJunction, TSecretVersionV2TagJunctionInsert, TSecretVersionV2TagJunctionUpdate } from "@app/db/schemas/secret-version-v2-tag-junction";
import { TSecretVersions, TSecretVersionsInsert, TSecretVersionsUpdate } from "@app/db/schemas/secret-versions";
import { TSecretVersionsV2, TSecretVersionsV2Insert, TSecretVersionsV2Update } from "@app/db/schemas/secret-versions-v2";
import { TSecrets, TSecretsInsert, TSecretsUpdate } from "@app/db/schemas/secrets";
import { TSecretsV2, TSecretsV2Insert, TSecretsV2Update } from "@app/db/schemas/secrets-v2";
import { TServiceTokens, TServiceTokensInsert, TServiceTokensUpdate } from "@app/db/schemas/service-tokens";
import { TSlackIntegrations, TSlackIntegrationsInsert, TSlackIntegrationsUpdate } from "@app/db/schemas/slack-integrations";
import { TSshCertificateAuthorities, TSshCertificateAuthoritiesInsert, TSshCertificateAuthoritiesUpdate } from "@app/db/schemas/ssh-certificate-authorities";
import { TSshCertificateAuthoritySecrets, TSshCertificateAuthoritySecretsInsert, TSshCertificateAuthoritySecretsUpdate } from "@app/db/schemas/ssh-certificate-authority-secrets";
import { TSshCertificateBodies, TSshCertificateBodiesInsert, TSshCertificateBodiesUpdate } from "@app/db/schemas/ssh-certificate-bodies";
import { TSshCertificateTemplates, TSshCertificateTemplatesInsert, TSshCertificateTemplatesUpdate } from "@app/db/schemas/ssh-certificate-templates";
import { TSshCertificates, TSshCertificatesInsert, TSshCertificatesUpdate } from "@app/db/schemas/ssh-certificates";
import { TSshHostGroupMemberships, TSshHostGroupMembershipsInsert, TSshHostGroupMembershipsUpdate } from "@app/db/schemas/ssh-host-group-memberships";
import { TSshHostGroups, TSshHostGroupsInsert, TSshHostGroupsUpdate } from "@app/db/schemas/ssh-host-groups";
import { TSshHostLoginUserMappings, TSshHostLoginUserMappingsInsert, TSshHostLoginUserMappingsUpdate } from "@app/db/schemas/ssh-host-login-user-mappings";
import { TSshHostLoginUsers, TSshHostLoginUsersInsert, TSshHostLoginUsersUpdate } from "@app/db/schemas/ssh-host-login-users";
import { TSshHosts, TSshHostsInsert, TSshHostsUpdate } from "@app/db/schemas/ssh-hosts";
import { TSuperAdmin, TSuperAdminInsert, TSuperAdminUpdate } from "@app/db/schemas/super-admin";
import { TTotpConfigs, TTotpConfigsInsert, TTotpConfigsUpdate } from "@app/db/schemas/totp-configs";
import { TTrustedIps, TTrustedIpsInsert, TTrustedIpsUpdate } from "@app/db/schemas/trusted-ips";
import { TUserActions, TUserActionsInsert, TUserActionsUpdate } from "@app/db/schemas/user-actions";
import { TUserAliases, TUserAliasesInsert, TUserAliasesUpdate } from "@app/db/schemas/user-aliases";
import { TUserEncryptionKeys, TUserEncryptionKeysInsert, TUserEncryptionKeysUpdate } from "@app/db/schemas/user-encryption-keys";
import { TUserGroupMembership, TUserGroupMembershipInsert, TUserGroupMembershipUpdate } from "@app/db/schemas/user-group-membership";
import { TUsers, TUsersInsert, TUsersUpdate } from "@app/db/schemas/users";
import { TVaultExternalMigrationConfigs, TVaultExternalMigrationConfigsInsert, TVaultExternalMigrationConfigsUpdate } from "@app/db/schemas/vault-external-migration-configs";
import { TWebauthnCredentials, TWebauthnCredentialsInsert, TWebauthnCredentialsUpdate } from "@app/db/schemas/webauthn-credentials";
import { TWebhooks, TWebhooksInsert, TWebhooksUpdate } from "@app/db/schemas/webhooks";
import { TWorkflowIntegrations, TWorkflowIntegrationsInsert, TWorkflowIntegrationsUpdate } from "@app/db/schemas/workflow-integrations";
import {
  TAccessApprovalPoliciesEnvironments,
  TAccessApprovalPoliciesEnvironmentsInsert,
  TAccessApprovalPoliciesEnvironmentsUpdate
} from "@app/db/schemas/access-approval-policies-environments";
import {
  TCertificateRequests,
  TCertificateRequestsInsert,
  TCertificateRequestsUpdate
} from "@app/db/schemas/certificate-requests";
import {
  TIdentityAuthTemplates,
  TIdentityAuthTemplatesInsert,
  TIdentityAuthTemplatesUpdate
} from "@app/db/schemas/identity-auth-templates";
import {
  TIdentityLdapAuths,
  TIdentityLdapAuthsInsert,
  TIdentityLdapAuthsUpdate
} from "@app/db/schemas/identity-ldap-auths";
import {
  TMicrosoftTeamsIntegrations,
  TMicrosoftTeamsIntegrationsInsert,
  TMicrosoftTeamsIntegrationsUpdate
} from "@app/db/schemas/microsoft-teams-integrations";
import { TPamAccounts, TPamAccountsInsert, TPamAccountsUpdate } from "@app/db/schemas/pam-accounts";
import { TPamFolders, TPamFoldersInsert, TPamFoldersUpdate } from "@app/db/schemas/pam-folders";
import { TPamResources, TPamResourcesInsert, TPamResourcesUpdate } from "@app/db/schemas/pam-resources";
import { TPamSessions, TPamSessionsInsert, TPamSessionsUpdate } from "@app/db/schemas/pam-sessions";
import {
  TProjectMicrosoftTeamsConfigs,
  TProjectMicrosoftTeamsConfigsInsert,
  TProjectMicrosoftTeamsConfigsUpdate
} from "@app/db/schemas/project-microsoft-teams-configs";
import { TReminders, TRemindersInsert, TRemindersUpdate } from "@app/db/schemas/reminders";
import {
  TRemindersRecipients,
  TRemindersRecipientsInsert,
  TRemindersRecipientsUpdate
} from "@app/db/schemas/reminders-recipients";
import {
  TSecretApprovalPoliciesEnvironments,
  TSecretApprovalPoliciesEnvironmentsInsert,
  TSecretApprovalPoliciesEnvironmentsUpdate
} from "@app/db/schemas/secret-approval-policies-environments";
import {
  TSecretReminderRecipients,
  TSecretReminderRecipientsInsert,
  TSecretReminderRecipientsUpdate
} from "@app/db/schemas/secret-reminder-recipients";
import {
  TUserNotifications,
  TUserNotificationsInsert,
  TUserNotificationsUpdate
} from "@app/db/schemas/user-notifications";

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
    [TableName.SshHostGroup]: KnexOriginal.CompositeTableType<
      TSshHostGroups,
      TSshHostGroupsInsert,
      TSshHostGroupsUpdate
    >;
    [TableName.SshHostGroupMembership]: KnexOriginal.CompositeTableType<
      TSshHostGroupMemberships,
      TSshHostGroupMembershipsInsert,
      TSshHostGroupMembershipsUpdate
    >;
    [TableName.SshHost]: KnexOriginal.CompositeTableType<TSshHosts, TSshHostsInsert, TSshHostsUpdate>;
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
    [TableName.SshHostLoginUser]: KnexOriginal.CompositeTableType<
      TSshHostLoginUsers,
      TSshHostLoginUsersInsert,
      TSshHostLoginUsersUpdate
    >;
    [TableName.SshHostLoginUserMapping]: KnexOriginal.CompositeTableType<
      TSshHostLoginUserMappings,
      TSshHostLoginUserMappingsInsert,
      TSshHostLoginUserMappingsUpdate
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
    [TableName.InternalCertificateAuthority]: KnexOriginal.CompositeTableType<
      TInternalCertificateAuthorities,
      TInternalCertificateAuthoritiesInsert,
      TInternalCertificateAuthoritiesUpdate
    >;
    [TableName.ExternalCertificateAuthority]: KnexOriginal.CompositeTableType<
      TExternalCertificateAuthorities,
      TExternalCertificateAuthoritiesInsert,
      TExternalCertificateAuthoritiesUpdate
    >;
    [TableName.Certificate]: KnexOriginal.CompositeTableType<TCertificates, TCertificatesInsert, TCertificatesUpdate>;
    [TableName.CertificateRequests]: KnexOriginal.CompositeTableType<
      TCertificateRequests,
      TCertificateRequestsInsert,
      TCertificateRequestsUpdate
    >;
    [TableName.CertificateTemplate]: KnexOriginal.CompositeTableType<
      TCertificateTemplates,
      TCertificateTemplatesInsert,
      TCertificateTemplatesUpdate
    >;
    [TableName.PkiCertificateTemplateV2]: KnexOriginal.CompositeTableType<
      TPkiCertificateTemplatesV2,
      TPkiCertificateTemplatesV2Insert,
      TPkiCertificateTemplatesV2Update
    >;
    [TableName.PkiCertificateProfile]: KnexOriginal.CompositeTableType<
      TPkiCertificateProfiles,
      TPkiCertificateProfilesInsert,
      TPkiCertificateProfilesUpdate
    >;
    [TableName.PkiEstEnrollmentConfig]: KnexOriginal.CompositeTableType<
      TPkiEstEnrollmentConfigs,
      TPkiEstEnrollmentConfigsInsert,
      TPkiEstEnrollmentConfigsUpdate
    >;
    [TableName.PkiApiEnrollmentConfig]: KnexOriginal.CompositeTableType<
      TPkiApiEnrollmentConfigs,
      TPkiApiEnrollmentConfigsInsert,
      TPkiApiEnrollmentConfigsUpdate
    >;
    [TableName.PkiAcmeEnrollmentConfig]: KnexOriginal.CompositeTableType<
      TPkiAcmeEnrollmentConfigs,
      TPkiAcmeEnrollmentConfigsInsert,
      TPkiAcmeEnrollmentConfigsUpdate
    >;
    [TableName.PkiAcmeAccount]: KnexOriginal.CompositeTableType<
      TPkiAcmeAccounts,
      TPkiAcmeAccountsInsert,
      TPkiAcmeAccountsUpdate
    >;
    [TableName.PkiAcmeOrder]: KnexOriginal.CompositeTableType<
      TPkiAcmeOrders,
      TPkiAcmeOrdersInsert,
      TPkiAcmeOrdersUpdate
    >;
    [TableName.PkiAcmeAuth]: KnexOriginal.CompositeTableType<TPkiAcmeAuths, TPkiAcmeAuthsInsert, TPkiAcmeAuthsUpdate>;
    [TableName.PkiAcmeOrderAuth]: KnexOriginal.CompositeTableType<
      TPkiAcmeOrderAuths,
      TPkiAcmeOrderAuthsInsert,
      TPkiAcmeOrderAuthsUpdate
    >;
    [TableName.PkiAcmeChallenge]: KnexOriginal.CompositeTableType<
      TPkiAcmeChallenges,
      TPkiAcmeChallengesInsert,
      TPkiAcmeChallengesUpdate
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
    [TableName.PkiAlertsV2]: KnexOriginal.CompositeTableType<TPkiAlertsV2, TPkiAlertsV2Insert, TPkiAlertsV2Update>;
    [TableName.PkiAlertChannels]: KnexOriginal.CompositeTableType<
      TPkiAlertChannels,
      TPkiAlertChannelsInsert,
      TPkiAlertChannelsUpdate
    >;
    [TableName.PkiAlertHistory]: KnexOriginal.CompositeTableType<
      TPkiAlertHistory,
      TPkiAlertHistoryInsert,
      TPkiAlertHistoryUpdate
    >;
    [TableName.PkiAlertHistoryCertificate]: KnexOriginal.CompositeTableType<
      TPkiAlertHistoryCertificate,
      TPkiAlertHistoryCertificateInsert,
      TPkiAlertHistoryCertificateUpdate
    >;
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
    [TableName.PkiSubscriber]: KnexOriginal.CompositeTableType<
      TPkiSubscribers,
      TPkiSubscribersInsert,
      TPkiSubscribersUpdate
    >;
    [TableName.PkiSync]: KnexOriginal.CompositeTableType<TPkiSyncs, TPkiSyncsInsert, TPkiSyncsUpdate>;
    [TableName.CertificateSync]: KnexOriginal.CompositeTableType<
      TCertificateSyncs,
      TCertificateSyncsInsert,
      TCertificateSyncsUpdate
    >;
    [TableName.UserGroupMembership]: KnexOriginal.CompositeTableType<
      TUserGroupMembership,
      TUserGroupMembershipInsert,
      TUserGroupMembershipUpdate
    >;
    [TableName.IdentityGroupMembership]: KnexOriginal.CompositeTableType<
      TIdentityGroupMembership,
      TIdentityGroupMembershipInsert,
      TIdentityGroupMembershipUpdate
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
    [TableName.IncidentContact]: KnexOriginal.CompositeTableType<
      TIncidentContacts,
      TIncidentContactsInsert,
      TIncidentContactsUpdate
    >;
    [TableName.UserAction]: KnexOriginal.CompositeTableType<TUserActions, TUserActionsInsert, TUserActionsUpdate>;
    [TableName.SuperAdmin]: KnexOriginal.CompositeTableType<TSuperAdmin, TSuperAdminInsert, TSuperAdminUpdate>;
    [TableName.ApiKey]: KnexOriginal.CompositeTableType<TApiKeys, TApiKeysInsert, TApiKeysUpdate>;
    [TableName.Project]: KnexOriginal.CompositeTableType<TProjects, TProjectsInsert, TProjectsUpdate>;
    [TableName.ProjectSshConfig]: KnexOriginal.CompositeTableType<
      TProjectSshConfigs,
      TProjectSshConfigsInsert,
      TProjectSshConfigsUpdate
    >;
    [TableName.Environment]: KnexOriginal.CompositeTableType<
      TProjectEnvironments,
      TProjectEnvironmentsInsert,
      TProjectEnvironmentsUpdate
    >;
    [TableName.ProjectBot]: KnexOriginal.CompositeTableType<TProjectBots, TProjectBotsInsert, TProjectBotsUpdate>;
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
    [TableName.IdentityAliCloudAuth]: KnexOriginal.CompositeTableType<
      TIdentityAlicloudAuths,
      TIdentityAlicloudAuthsInsert,
      TIdentityAlicloudAuthsUpdate
    >;
    [TableName.IdentityTlsCertAuth]: KnexOriginal.CompositeTableType<
      TIdentityTlsCertAuths,
      TIdentityTlsCertAuthsInsert,
      TIdentityTlsCertAuthsUpdate
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
    [TableName.IdentityOciAuth]: KnexOriginal.CompositeTableType<
      TIdentityOciAuths,
      TIdentityOciAuthsInsert,
      TIdentityOciAuthsUpdate
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
    [TableName.IdentityLdapAuth]: KnexOriginal.CompositeTableType<
      TIdentityLdapAuths,
      TIdentityLdapAuthsInsert,
      TIdentityLdapAuthsUpdate
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
    [TableName.IdentityAuthTemplate]: KnexOriginal.CompositeTableType<
      TIdentityAuthTemplates,
      TIdentityAuthTemplatesInsert,
      TIdentityAuthTemplatesUpdate
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

    [TableName.AccessApprovalPolicyBypasser]: KnexOriginal.CompositeTableType<
      TAccessApprovalPoliciesBypassers,
      TAccessApprovalPoliciesBypassersInsert,
      TAccessApprovalPoliciesBypassersUpdate
    >;

    [TableName.AccessApprovalPolicyEnvironment]: KnexOriginal.CompositeTableType<
      TAccessApprovalPoliciesEnvironments,
      TAccessApprovalPoliciesEnvironmentsInsert,
      TAccessApprovalPoliciesEnvironmentsUpdate
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
    [TableName.ScimEvents]: KnexOriginal.CompositeTableType<TScimEvents, TScimEventsInsert, TScimEventsUpdate>;
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
    [TableName.SecretApprovalPolicyBypasser]: KnexOriginal.CompositeTableType<
      TSecretApprovalPoliciesBypassers,
      TSecretApprovalPoliciesBypassersInsert,
      TSecretApprovalPoliciesBypassersUpdate
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
    [TableName.SecretApprovalPolicyEnvironment]: KnexOriginal.CompositeTableType<
      TSecretApprovalPoliciesEnvironments,
      TSecretApprovalPoliciesEnvironmentsInsert,
      TSecretApprovalPoliciesEnvironmentsUpdate
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
    [TableName.ProjectTemplateUserMembership]: KnexOriginal.CompositeTableType<
      TProjectTemplateUserMemberships,
      TProjectTemplateUserMembershipsInsert,
      TProjectTemplateUserMembershipsUpdate
    >;
    [TableName.ProjectTemplateGroupMembership]: KnexOriginal.CompositeTableType<
      TProjectTemplateGroupMemberships,
      TProjectTemplateGroupMembershipsInsert,
      TProjectTemplateGroupMembershipsUpdate
    >;
    [TableName.TotpConfig]: KnexOriginal.CompositeTableType<TTotpConfigs, TTotpConfigsInsert, TTotpConfigsUpdate>;
    [TableName.ProjectSplitBackfillIds]: KnexOriginal.CompositeTableType<
      TProjectSplitBackfillIds,
      TProjectSplitBackfillIdsInsert,
      TProjectSplitBackfillIdsUpdate
    >;
    [TableName.ResourceMetadata]: KnexOriginal.CompositeTableType<
      TResourceMetadata,
      TResourceMetadataInsert,
      TResourceMetadataUpdate
    >;
    [TableName.AppConnection]: KnexOriginal.CompositeTableType<
      TAppConnections,
      TAppConnectionsInsert,
      TAppConnectionsUpdate
    >;
    [TableName.SecretSync]: KnexOriginal.CompositeTableType<TSecretSyncs, TSecretSyncsInsert, TSecretSyncsUpdate>;
    [TableName.KmipClient]: KnexOriginal.CompositeTableType<TKmipClients, TKmipClientsInsert, TKmipClientsUpdate>;
    [TableName.KmipOrgConfig]: KnexOriginal.CompositeTableType<
      TKmipOrgConfigs,
      TKmipOrgConfigsInsert,
      TKmipOrgConfigsUpdate
    >;
    [TableName.KmipOrgServerCertificates]: KnexOriginal.CompositeTableType<
      TKmipOrgServerCertificates,
      TKmipOrgServerCertificatesInsert,
      TKmipOrgServerCertificatesUpdate
    >;
    [TableName.KmipClientCertificates]: KnexOriginal.CompositeTableType<
      TKmipClientCertificates,
      TKmipClientCertificatesInsert,
      TKmipClientCertificatesUpdate
    >;
    [TableName.Gateway]: KnexOriginal.CompositeTableType<TGateways, TGatewaysInsert, TGatewaysUpdate>;
    [TableName.ProjectGateway]: KnexOriginal.CompositeTableType<
      TProjectGateways,
      TProjectGatewaysInsert,
      TProjectGatewaysUpdate
    >;
    [TableName.OrgGatewayConfig]: KnexOriginal.CompositeTableType<
      TOrgGatewayConfig,
      TOrgGatewayConfigInsert,
      TOrgGatewayConfigUpdate
    >;
    [TableName.SecretRotationV2]: KnexOriginal.CompositeTableType<
      TSecretRotationsV2,
      TSecretRotationsV2Insert,
      TSecretRotationsV2Update
    >;
    [TableName.SecretRotationV2SecretMapping]: KnexOriginal.CompositeTableType<
      TSecretRotationV2SecretMappings,
      TSecretRotationV2SecretMappingsInsert,
      TSecretRotationV2SecretMappingsUpdate
    >;
    [TableName.MicrosoftTeamsIntegrations]: KnexOriginal.CompositeTableType<
      TMicrosoftTeamsIntegrations,
      TMicrosoftTeamsIntegrationsInsert,
      TMicrosoftTeamsIntegrationsUpdate
    >;
    [TableName.ProjectMicrosoftTeamsConfigs]: KnexOriginal.CompositeTableType<
      TProjectMicrosoftTeamsConfigs,
      TProjectMicrosoftTeamsConfigsInsert,
      TProjectMicrosoftTeamsConfigsUpdate
    >;
    [TableName.SecretReminderRecipients]: KnexOriginal.CompositeTableType<
      TSecretReminderRecipients,
      TSecretReminderRecipientsInsert,
      TSecretReminderRecipientsUpdate
    >;
    [TableName.GithubOrgSyncConfig]: KnexOriginal.CompositeTableType<
      TGithubOrgSyncConfigs,
      TGithubOrgSyncConfigsInsert,
      TGithubOrgSyncConfigsUpdate
    >;
    [TableName.FolderCommit]: KnexOriginal.CompositeTableType<
      TFolderCommits,
      TFolderCommitsInsert,
      TFolderCommitsUpdate
    >;
    [TableName.FolderCommitChanges]: KnexOriginal.CompositeTableType<
      TFolderCommitChanges,
      TFolderCommitChangesInsert,
      TFolderCommitChangesUpdate
    >;
    [TableName.FolderCheckpoint]: KnexOriginal.CompositeTableType<
      TFolderCheckpoints,
      TFolderCheckpointsInsert,
      TFolderCheckpointsUpdate
    >;
    [TableName.FolderCheckpointResources]: KnexOriginal.CompositeTableType<
      TFolderCheckpointResources,
      TFolderCheckpointResourcesInsert,
      TFolderCheckpointResourcesUpdate
    >;
    [TableName.FolderTreeCheckpoint]: KnexOriginal.CompositeTableType<
      TFolderTreeCheckpoints,
      TFolderTreeCheckpointsInsert,
      TFolderTreeCheckpointsUpdate
    >;
    [TableName.FolderTreeCheckpointResources]: KnexOriginal.CompositeTableType<
      TFolderTreeCheckpointResources,
      TFolderTreeCheckpointResourcesInsert,
      TFolderTreeCheckpointResourcesUpdate
    >;
    [TableName.SecretScanningDataSource]: KnexOriginal.CompositeTableType<
      TSecretScanningDataSources,
      TSecretScanningDataSourcesInsert,
      TSecretScanningDataSourcesUpdate
    >;
    [TableName.SecretScanningResource]: KnexOriginal.CompositeTableType<
      TSecretScanningResources,
      TSecretScanningResourcesInsert,
      TSecretScanningResourcesUpdate
    >;
    [TableName.InstanceRelayConfig]: KnexOriginal.CompositeTableType<
      TInstanceRelayConfig,
      TInstanceRelayConfigInsert,
      TInstanceRelayConfigUpdate
    >;
    [TableName.OrgRelayConfig]: KnexOriginal.CompositeTableType<
      TOrgRelayConfig,
      TOrgRelayConfigInsert,
      TOrgRelayConfigUpdate
    >;
    [TableName.Relay]: KnexOriginal.CompositeTableType<TRelays, TRelaysInsert, TRelaysUpdate>;
    [TableName.SecretScanningScan]: KnexOriginal.CompositeTableType<
      TSecretScanningScans,
      TSecretScanningScansInsert,
      TSecretScanningScansUpdate
    >;
    [TableName.SecretScanningFinding]: KnexOriginal.CompositeTableType<
      TSecretScanningFindings,
      TSecretScanningFindingsInsert,
      TSecretScanningFindingsUpdate
    >;
    [TableName.SecretScanningConfig]: KnexOriginal.CompositeTableType<
      TSecretScanningConfigs,
      TSecretScanningConfigsInsert,
      TSecretScanningConfigsUpdate
    >;
    [TableName.Reminder]: KnexOriginal.CompositeTableType<TReminders, TRemindersInsert, TRemindersUpdate>;
    [TableName.ReminderRecipient]: KnexOriginal.CompositeTableType<
      TRemindersRecipients,
      TRemindersRecipientsInsert,
      TRemindersRecipientsUpdate
    >;
    [TableName.OrgGatewayConfigV2]: KnexOriginal.CompositeTableType<
      TOrgGatewayConfigV2,
      TOrgGatewayConfigV2Insert,
      TOrgGatewayConfigV2Update
    >;
    [TableName.GatewayV2]: KnexOriginal.CompositeTableType<TGatewaysV2, TGatewaysV2Insert, TGatewaysV2Update>;
    [TableName.UserNotifications]: KnexOriginal.CompositeTableType<
      TUserNotifications,
      TUserNotificationsInsert,
      TUserNotificationsUpdate
    >;
    [TableName.KeyValueStore]: KnexOriginal.CompositeTableType<
      TKeyValueStore,
      TKeyValueStoreInsert,
      TKeyValueStoreUpdate
    >;
    [TableName.PamFolder]: KnexOriginal.CompositeTableType<TPamFolders, TPamFoldersInsert, TPamFoldersUpdate>;
    [TableName.PamResource]: KnexOriginal.CompositeTableType<TPamResources, TPamResourcesInsert, TPamResourcesUpdate>;
    [TableName.PamAccount]: KnexOriginal.CompositeTableType<TPamAccounts, TPamAccountsInsert, TPamAccountsUpdate>;
    [TableName.PamSession]: KnexOriginal.CompositeTableType<TPamSessions, TPamSessionsInsert, TPamSessionsUpdate>;

    [TableName.Namespace]: KnexOriginal.CompositeTableType<TNamespaces, TNamespacesInsert, TNamespacesUpdate>;
    [TableName.Membership]: KnexOriginal.CompositeTableType<TMemberships, TMembershipsInsert, TMembershipsUpdate>;
    [TableName.MembershipRole]: KnexOriginal.CompositeTableType<
      TMembershipRoles,
      TMembershipRolesInsert,
      TMembershipRolesUpdate
    >;
    [TableName.Role]: KnexOriginal.CompositeTableType<TRoles, TRolesInsert, TRolesUpdate>;
    [TableName.AdditionalPrivilege]: KnexOriginal.CompositeTableType<
      TAdditionalPrivileges,
      TAdditionalPrivilegesInsert,
      TAdditionalPrivilegesUpdate
    >;
    [TableName.VaultExternalMigrationConfig]: KnexOriginal.CompositeTableType<
      TVaultExternalMigrationConfigs,
      TVaultExternalMigrationConfigsInsert,
      TVaultExternalMigrationConfigsUpdate
    >;
    [TableName.WebAuthnCredential]: KnexOriginal.CompositeTableType<
      TWebauthnCredentials,
      TWebauthnCredentialsInsert,
      TWebauthnCredentialsUpdate
    >;
    [TableName.AiMcpServer]: KnexOriginal.CompositeTableType<TAiMcpServers, TAiMcpServersInsert, TAiMcpServersUpdate>;
    [TableName.AiMcpServerTool]: KnexOriginal.CompositeTableType<
      TAiMcpServerTools,
      TAiMcpServerToolsInsert,
      TAiMcpServerToolsUpdate
    >;
    [TableName.AiMcpEndpoint]: KnexOriginal.CompositeTableType<
      TAiMcpEndpoints,
      TAiMcpEndpointsInsert,
      TAiMcpEndpointsUpdate
    >;
    [TableName.AiMcpEndpointServer]: KnexOriginal.CompositeTableType<
      TAiMcpEndpointServers,
      TAiMcpEndpointServersInsert,
      TAiMcpEndpointServersUpdate
    >;
    [TableName.AiMcpEndpointServerTool]: KnexOriginal.CompositeTableType<
      TAiMcpEndpointServerTools,
      TAiMcpEndpointServerToolsInsert,
      TAiMcpEndpointServerToolsUpdate
    >;
    [TableName.AiMcpServerUserCredential]: KnexOriginal.CompositeTableType<
      TAiMcpServerUserCredentials,
      TAiMcpServerUserCredentialsInsert,
      TAiMcpServerUserCredentialsUpdate
    >;
    [TableName.AiMcpActivityLog]: KnexOriginal.CompositeTableType<
      TAiMcpActivityLogs,
      TAiMcpActivityLogsInsert,
      TAiMcpActivityLogsUpdate
    >;
    [TableName.ApprovalPolicies]: KnexOriginal.CompositeTableType<
      TApprovalPolicies,
      TApprovalPoliciesInsert,
      TApprovalPoliciesUpdate
    >;
    [TableName.ApprovalPolicyStepApprovers]: KnexOriginal.CompositeTableType<
      TApprovalPolicyStepApprovers,
      TApprovalPolicyStepApproversInsert,
      TApprovalPolicyStepApproversUpdate
    >;
    [TableName.ApprovalPolicySteps]: KnexOriginal.CompositeTableType<
      TApprovalPolicySteps,
      TApprovalPolicyStepsInsert,
      TApprovalPolicyStepsUpdate
    >;
    [TableName.ApprovalRequestApprovals]: KnexOriginal.CompositeTableType<
      TApprovalRequestApprovals,
      TApprovalRequestApprovalsInsert,
      TApprovalRequestApprovalsUpdate
    >;
    [TableName.ApprovalRequestGrants]: KnexOriginal.CompositeTableType<
      TApprovalRequestGrants,
      TApprovalRequestGrantsInsert,
      TApprovalRequestGrantsUpdate
    >;
    [TableName.ApprovalRequestStepEligibleApprovers]: KnexOriginal.CompositeTableType<
      TApprovalRequestStepEligibleApprovers,
      TApprovalRequestStepEligibleApproversInsert,
      TApprovalRequestStepEligibleApproversUpdate
    >;
    [TableName.ApprovalRequestSteps]: KnexOriginal.CompositeTableType<
      TApprovalRequestSteps,
      TApprovalRequestStepsInsert,
      TApprovalRequestStepsUpdate
    >;
    [TableName.ApprovalRequests]: KnexOriginal.CompositeTableType<
      TApprovalRequests,
      TApprovalRequestsInsert,
      TApprovalRequestsUpdate
    >;
    [TableName.PkiCertificatePolicy]: KnexOriginal.CompositeTableType<
      TPkiCertificatePolicies,
      TPkiCertificatePoliciesInsert,
      TPkiCertificatePoliciesUpdate
    >;
    [TableName.OrganizationAsset]: KnexOriginal.CompositeTableType<
      TOrganizationAssets,
      TOrganizationAssetsInsert,
      TOrganizationAssetsUpdate
    >;
  }
}
