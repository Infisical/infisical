package project

import "github.com/infisical/gocasl"

// ss is a shorthand for gocasl.StringOrSlice to keep rule definitions compact.
func ss(vals ...string) gocasl.StringOrSlice { return vals }

// AdminPermissions defines the full permission set for the admin role.
// Exact port of buildAdminPermissionRules() from default-roles.ts.
var AdminPermissions = []gocasl.JSONRule{
	// SecretFolders
	{Action: ss(SecretFolderActionRead.Name(), SecretFolderActionCreate.Name(), SecretFolderActionEdit.Name(), SecretFolderActionDelete.Name()), Subject: ss(SubSecretFolders)},

	// SecretImports
	{Action: ss(SecretImportActionRead.Name(), SecretImportActionCreate.Name(), SecretImportActionEdit.Name(), SecretImportActionDelete.Name()), Subject: ss(SubSecretImports)},

	// Role
	{Action: ss(RoleActionRead.Name(), RoleActionCreate.Name(), RoleActionEdit.Name(), RoleActionDelete.Name()), Subject: ss(SubRole)},

	// Integrations
	{Action: ss(IntegrationsActionRead.Name(), IntegrationsActionCreate.Name(), IntegrationsActionEdit.Name(), IntegrationsActionDelete.Name()), Subject: ss(SubIntegrations)},

	// Webhooks
	{Action: ss(WebhooksActionRead.Name(), WebhooksActionCreate.Name(), WebhooksActionEdit.Name(), WebhooksActionDelete.Name()), Subject: ss(SubWebhooks)},

	// ServiceTokens
	{Action: ss(ServiceTokensActionRead.Name(), ServiceTokensActionCreate.Name(), ServiceTokensActionEdit.Name(), ServiceTokensActionDelete.Name()), Subject: ss(SubServiceTokens)},

	// Settings
	{Action: ss(SettingsActionRead.Name(), SettingsActionCreate.Name(), SettingsActionEdit.Name(), SettingsActionDelete.Name()), Subject: ss(SubSettings)},

	// Environments
	{Action: ss(EnvironmentsActionRead.Name(), EnvironmentsActionCreate.Name(), EnvironmentsActionEdit.Name(), EnvironmentsActionDelete.Name()), Subject: ss(SubEnvironments)},

	// Tags
	{Action: ss(TagsActionRead.Name(), TagsActionCreate.Name(), TagsActionEdit.Name(), TagsActionDelete.Name()), Subject: ss(SubTags)},

	// IpAllowList
	{Action: ss(IpAllowListActionRead.Name(), IpAllowListActionCreate.Name(), IpAllowListActionEdit.Name(), IpAllowListActionDelete.Name()), Subject: ss(SubIpAllowList)},

	// PkiAlerts
	{Action: ss(PkiAlertsActionRead.Name(), PkiAlertsActionCreate.Name(), PkiAlertsActionEdit.Name(), PkiAlertsActionDelete.Name()), Subject: ss(SubPkiAlerts)},

	// PkiCollections
	{Action: ss(PkiCollectionsActionRead.Name(), PkiCollectionsActionCreate.Name(), PkiCollectionsActionEdit.Name(), PkiCollectionsActionDelete.Name()), Subject: ss(SubPkiCollections)},

	// SshCertificateAuthorities
	{Action: ss(SshCaActionRead.Name(), SshCaActionCreate.Name(), SshCaActionEdit.Name(), SshCaActionDelete.Name()), Subject: ss(SubSshCertificateAuthorities)},

	// SshCertificates
	{Action: ss(SshCertActionRead.Name(), SshCertActionCreate.Name(), SshCertActionEdit.Name(), SshCertActionDelete.Name()), Subject: ss(SubSshCertificates)},

	// SshCertificateTemplates
	{Action: ss(SshCertTemplateActionRead.Name(), SshCertTemplateActionCreate.Name(), SshCertTemplateActionEdit.Name(), SshCertTemplateActionDelete.Name()), Subject: ss(SubSshCertificateTemplates)},

	// SshHostGroups
	{Action: ss(SshHostGroupsActionRead.Name(), SshHostGroupsActionCreate.Name(), SshHostGroupsActionEdit.Name(), SshHostGroupsActionDelete.Name()), Subject: ss(SubSshHostGroups)},

	// PamFolders
	{Action: ss(PamFoldersActionRead.Name(), PamFoldersActionCreate.Name(), PamFoldersActionEdit.Name(), PamFoldersActionDelete.Name()), Subject: ss(SubPamFolders)},

	// PamResources
	{Action: ss(PamResourceActionRead.Name(), PamResourceActionCreate.Name(), PamResourceActionEdit.Name(), PamResourceActionDelete.Name()), Subject: ss(SubPamResources)},

	// McpServers
	{Action: ss(McpServersActionRead.Name(), McpServersActionCreate.Name(), McpServersActionEdit.Name(), McpServersActionDelete.Name()), Subject: ss(SubMcpServers)},

	// McpActivityLogs
	{Action: ss(McpActivityLogsActionRead.Name()), Subject: ss(SubMcpActivityLogs)},

	// AuditLogs
	{Action: ss(AuditLogsActionRead.Name()), Subject: ss(SubAuditLogs)},

	// CertificateAuthorities
	{Action: ss(CaActionRead.Name(), CaActionCreate.Name(), CaActionEdit.Name(), CaActionDelete.Name(), CaActionIssueCACert.Name(), CaActionSignIntermediate.Name()), Subject: ss(SubCertificateAuthorities)},

	// CertificateTemplates
	{Action: ss(CertTemplateActionRead.Name(), CertTemplateActionCreate.Name(), CertTemplateActionEdit.Name(), CertTemplateActionDelete.Name(), CertTemplateActionIssueCert.Name(), CertTemplateActionListCerts.Name()), Subject: ss(SubCertificateTemplates)},

	// CertificatePolicies
	{Action: ss(CertPolicyActionRead.Name(), CertPolicyActionCreate.Name(), CertPolicyActionEdit.Name(), CertPolicyActionDelete.Name()), Subject: ss(SubCertificatePolicies)},

	// SecretApproval
	{Action: ss(SecretApprovalActionRead.Name(), SecretApprovalActionCreate.Name(), SecretApprovalActionEdit.Name(), SecretApprovalActionDelete.Name()), Subject: ss(SubSecretApproval)},

	// Certificates
	{Action: ss(CertActionRead.Name(), CertActionCreate.Name(), CertActionEdit.Name(), CertActionDelete.Name(), CertActionReadPrivateKey.Name(), CertActionImport.Name()), Subject: ss(SubCertificates)},

	// CertificateProfiles
	{Action: ss(CertProfileActionRead.Name(), CertProfileActionCreate.Name(), CertProfileActionEdit.Name(), CertProfileActionDelete.Name(), CertProfileActionIssueCert.Name(), CertProfileActionRevealAcmeEab.Name(), CertProfileActionRotateAcmeEab.Name()), Subject: ss(SubCertificateProfiles)},

	// Commits
	{Action: ss(CommitsActionRead.Name(), CommitsActionPerformRollback.Name()), Subject: ss(SubCommits)},

	// SshHosts
	{Action: ss(SshHostActionRead.Name(), SshHostActionCreate.Name(), SshHostActionEdit.Name(), SshHostActionDelete.Name(), SshHostActionIssueHostCert.Name()), Subject: ss(SubSshHosts)},

	// PkiSubscribers
	{Action: ss(PkiSubscriberActionRead.Name(), PkiSubscriberActionCreate.Name(), PkiSubscriberActionEdit.Name(), PkiSubscriberActionDelete.Name(), PkiSubscriberActionIssueCert.Name(), PkiSubscriberActionListCerts.Name()), Subject: ss(SubPkiSubscribers)},

	// Member
	{Action: ss(MemberActionRead.Name(), MemberActionCreate.Name(), MemberActionEdit.Name(), MemberActionDelete.Name(), MemberActionGrantPrivileges.Name(), MemberActionAssignRole.Name(), MemberActionAssignAdditionalPrivileges.Name(), MemberActionAssumePrivileges.Name()), Subject: ss(SubMember)},

	// Groups
	{Action: ss(GroupActionRead.Name(), GroupActionCreate.Name(), GroupActionEdit.Name(), GroupActionDelete.Name(), GroupActionGrantPrivileges.Name(), GroupActionAssignRole.Name()), Subject: ss(SubGroups)},

	// Identity
	{Action: ss(IdentityActionRead.Name(), IdentityActionCreate.Name(), IdentityActionEdit.Name(), IdentityActionDelete.Name(), IdentityActionGrantPrivileges.Name(), IdentityActionAssignRole.Name(), IdentityActionAssignAdditionalPrivileges.Name(), IdentityActionAssumePrivileges.Name(), IdentityActionGetToken.Name(), IdentityActionCreateToken.Name(), IdentityActionDeleteToken.Name(), IdentityActionRevokeAuth.Name()), Subject: ss(SubIdentity)},

	// Secrets
	{Action: ss(SecretActionDescribeAndReadValue.Name(), SecretActionDescribeSecret.Name(), SecretActionReadValue.Name(), SecretActionCreate.Name(), SecretActionEdit.Name(), SecretActionDelete.Name()), Subject: ss(SubSecrets)},

	// DynamicSecrets
	{Action: ss(DynamicSecretActionReadRootCredential.Name(), DynamicSecretActionCreateRootCredential.Name(), DynamicSecretActionEditRootCredential.Name(), DynamicSecretActionDeleteRootCredential.Name(), DynamicSecretActionLease.Name()), Subject: ss(SubDynamicSecrets)},

	// Project
	{Action: ss(ProjectActionEdit.Name(), ProjectActionDelete.Name()), Subject: ss(SubProject)},

	// SecretRollback
	{Action: ss(SecretRollbackActionRead.Name(), SecretRollbackActionCreate.Name()), Subject: ss(SubSecretRollback)},

	// Kms
	{Action: ss(KmsActionEdit.Name()), Subject: ss(SubKms)},

	// Cmek
	{Action: ss(CmekActionRead.Name(), CmekActionCreate.Name(), CmekActionEdit.Name(), CmekActionDelete.Name(), CmekActionEncrypt.Name(), CmekActionDecrypt.Name(), CmekActionSign.Name(), CmekActionVerify.Name(), CmekActionExportPrivKey.Name()), Subject: ss(SubCmek)},

	// SecretSyncs
	{Action: ss(SecretSyncActionRead.Name(), SecretSyncActionCreate.Name(), SecretSyncActionEdit.Name(), SecretSyncActionDelete.Name(), SecretSyncActionSyncSecrets.Name(), SecretSyncActionImportSecrets.Name(), SecretSyncActionRemoveSecrets.Name()), Subject: ss(SubSecretSyncs)},

	// PkiSyncs
	{Action: ss(PkiSyncActionRead.Name(), PkiSyncActionCreate.Name(), PkiSyncActionEdit.Name(), PkiSyncActionDelete.Name(), PkiSyncActionSyncCertificates.Name(), PkiSyncActionImportCertificates.Name(), PkiSyncActionRemoveCertificates.Name()), Subject: ss(SubPkiSyncs)},

	// PkiDiscovery
	{Action: ss(PkiDiscoveryActionRead.Name(), PkiDiscoveryActionCreate.Name(), PkiDiscoveryActionEdit.Name(), PkiDiscoveryActionDelete.Name(), PkiDiscoveryActionRunScan.Name()), Subject: ss(SubPkiDiscovery)},

	// PkiCertificateInstallations
	{Action: ss(PkiCertInstallActionRead.Name(), PkiCertInstallActionEdit.Name(), PkiCertInstallActionDelete.Name()), Subject: ss(SubPkiCertificateInstalls)},

	// Kmip
	{Action: ss(KmipActionCreateClients.Name(), KmipActionUpdateClients.Name(), KmipActionDeleteClients.Name(), KmipActionReadClients.Name(), KmipActionGenerateCerts.Name()), Subject: ss(SubKmip)},

	// SecretRotation
	{Action: ss(SecretRotationActionRead.Name(), SecretRotationActionCreate.Name(), SecretRotationActionEdit.Name(), SecretRotationActionDelete.Name(), SecretRotationActionReadGeneratedCreds.Name(), SecretRotationActionRotateSecrets.Name()), Subject: ss(SubSecretRotation)},

	// SecretScanningDataSources
	{Action: ss(SecretScanningDataSourceActionRead.Name(), SecretScanningDataSourceActionCreate.Name(), SecretScanningDataSourceActionEdit.Name(), SecretScanningDataSourceActionDelete.Name(), SecretScanningDataSourceActionTriggerScans.Name(), SecretScanningDataSourceActionReadScans.Name(), SecretScanningDataSourceActionReadResources.Name()), Subject: ss(SubSecretScanningDataSources)},

	// SecretScanningFindings
	{Action: ss(SecretScanningFindingActionRead.Name(), SecretScanningFindingActionUpdate.Name()), Subject: ss(SubSecretScanningFindings)},

	// SecretScanningConfigs
	{Action: ss(SecretScanningConfigActionRead.Name(), SecretScanningConfigActionUpdate.Name()), Subject: ss(SubSecretScanningConfigs)},

	// SecretEventSubscriptions
	{Action: ss(SecretEventActionSubscribeCreation.Name(), SecretEventActionSubscribeDelete.Name(), SecretEventActionSubscribeUpdate.Name(), SecretEventActionSubscribeImportMutation.Name()), Subject: ss(SubSecretEventSubscriptions)},

	// AppConnections
	{Action: ss(AppConnectionActionRead.Name(), AppConnectionActionCreate.Name(), AppConnectionActionEdit.Name(), AppConnectionActionDelete.Name(), AppConnectionActionConnect.Name(), AppConnectionActionRotateCredentials.Name()), Subject: ss(SubAppConnections)},

	// PamAccounts
	{Action: ss(PamAccountActionAccess.Name(), PamAccountActionRead.Name(), PamAccountActionCreate.Name(), PamAccountActionEdit.Name(), PamAccountActionDelete.Name()), Subject: ss(SubPamAccounts)},

	// PamSessions
	{Action: ss(PamSessionActionRead.Name()), Subject: ss(SubPamSessions)},

	// PamDiscovery
	{Action: ss(PamDiscoveryActionRead.Name(), PamDiscoveryActionCreate.Name(), PamDiscoveryActionEdit.Name(), PamDiscoveryActionDelete.Name(), PamDiscoveryActionRunScan.Name()), Subject: ss(SubPamDiscovery)},

	// McpEndpoints
	{Action: ss(McpEndpointActionRead.Name(), McpEndpointActionCreate.Name(), McpEndpointActionEdit.Name(), McpEndpointActionDelete.Name(), McpEndpointActionConnect.Name()), Subject: ss(SubMcpEndpoints)},

	// ApprovalRequests
	{Action: ss(ApprovalRequestActionRead.Name(), ApprovalRequestActionCreate.Name()), Subject: ss(SubApprovalRequests)},

	// ApprovalRequestGrants
	{Action: ss(ApprovalRequestGrantActionRead.Name(), ApprovalRequestGrantActionRevoke.Name()), Subject: ss(SubApprovalRequestGrants)},

	// SecretApprovalRequest
	{Action: ss(SecretApprovalRequestActionRead.Name()), Subject: ss(SubSecretApprovalRequest)},
}

// MemberPermissions defines the permission set for the member role.
// Exact port of buildMemberPermissionRules() from default-roles.ts.
var MemberPermissions = []gocasl.JSONRule{
	// Secrets
	{Action: ss(SecretActionDescribeAndReadValue.Name(), SecretActionDescribeSecret.Name(), SecretActionReadValue.Name(), SecretActionCreate.Name(), SecretActionEdit.Name(), SecretActionDelete.Name()), Subject: ss(SubSecrets)},

	// SecretFolders
	{Action: ss(SecretFolderActionRead.Name(), SecretFolderActionCreate.Name(), SecretFolderActionEdit.Name(), SecretFolderActionDelete.Name()), Subject: ss(SubSecretFolders)},

	// DynamicSecrets
	{Action: ss(DynamicSecretActionReadRootCredential.Name(), DynamicSecretActionCreateRootCredential.Name(), DynamicSecretActionEditRootCredential.Name(), DynamicSecretActionDeleteRootCredential.Name(), DynamicSecretActionLease.Name()), Subject: ss(SubDynamicSecrets)},

	// SecretImports
	{Action: ss(SecretImportActionRead.Name(), SecretImportActionCreate.Name(), SecretImportActionEdit.Name(), SecretImportActionDelete.Name()), Subject: ss(SubSecretImports)},

	// Commits
	{Action: ss(CommitsActionRead.Name(), CommitsActionPerformRollback.Name()), Subject: ss(SubCommits)},

	// SecretApproval
	{Action: ss(SecretApprovalActionRead.Name()), Subject: ss(SubSecretApproval)},

	// SecretRotation
	{Action: ss(SecretRotationActionRead.Name()), Subject: ss(SubSecretRotation)},

	// SecretRollback
	{Action: ss(SecretRollbackActionRead.Name(), SecretRollbackActionCreate.Name()), Subject: ss(SubSecretRollback)},

	// Member
	{Action: ss(MemberActionRead.Name(), MemberActionCreate.Name()), Subject: ss(SubMember)},

	// Groups
	{Action: ss(GroupActionRead.Name()), Subject: ss(SubGroups)},

	// Integrations
	{Action: ss(IntegrationsActionRead.Name(), IntegrationsActionCreate.Name(), IntegrationsActionEdit.Name(), IntegrationsActionDelete.Name()), Subject: ss(SubIntegrations)},

	// Webhooks
	{Action: ss(WebhooksActionRead.Name(), WebhooksActionCreate.Name(), WebhooksActionEdit.Name(), WebhooksActionDelete.Name()), Subject: ss(SubWebhooks)},

	// Identity
	{Action: ss(IdentityActionRead.Name(), IdentityActionCreate.Name(), IdentityActionEdit.Name(), IdentityActionDelete.Name()), Subject: ss(SubIdentity)},

	// ServiceTokens
	{Action: ss(ServiceTokensActionRead.Name(), ServiceTokensActionCreate.Name(), ServiceTokensActionEdit.Name(), ServiceTokensActionDelete.Name()), Subject: ss(SubServiceTokens)},

	// Settings
	{Action: ss(SettingsActionRead.Name(), SettingsActionCreate.Name(), SettingsActionEdit.Name(), SettingsActionDelete.Name()), Subject: ss(SubSettings)},

	// Environments
	{Action: ss(EnvironmentsActionRead.Name(), EnvironmentsActionCreate.Name(), EnvironmentsActionEdit.Name(), EnvironmentsActionDelete.Name()), Subject: ss(SubEnvironments)},

	// Tags
	{Action: ss(TagsActionRead.Name(), TagsActionCreate.Name(), TagsActionEdit.Name(), TagsActionDelete.Name()), Subject: ss(SubTags)},

	// Role
	{Action: ss(RoleActionRead.Name()), Subject: ss(SubRole)},

	// AuditLogs
	{Action: ss(AuditLogsActionRead.Name()), Subject: ss(SubAuditLogs)},

	// IpAllowList
	{Action: ss(IpAllowListActionRead.Name()), Subject: ss(SubIpAllowList)},

	// CertificateAuthorities
	{Action: ss(CaActionRead.Name()), Subject: ss(SubCertificateAuthorities)},

	// CertificateTemplates
	{Action: ss(CertTemplateActionRead.Name()), Subject: ss(SubCertificateTemplates)},

	// CertificatePolicies
	{Action: ss(CertPolicyActionRead.Name()), Subject: ss(SubCertificatePolicies)},

	// Certificates
	{Action: ss(CertActionRead.Name(), CertActionCreate.Name(), CertActionEdit.Name(), CertActionDelete.Name(), CertActionImport.Name()), Subject: ss(SubCertificates)},

	// CertificateProfiles
	{Action: ss(CertProfileActionRead.Name(), CertProfileActionCreate.Name(), CertProfileActionEdit.Name(), CertProfileActionDelete.Name()), Subject: ss(SubCertificateProfiles)},

	// PkiAlerts
	{Action: ss(PkiAlertsActionRead.Name()), Subject: ss(SubPkiAlerts)},

	// PkiCollections
	{Action: ss(PkiCollectionsActionRead.Name()), Subject: ss(SubPkiCollections)},

	// SshCertificates
	{Action: ss(SshCertActionRead.Name()), Subject: ss(SubSshCertificates)},
	{Action: ss(SshCertActionCreate.Name()), Subject: ss(SubSshCertificates)},

	// SshCertificateTemplates
	{Action: ss(SshCertTemplateActionRead.Name()), Subject: ss(SubSshCertificateTemplates)},

	// SshHosts
	{Action: ss(SshHostActionRead.Name()), Subject: ss(SubSshHosts)},

	// PkiSubscribers
	{Action: ss(PkiSubscriberActionRead.Name()), Subject: ss(SubPkiSubscribers)},

	// Cmek
	{Action: ss(CmekActionRead.Name(), CmekActionCreate.Name(), CmekActionEdit.Name(), CmekActionDelete.Name(), CmekActionEncrypt.Name(), CmekActionDecrypt.Name(), CmekActionSign.Name(), CmekActionVerify.Name()), Subject: ss(SubCmek)},

	// SecretSyncs
	{Action: ss(SecretSyncActionRead.Name(), SecretSyncActionCreate.Name(), SecretSyncActionEdit.Name(), SecretSyncActionDelete.Name(), SecretSyncActionSyncSecrets.Name(), SecretSyncActionImportSecrets.Name(), SecretSyncActionRemoveSecrets.Name()), Subject: ss(SubSecretSyncs)},

	// PkiSyncs
	{Action: ss(PkiSyncActionRead.Name(), PkiSyncActionCreate.Name(), PkiSyncActionEdit.Name(), PkiSyncActionDelete.Name(), PkiSyncActionSyncCertificates.Name(), PkiSyncActionImportCertificates.Name(), PkiSyncActionRemoveCertificates.Name()), Subject: ss(SubPkiSyncs)},

	// PkiDiscovery
	{Action: ss(PkiDiscoveryActionRead.Name()), Subject: ss(SubPkiDiscovery)},

	// PkiCertificateInstallations
	{Action: ss(PkiCertInstallActionRead.Name()), Subject: ss(SubPkiCertificateInstalls)},

	// SecretScanningDataSources
	{Action: ss(SecretScanningDataSourceActionRead.Name(), SecretScanningDataSourceActionTriggerScans.Name(), SecretScanningDataSourceActionReadScans.Name(), SecretScanningDataSourceActionReadResources.Name()), Subject: ss(SubSecretScanningDataSources)},

	// SecretScanningFindings
	{Action: ss(SecretScanningFindingActionRead.Name(), SecretScanningFindingActionUpdate.Name()), Subject: ss(SubSecretScanningFindings)},

	// SecretScanningConfigs
	{Action: ss(SecretScanningConfigActionRead.Name()), Subject: ss(SubSecretScanningConfigs)},

	// SecretEventSubscriptions
	{Action: ss(SecretEventActionSubscribeCreation.Name(), SecretEventActionSubscribeDelete.Name(), SecretEventActionSubscribeUpdate.Name(), SecretEventActionSubscribeImportMutation.Name()), Subject: ss(SubSecretEventSubscriptions)},

	// AppConnections
	{Action: ss(AppConnectionActionConnect.Name()), Subject: ss(SubAppConnections)},

	// PamFolders
	{Action: ss(PamFoldersActionRead.Name()), Subject: ss(SubPamFolders)},

	// PamResources
	{Action: ss(PamResourceActionRead.Name()), Subject: ss(SubPamResources)},

	// PamAccounts
	{Action: ss(PamAccountActionAccess.Name(), PamAccountActionRead.Name()), Subject: ss(SubPamAccounts)},

	// PamDiscovery
	{Action: ss(PamDiscoveryActionRead.Name()), Subject: ss(SubPamDiscovery)},

	// McpEndpoints
	{Action: ss(McpEndpointActionRead.Name()), Subject: ss(SubMcpEndpoints)},

	// McpServers
	{Action: ss(McpServersActionRead.Name()), Subject: ss(SubMcpServers)},

	// McpActivityLogs
	{Action: ss(McpActivityLogsActionRead.Name()), Subject: ss(SubMcpActivityLogs)},

	// ApprovalRequests
	{Action: ss(ApprovalRequestActionCreate.Name()), Subject: ss(SubApprovalRequests)},
}

// ViewerPermissions defines the permission set for the viewer role.
// Exact port of buildViewerPermissionRules() from default-roles.ts.
var ViewerPermissions = []gocasl.JSONRule{
	// Secrets
	{Action: ss(SecretActionDescribeSecret.Name(), SecretActionReadValue.Name()), Subject: ss(SubSecrets)},

	// SecretFolders
	{Action: ss(SecretFolderActionRead.Name()), Subject: ss(SubSecretFolders)},

	// DynamicSecrets
	{Action: ss(DynamicSecretActionReadRootCredential.Name()), Subject: ss(SubDynamicSecrets)},

	// SecretImports
	{Action: ss(SecretImportActionRead.Name()), Subject: ss(SubSecretImports)},

	// SecretApproval
	{Action: ss(SecretApprovalActionRead.Name()), Subject: ss(SubSecretApproval)},

	// SecretRollback
	{Action: ss(SecretRollbackActionRead.Name()), Subject: ss(SubSecretRollback)},

	// SecretRotation
	{Action: ss(SecretRotationActionRead.Name()), Subject: ss(SubSecretRotation)},

	// Member
	{Action: ss(MemberActionRead.Name()), Subject: ss(SubMember)},

	// Groups
	{Action: ss(GroupActionRead.Name()), Subject: ss(SubGroups)},

	// Role
	{Action: ss(RoleActionRead.Name()), Subject: ss(SubRole)},

	// Integrations
	{Action: ss(IntegrationsActionRead.Name()), Subject: ss(SubIntegrations)},

	// Webhooks
	{Action: ss(WebhooksActionRead.Name()), Subject: ss(SubWebhooks)},

	// Identity
	{Action: ss(IdentityActionRead.Name()), Subject: ss(SubIdentity)},

	// ServiceTokens
	{Action: ss(ServiceTokensActionRead.Name()), Subject: ss(SubServiceTokens)},

	// Settings
	{Action: ss(SettingsActionRead.Name()), Subject: ss(SubSettings)},

	// Environments
	{Action: ss(EnvironmentsActionRead.Name()), Subject: ss(SubEnvironments)},

	// Tags
	{Action: ss(TagsActionRead.Name()), Subject: ss(SubTags)},

	// AuditLogs
	{Action: ss(AuditLogsActionRead.Name()), Subject: ss(SubAuditLogs)},

	// IpAllowList
	{Action: ss(IpAllowListActionRead.Name()), Subject: ss(SubIpAllowList)},

	// CertificateAuthorities
	{Action: ss(CaActionRead.Name()), Subject: ss(SubCertificateAuthorities)},

	// Certificates
	{Action: ss(CertActionRead.Name()), Subject: ss(SubCertificates)},

	// CertificateTemplates
	{Action: ss(CertTemplateActionRead.Name()), Subject: ss(SubCertificateTemplates)},

	// CertificatePolicies
	{Action: ss(CertPolicyActionRead.Name()), Subject: ss(SubCertificatePolicies)},

	// Cmek
	{Action: ss(CmekActionRead.Name()), Subject: ss(SubCmek)},

	// SshCertificates
	{Action: ss(SshCertActionRead.Name()), Subject: ss(SubSshCertificates)},

	// SshCertificateTemplates
	{Action: ss(SshCertTemplateActionRead.Name()), Subject: ss(SubSshCertificateTemplates)},

	// SecretSyncs
	{Action: ss(SecretSyncActionRead.Name()), Subject: ss(SubSecretSyncs)},

	// PkiSyncs
	{Action: ss(PkiSyncActionRead.Name()), Subject: ss(SubPkiSyncs)},

	// PkiDiscovery
	{Action: ss(PkiDiscoveryActionRead.Name()), Subject: ss(SubPkiDiscovery)},

	// PkiCertificateInstallations
	{Action: ss(PkiCertInstallActionRead.Name()), Subject: ss(SubPkiCertificateInstalls)},

	// Commits
	{Action: ss(CommitsActionRead.Name()), Subject: ss(SubCommits)},

	// SecretScanningDataSources
	{Action: ss(SecretScanningDataSourceActionRead.Name(), SecretScanningDataSourceActionReadScans.Name(), SecretScanningDataSourceActionReadResources.Name()), Subject: ss(SubSecretScanningDataSources)},

	// SecretScanningFindings
	{Action: ss(SecretScanningFindingActionRead.Name()), Subject: ss(SubSecretScanningFindings)},

	// SecretScanningConfigs
	{Action: ss(SecretScanningConfigActionRead.Name()), Subject: ss(SubSecretScanningConfigs)},

	// SecretEventSubscriptions
	{Action: ss(SecretEventActionSubscribeCreation.Name(), SecretEventActionSubscribeDelete.Name(), SecretEventActionSubscribeUpdate.Name(), SecretEventActionSubscribeImportMutation.Name()), Subject: ss(SubSecretEventSubscriptions)},

	// PamFolders
	{Action: ss(PamFoldersActionRead.Name()), Subject: ss(SubPamFolders)},

	// PamResources
	{Action: ss(PamResourceActionRead.Name()), Subject: ss(SubPamResources)},

	// PamAccounts
	{Action: ss(PamAccountActionRead.Name()), Subject: ss(SubPamAccounts)},

	// PamDiscovery
	{Action: ss(PamDiscoveryActionRead.Name()), Subject: ss(SubPamDiscovery)},

	// McpEndpoints
	{Action: ss(McpEndpointActionRead.Name()), Subject: ss(SubMcpEndpoints)},

	// McpServers
	{Action: ss(McpServersActionRead.Name()), Subject: ss(SubMcpServers)},

	// McpActivityLogs
	{Action: ss(McpActivityLogsActionRead.Name()), Subject: ss(SubMcpActivityLogs)},
}

// NoAccessPermissions defines the (empty) permission set for the no-access role.
var NoAccessPermissions = []gocasl.JSONRule{}

// SshHostBootstrapPermissions defines the permission set for the ssh-host-bootstrapper role.
// Exact port of buildSshHostBootstrapPermissionRules() from default-roles.ts.
var SshHostBootstrapPermissions = []gocasl.JSONRule{
	{Action: ss(SshHostActionCreate.Name(), SshHostActionIssueHostCert.Name()), Subject: ss(SubSshHosts)},
}

// CryptographicOperatorPermissions defines the permission set for the cryptographic-operator role.
// Exact port of buildCryptographicOperatorPermissionRules() from default-roles.ts.
var CryptographicOperatorPermissions = []gocasl.JSONRule{
	{Action: ss(CmekActionEncrypt.Name(), CmekActionDecrypt.Name(), CmekActionSign.Name(), CmekActionVerify.Name()), Subject: ss(SubCmek)},
}
