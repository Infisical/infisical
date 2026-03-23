package project

import "github.com/infisical/gocasl"

// --- Role constants (ProjectMembershipRole) ---

const (
	RoleAdmin                    = "admin"
	RoleMember                   = "member"
	RoleViewer                   = "viewer"
	RoleNoAccess                 = "no-access"
	RoleCustom                   = "custom"
	RoleSshHostBootstrapper      = "ssh-host-bootstrapper"
	RoleKmsCryptographicOperator = "cryptographic-operator"
)

// --- Typed actions per subject ---

// Secret actions (ProjectPermissionSecretActions)
var (
	SecretActionDescribeAndReadValue = gocasl.DefineAction[SecretSubject]("read")
	SecretActionDescribeSecret       = gocasl.DefineAction[SecretSubject]("describeSecret")
	SecretActionReadValue            = gocasl.DefineAction[SecretSubject]("readValue")
	SecretActionCreate               = gocasl.DefineAction[SecretSubject]("create")
	SecretActionEdit                 = gocasl.DefineAction[SecretSubject]("edit")
	SecretActionDelete               = gocasl.DefineAction[SecretSubject]("delete")
)

// SecretFolder actions (ProjectPermissionActions on SecretFolderSubject)
var (
	SecretFolderActionRead   = gocasl.DefineAction[SecretFolderSubject]("read")
	SecretFolderActionCreate = gocasl.DefineAction[SecretFolderSubject]("create")
	SecretFolderActionEdit   = gocasl.DefineAction[SecretFolderSubject]("edit")
	SecretFolderActionDelete = gocasl.DefineAction[SecretFolderSubject]("delete")
)

// SecretImport actions
var (
	SecretImportActionRead   = gocasl.DefineAction[SecretImportSubject]("read")
	SecretImportActionCreate = gocasl.DefineAction[SecretImportSubject]("create")
	SecretImportActionEdit   = gocasl.DefineAction[SecretImportSubject]("edit")
	SecretImportActionDelete = gocasl.DefineAction[SecretImportSubject]("delete")
)

// DynamicSecret actions (ProjectPermissionDynamicSecretActions)
var (
	DynamicSecretActionReadRootCredential   = gocasl.DefineAction[DynamicSecretSubject]("read-root-credential")
	DynamicSecretActionCreateRootCredential = gocasl.DefineAction[DynamicSecretSubject]("create-root-credential")
	DynamicSecretActionEditRootCredential   = gocasl.DefineAction[DynamicSecretSubject]("edit-root-credential")
	DynamicSecretActionDeleteRootCredential = gocasl.DefineAction[DynamicSecretSubject]("delete-root-credential")
	DynamicSecretActionLease                = gocasl.DefineAction[DynamicSecretSubject]("lease")
)

// SecretRollback actions
var (
	SecretRollbackActionRead   = gocasl.DefineAction[SecretRollbackSubject]("read")
	SecretRollbackActionCreate = gocasl.DefineAction[SecretRollbackSubject]("create")
)

// SecretApproval actions
var (
	SecretApprovalActionRead   = gocasl.DefineAction[SecretApprovalSubject]("read")
	SecretApprovalActionCreate = gocasl.DefineAction[SecretApprovalSubject]("create")
	SecretApprovalActionEdit   = gocasl.DefineAction[SecretApprovalSubject]("edit")
	SecretApprovalActionDelete = gocasl.DefineAction[SecretApprovalSubject]("delete")
)

// SecretApprovalRequest actions
var SecretApprovalRequestActionRead = gocasl.DefineAction[SecretApprovalRequestSubject]("read")

// SecretSync actions (ProjectPermissionSecretSyncActions)
var (
	SecretSyncActionRead          = gocasl.DefineAction[SecretSyncSubject]("read")
	SecretSyncActionCreate        = gocasl.DefineAction[SecretSyncSubject]("create")
	SecretSyncActionEdit          = gocasl.DefineAction[SecretSyncSubject]("edit")
	SecretSyncActionDelete        = gocasl.DefineAction[SecretSyncSubject]("delete")
	SecretSyncActionSyncSecrets   = gocasl.DefineAction[SecretSyncSubject]("sync-secrets")
	SecretSyncActionImportSecrets = gocasl.DefineAction[SecretSyncSubject]("import-secrets")
	SecretSyncActionRemoveSecrets = gocasl.DefineAction[SecretSyncSubject]("remove-secrets")
)

// SecretRotation actions (ProjectPermissionSecretRotationActions)
var (
	SecretRotationActionRead               = gocasl.DefineAction[SecretRotationSubject]("read")
	SecretRotationActionReadGeneratedCreds = gocasl.DefineAction[SecretRotationSubject]("read-generated-credentials")
	SecretRotationActionCreate             = gocasl.DefineAction[SecretRotationSubject]("create")
	SecretRotationActionEdit               = gocasl.DefineAction[SecretRotationSubject]("edit")
	SecretRotationActionDelete             = gocasl.DefineAction[SecretRotationSubject]("delete")
	SecretRotationActionRotateSecrets      = gocasl.DefineAction[SecretRotationSubject]("rotate-secrets")
)

// SecretEvent actions (ProjectPermissionSecretEventActions)
var (
	SecretEventActionSubscribeCreation       = gocasl.DefineAction[SecretEventSubject]("subscribe-to-creation-events")
	SecretEventActionSubscribeUpdate         = gocasl.DefineAction[SecretEventSubject]("subscribe-to-update-events")
	SecretEventActionSubscribeDelete         = gocasl.DefineAction[SecretEventSubject]("subscribe-to-deletion-events")
	SecretEventActionSubscribeImportMutation = gocasl.DefineAction[SecretEventSubject]("subscribe-to-import-mutation-events")
)

// Commits actions (ProjectPermissionCommitsActions)
var (
	CommitsActionRead            = gocasl.DefineAction[CommitsSubject]("read")
	CommitsActionPerformRollback = gocasl.DefineAction[CommitsSubject]("perform-rollback")
)

// Project actions
var (
	ProjectActionEdit   = gocasl.DefineAction[ProjectSubject]("edit")
	ProjectActionDelete = gocasl.DefineAction[ProjectSubject]("delete")
)

// Role actions
var (
	RoleActionRead   = gocasl.DefineAction[RoleSubject]("read")
	RoleActionCreate = gocasl.DefineAction[RoleSubject]("create")
	RoleActionEdit   = gocasl.DefineAction[RoleSubject]("edit")
	RoleActionDelete = gocasl.DefineAction[RoleSubject]("delete")
)

// Settings actions
var (
	SettingsActionRead   = gocasl.DefineAction[SettingsSubject]("read")
	SettingsActionCreate = gocasl.DefineAction[SettingsSubject]("create")
	SettingsActionEdit   = gocasl.DefineAction[SettingsSubject]("edit")
	SettingsActionDelete = gocasl.DefineAction[SettingsSubject]("delete")
)

// Environments actions
var (
	EnvironmentsActionRead   = gocasl.DefineAction[EnvironmentsSubject]("read")
	EnvironmentsActionCreate = gocasl.DefineAction[EnvironmentsSubject]("create")
	EnvironmentsActionEdit   = gocasl.DefineAction[EnvironmentsSubject]("edit")
	EnvironmentsActionDelete = gocasl.DefineAction[EnvironmentsSubject]("delete")
)

// Tags actions
var (
	TagsActionRead   = gocasl.DefineAction[TagsSubject]("read")
	TagsActionCreate = gocasl.DefineAction[TagsSubject]("create")
	TagsActionEdit   = gocasl.DefineAction[TagsSubject]("edit")
	TagsActionDelete = gocasl.DefineAction[TagsSubject]("delete")
)

// IpAllowList actions
var (
	IpAllowListActionRead   = gocasl.DefineAction[IpAllowListSubject]("read")
	IpAllowListActionCreate = gocasl.DefineAction[IpAllowListSubject]("create")
	IpAllowListActionEdit   = gocasl.DefineAction[IpAllowListSubject]("edit")
	IpAllowListActionDelete = gocasl.DefineAction[IpAllowListSubject]("delete")
)

// AuditLogs actions (ProjectPermissionAuditLogsActions)
var AuditLogsActionRead = gocasl.DefineAction[AuditLogsSubject]("read")

// Member actions (ProjectPermissionMemberActions)
var (
	MemberActionRead                       = gocasl.DefineAction[MemberSubject]("read")
	MemberActionCreate                     = gocasl.DefineAction[MemberSubject]("create")
	MemberActionEdit                       = gocasl.DefineAction[MemberSubject]("edit")
	MemberActionDelete                     = gocasl.DefineAction[MemberSubject]("delete")
	MemberActionGrantPrivileges            = gocasl.DefineAction[MemberSubject]("grant-privileges")
	MemberActionAssignRole                 = gocasl.DefineAction[MemberSubject]("assign-role")
	MemberActionAssignAdditionalPrivileges = gocasl.DefineAction[MemberSubject]("assign-additional-privileges")
	MemberActionAssumePrivileges           = gocasl.DefineAction[MemberSubject]("assume-privileges")
)

// Identity actions (ProjectPermissionIdentityActions)
var (
	IdentityActionRead                       = gocasl.DefineAction[IdentitySubject]("read")
	IdentityActionCreate                     = gocasl.DefineAction[IdentitySubject]("create")
	IdentityActionEdit                       = gocasl.DefineAction[IdentitySubject]("edit")
	IdentityActionDelete                     = gocasl.DefineAction[IdentitySubject]("delete")
	IdentityActionGrantPrivileges            = gocasl.DefineAction[IdentitySubject]("grant-privileges")
	IdentityActionAssignRole                 = gocasl.DefineAction[IdentitySubject]("assign-role")
	IdentityActionAssignAdditionalPrivileges = gocasl.DefineAction[IdentitySubject]("assign-additional-privileges")
	IdentityActionAssumePrivileges           = gocasl.DefineAction[IdentitySubject]("assume-privileges")
	IdentityActionRevokeAuth                 = gocasl.DefineAction[IdentitySubject]("revoke-auth")
	IdentityActionCreateToken                = gocasl.DefineAction[IdentitySubject]("create-token")
	IdentityActionGetToken                   = gocasl.DefineAction[IdentitySubject]("get-token")
	IdentityActionDeleteToken                = gocasl.DefineAction[IdentitySubject]("delete-token")
)

// Group actions (ProjectPermissionGroupActions)
var (
	GroupActionRead            = gocasl.DefineAction[GroupSubject]("read")
	GroupActionCreate          = gocasl.DefineAction[GroupSubject]("create")
	GroupActionEdit            = gocasl.DefineAction[GroupSubject]("edit")
	GroupActionDelete          = gocasl.DefineAction[GroupSubject]("delete")
	GroupActionGrantPrivileges = gocasl.DefineAction[GroupSubject]("grant-privileges")
	GroupActionAssignRole      = gocasl.DefineAction[GroupSubject]("assign-role")
)

// ServiceTokens actions
var (
	ServiceTokensActionRead   = gocasl.DefineAction[ServiceTokensSubject]("read")
	ServiceTokensActionCreate = gocasl.DefineAction[ServiceTokensSubject]("create")
	ServiceTokensActionEdit   = gocasl.DefineAction[ServiceTokensSubject]("edit")
	ServiceTokensActionDelete = gocasl.DefineAction[ServiceTokensSubject]("delete")
)

// Integrations actions
var (
	IntegrationsActionRead   = gocasl.DefineAction[IntegrationsSubject]("read")
	IntegrationsActionCreate = gocasl.DefineAction[IntegrationsSubject]("create")
	IntegrationsActionEdit   = gocasl.DefineAction[IntegrationsSubject]("edit")
	IntegrationsActionDelete = gocasl.DefineAction[IntegrationsSubject]("delete")
)

// Webhooks actions
var (
	WebhooksActionRead   = gocasl.DefineAction[WebhooksSubject]("read")
	WebhooksActionCreate = gocasl.DefineAction[WebhooksSubject]("create")
	WebhooksActionEdit   = gocasl.DefineAction[WebhooksSubject]("edit")
	WebhooksActionDelete = gocasl.DefineAction[WebhooksSubject]("delete")
)

// SSH actions

// SshCertificateAuthorities actions
var (
	SshCaActionRead   = gocasl.DefineAction[SshCertificateAuthoritiesSubject]("read")
	SshCaActionCreate = gocasl.DefineAction[SshCertificateAuthoritiesSubject]("create")
	SshCaActionEdit   = gocasl.DefineAction[SshCertificateAuthoritiesSubject]("edit")
	SshCaActionDelete = gocasl.DefineAction[SshCertificateAuthoritiesSubject]("delete")
)

// SshCertificates actions
var (
	SshCertActionRead   = gocasl.DefineAction[SshCertificatesSubject]("read")
	SshCertActionCreate = gocasl.DefineAction[SshCertificatesSubject]("create")
	SshCertActionEdit   = gocasl.DefineAction[SshCertificatesSubject]("edit")
	SshCertActionDelete = gocasl.DefineAction[SshCertificatesSubject]("delete")
)

// SshCertificateTemplates actions
var (
	SshCertTemplateActionRead   = gocasl.DefineAction[SshCertificateTemplatesSubject]("read")
	SshCertTemplateActionCreate = gocasl.DefineAction[SshCertificateTemplatesSubject]("create")
	SshCertTemplateActionEdit   = gocasl.DefineAction[SshCertificateTemplatesSubject]("edit")
	SshCertTemplateActionDelete = gocasl.DefineAction[SshCertificateTemplatesSubject]("delete")
)

// SshHost actions (ProjectPermissionSshHostActions)
var (
	SshHostActionRead          = gocasl.DefineAction[SshHostSubject]("read")
	SshHostActionCreate        = gocasl.DefineAction[SshHostSubject]("create")
	SshHostActionEdit          = gocasl.DefineAction[SshHostSubject]("edit")
	SshHostActionDelete        = gocasl.DefineAction[SshHostSubject]("delete")
	SshHostActionIssueHostCert = gocasl.DefineAction[SshHostSubject]("issue-host-cert")
)

// SshHostGroups actions
var (
	SshHostGroupsActionRead   = gocasl.DefineAction[SshHostGroupsSubject]("read")
	SshHostGroupsActionCreate = gocasl.DefineAction[SshHostGroupsSubject]("create")
	SshHostGroupsActionEdit   = gocasl.DefineAction[SshHostGroupsSubject]("edit")
	SshHostGroupsActionDelete = gocasl.DefineAction[SshHostGroupsSubject]("delete")
)

// CertificateAuthority actions (ProjectPermissionCertificateAuthorityActions)
var (
	CaActionRead             = gocasl.DefineAction[CertificateAuthoritySubject]("read")
	CaActionCreate           = gocasl.DefineAction[CertificateAuthoritySubject]("create")
	CaActionEdit             = gocasl.DefineAction[CertificateAuthoritySubject]("edit")
	CaActionDelete           = gocasl.DefineAction[CertificateAuthoritySubject]("delete")
	CaActionIssueCACert      = gocasl.DefineAction[CertificateAuthoritySubject]("issue-ca-certificate")
	CaActionSignIntermediate = gocasl.DefineAction[CertificateAuthoritySubject]("sign-intermediate")
)

// Certificate actions (ProjectPermissionCertificateActions)
var (
	CertActionRead           = gocasl.DefineAction[CertificateSubject]("read")
	CertActionCreate         = gocasl.DefineAction[CertificateSubject]("create")
	CertActionEdit           = gocasl.DefineAction[CertificateSubject]("edit")
	CertActionDelete         = gocasl.DefineAction[CertificateSubject]("delete")
	CertActionReadPrivateKey = gocasl.DefineAction[CertificateSubject]("read-private-key")
	CertActionImport         = gocasl.DefineAction[CertificateSubject]("import")
)

// CertificateTemplate actions (ProjectPermissionPkiTemplateActions)
var (
	CertTemplateActionRead      = gocasl.DefineAction[CertificateTemplateSubject]("read")
	CertTemplateActionCreate    = gocasl.DefineAction[CertificateTemplateSubject]("create")
	CertTemplateActionEdit      = gocasl.DefineAction[CertificateTemplateSubject]("edit")
	CertTemplateActionDelete    = gocasl.DefineAction[CertificateTemplateSubject]("delete")
	CertTemplateActionIssueCert = gocasl.DefineAction[CertificateTemplateSubject]("issue-cert")
	CertTemplateActionListCerts = gocasl.DefineAction[CertificateTemplateSubject]("list-certs")
)

// CertificateProfile actions (ProjectPermissionCertificateProfileActions)
var (
	CertProfileActionRead          = gocasl.DefineAction[CertificateProfileSubject]("read")
	CertProfileActionCreate        = gocasl.DefineAction[CertificateProfileSubject]("create")
	CertProfileActionEdit          = gocasl.DefineAction[CertificateProfileSubject]("edit")
	CertProfileActionDelete        = gocasl.DefineAction[CertificateProfileSubject]("delete")
	CertProfileActionIssueCert     = gocasl.DefineAction[CertificateProfileSubject]("issue-cert")
	CertProfileActionRevealAcmeEab = gocasl.DefineAction[CertificateProfileSubject]("reveal-acme-eab-secret")
	CertProfileActionRotateAcmeEab = gocasl.DefineAction[CertificateProfileSubject]("rotate-acme-eab-secret")
)

// CertificatePolicy actions (ProjectPermissionCertificatePolicyActions)
var (
	CertPolicyActionRead   = gocasl.DefineAction[CertificatePolicySubject]("read")
	CertPolicyActionCreate = gocasl.DefineAction[CertificatePolicySubject]("create")
	CertPolicyActionEdit   = gocasl.DefineAction[CertificatePolicySubject]("edit")
	CertPolicyActionDelete = gocasl.DefineAction[CertificatePolicySubject]("delete")
)

// PkiSubscriber actions (ProjectPermissionPkiSubscriberActions)
var (
	PkiSubscriberActionRead      = gocasl.DefineAction[PkiSubscriberSubject]("read")
	PkiSubscriberActionCreate    = gocasl.DefineAction[PkiSubscriberSubject]("create")
	PkiSubscriberActionEdit      = gocasl.DefineAction[PkiSubscriberSubject]("edit")
	PkiSubscriberActionDelete    = gocasl.DefineAction[PkiSubscriberSubject]("delete")
	PkiSubscriberActionIssueCert = gocasl.DefineAction[PkiSubscriberSubject]("issue-cert")
	PkiSubscriberActionListCerts = gocasl.DefineAction[PkiSubscriberSubject]("list-certs")
)

// PkiAlerts actions
var (
	PkiAlertsActionRead   = gocasl.DefineAction[PkiAlertsSubject]("read")
	PkiAlertsActionCreate = gocasl.DefineAction[PkiAlertsSubject]("create")
	PkiAlertsActionEdit   = gocasl.DefineAction[PkiAlertsSubject]("edit")
	PkiAlertsActionDelete = gocasl.DefineAction[PkiAlertsSubject]("delete")
)

// PkiCollections actions
var (
	PkiCollectionsActionRead   = gocasl.DefineAction[PkiCollectionsSubject]("read")
	PkiCollectionsActionCreate = gocasl.DefineAction[PkiCollectionsSubject]("create")
	PkiCollectionsActionEdit   = gocasl.DefineAction[PkiCollectionsSubject]("edit")
	PkiCollectionsActionDelete = gocasl.DefineAction[PkiCollectionsSubject]("delete")
)

// PkiSync actions (ProjectPermissionPkiSyncActions)
var (
	PkiSyncActionRead               = gocasl.DefineAction[PkiSyncSubject]("read")
	PkiSyncActionCreate             = gocasl.DefineAction[PkiSyncSubject]("create")
	PkiSyncActionEdit               = gocasl.DefineAction[PkiSyncSubject]("edit")
	PkiSyncActionDelete             = gocasl.DefineAction[PkiSyncSubject]("delete")
	PkiSyncActionSyncCertificates   = gocasl.DefineAction[PkiSyncSubject]("sync-certificates")
	PkiSyncActionImportCertificates = gocasl.DefineAction[PkiSyncSubject]("import-certificates")
	PkiSyncActionRemoveCertificates = gocasl.DefineAction[PkiSyncSubject]("remove-certificates")
)

// PkiDiscovery actions (ProjectPermissionPkiDiscoveryActions)
var (
	PkiDiscoveryActionRead    = gocasl.DefineAction[PkiDiscoverySubject]("read")
	PkiDiscoveryActionCreate  = gocasl.DefineAction[PkiDiscoverySubject]("create")
	PkiDiscoveryActionEdit    = gocasl.DefineAction[PkiDiscoverySubject]("edit")
	PkiDiscoveryActionDelete  = gocasl.DefineAction[PkiDiscoverySubject]("delete")
	PkiDiscoveryActionRunScan = gocasl.DefineAction[PkiDiscoverySubject]("run-scan")
)

// PkiCertificateInstallation actions (ProjectPermissionPkiCertificateInstallationActions)
var (
	PkiCertInstallActionRead   = gocasl.DefineAction[PkiCertificateInstallsSubject]("read")
	PkiCertInstallActionEdit   = gocasl.DefineAction[PkiCertificateInstallsSubject]("edit")
	PkiCertInstallActionDelete = gocasl.DefineAction[PkiCertificateInstallsSubject]("delete")
)

// Kms actions
var KmsActionEdit = gocasl.DefineAction[KmsSubject]("edit")

// Cmek actions (ProjectPermissionCmekActions)
var (
	CmekActionRead          = gocasl.DefineAction[CmekSubject]("read")
	CmekActionCreate        = gocasl.DefineAction[CmekSubject]("create")
	CmekActionEdit          = gocasl.DefineAction[CmekSubject]("edit")
	CmekActionDelete        = gocasl.DefineAction[CmekSubject]("delete")
	CmekActionEncrypt       = gocasl.DefineAction[CmekSubject]("encrypt")
	CmekActionDecrypt       = gocasl.DefineAction[CmekSubject]("decrypt")
	CmekActionSign          = gocasl.DefineAction[CmekSubject]("sign")
	CmekActionVerify        = gocasl.DefineAction[CmekSubject]("verify")
	CmekActionExportPrivKey = gocasl.DefineAction[CmekSubject]("export-private-key")
)

// Kmip actions (ProjectPermissionKmipActions)
var (
	KmipActionCreateClients = gocasl.DefineAction[KmipSubject]("create-clients")
	KmipActionUpdateClients = gocasl.DefineAction[KmipSubject]("update-clients")
	KmipActionDeleteClients = gocasl.DefineAction[KmipSubject]("delete-clients")
	KmipActionReadClients   = gocasl.DefineAction[KmipSubject]("read-clients")
	KmipActionGenerateCerts = gocasl.DefineAction[KmipSubject]("generate-client-certificates")
)

// SecretScanningDataSource actions (ProjectPermissionSecretScanningDataSourceActions)
var (
	SecretScanningDataSourceActionRead          = gocasl.DefineAction[SecretScanningDataSourcesSubject]("read-data-sources")
	SecretScanningDataSourceActionCreate        = gocasl.DefineAction[SecretScanningDataSourcesSubject]("create-data-sources")
	SecretScanningDataSourceActionEdit          = gocasl.DefineAction[SecretScanningDataSourcesSubject]("edit-data-sources")
	SecretScanningDataSourceActionDelete        = gocasl.DefineAction[SecretScanningDataSourcesSubject]("delete-data-sources")
	SecretScanningDataSourceActionTriggerScans  = gocasl.DefineAction[SecretScanningDataSourcesSubject]("trigger-data-source-scans")
	SecretScanningDataSourceActionReadScans     = gocasl.DefineAction[SecretScanningDataSourcesSubject]("read-data-source-scans")
	SecretScanningDataSourceActionReadResources = gocasl.DefineAction[SecretScanningDataSourcesSubject]("read-data-source-resources")
)

// SecretScanningFinding actions (ProjectPermissionSecretScanningFindingActions)
var (
	SecretScanningFindingActionRead   = gocasl.DefineAction[SecretScanningFindingsSubject]("read-findings")
	SecretScanningFindingActionUpdate = gocasl.DefineAction[SecretScanningFindingsSubject]("update-findings")
)

// SecretScanningConfig actions (ProjectPermissionSecretScanningConfigActions)
var (
	SecretScanningConfigActionRead   = gocasl.DefineAction[SecretScanningConfigsSubject]("read-configs")
	SecretScanningConfigActionUpdate = gocasl.DefineAction[SecretScanningConfigsSubject]("update-configs")
)

// AppConnection actions (ProjectPermissionAppConnectionActions)
var (
	AppConnectionActionRead              = gocasl.DefineAction[AppConnectionSubject]("read-app-connections")
	AppConnectionActionCreate            = gocasl.DefineAction[AppConnectionSubject]("create-app-connections")
	AppConnectionActionEdit              = gocasl.DefineAction[AppConnectionSubject]("edit-app-connections")
	AppConnectionActionDelete            = gocasl.DefineAction[AppConnectionSubject]("delete-app-connections")
	AppConnectionActionConnect           = gocasl.DefineAction[AppConnectionSubject]("connect-app-connections")
	AppConnectionActionRotateCredentials = gocasl.DefineAction[AppConnectionSubject]("rotate-credentials")
)

// McpEndpoint actions (ProjectPermissionMcpEndpointActions)
var (
	McpEndpointActionRead    = gocasl.DefineAction[McpEndpointSubject]("read")
	McpEndpointActionCreate  = gocasl.DefineAction[McpEndpointSubject]("create")
	McpEndpointActionEdit    = gocasl.DefineAction[McpEndpointSubject]("edit")
	McpEndpointActionDelete  = gocasl.DefineAction[McpEndpointSubject]("delete")
	McpEndpointActionConnect = gocasl.DefineAction[McpEndpointSubject]("connect")
)

// McpServers actions
var (
	McpServersActionRead   = gocasl.DefineAction[McpServersSubject]("read")
	McpServersActionCreate = gocasl.DefineAction[McpServersSubject]("create")
	McpServersActionEdit   = gocasl.DefineAction[McpServersSubject]("edit")
	McpServersActionDelete = gocasl.DefineAction[McpServersSubject]("delete")
)

// McpActivityLogs actions
var (
	McpActivityLogsActionRead   = gocasl.DefineAction[McpActivityLogsSubject]("read")
	McpActivityLogsActionCreate = gocasl.DefineAction[McpActivityLogsSubject]("create")
	McpActivityLogsActionEdit   = gocasl.DefineAction[McpActivityLogsSubject]("edit")
	McpActivityLogsActionDelete = gocasl.DefineAction[McpActivityLogsSubject]("delete")
)

// PamFolders actions
var (
	PamFoldersActionRead   = gocasl.DefineAction[PamFoldersSubject]("read")
	PamFoldersActionCreate = gocasl.DefineAction[PamFoldersSubject]("create")
	PamFoldersActionEdit   = gocasl.DefineAction[PamFoldersSubject]("edit")
	PamFoldersActionDelete = gocasl.DefineAction[PamFoldersSubject]("delete")
)

// PamAccount actions (ProjectPermissionPamAccountActions)
var (
	PamAccountActionAccess = gocasl.DefineAction[PamAccountSubject]("access")
	PamAccountActionRead   = gocasl.DefineAction[PamAccountSubject]("read")
	PamAccountActionCreate = gocasl.DefineAction[PamAccountSubject]("create")
	PamAccountActionEdit   = gocasl.DefineAction[PamAccountSubject]("edit")
	PamAccountActionDelete = gocasl.DefineAction[PamAccountSubject]("delete")
)

// PamResource actions (ProjectPermissionActions on PamResourceSubject)
var (
	PamResourceActionRead   = gocasl.DefineAction[PamResourceSubject]("read")
	PamResourceActionCreate = gocasl.DefineAction[PamResourceSubject]("create")
	PamResourceActionEdit   = gocasl.DefineAction[PamResourceSubject]("edit")
	PamResourceActionDelete = gocasl.DefineAction[PamResourceSubject]("delete")
)

// PamSession actions (ProjectPermissionPamSessionActions)
var PamSessionActionRead = gocasl.DefineAction[PamSessionsSubject]("read")

// PamDiscovery actions (ProjectPermissionPamDiscoveryActions)
var (
	PamDiscoveryActionRead    = gocasl.DefineAction[PamDiscoverySubject]("read")
	PamDiscoveryActionCreate  = gocasl.DefineAction[PamDiscoverySubject]("create")
	PamDiscoveryActionEdit    = gocasl.DefineAction[PamDiscoverySubject]("edit")
	PamDiscoveryActionDelete  = gocasl.DefineAction[PamDiscoverySubject]("delete")
	PamDiscoveryActionRunScan = gocasl.DefineAction[PamDiscoverySubject]("run-scan")
)

// ApprovalRequest actions (ProjectPermissionApprovalRequestActions)
var (
	ApprovalRequestActionRead   = gocasl.DefineAction[ApprovalRequestsSubject]("read")
	ApprovalRequestActionCreate = gocasl.DefineAction[ApprovalRequestsSubject]("create")
)

// ApprovalRequestGrant actions (ProjectPermissionApprovalRequestGrantActions)
var (
	ApprovalRequestGrantActionRead   = gocasl.DefineAction[ApprovalRequestGrantsSubject]("read")
	ApprovalRequestGrantActionRevoke = gocasl.DefineAction[ApprovalRequestGrantsSubject]("revoke")
)
