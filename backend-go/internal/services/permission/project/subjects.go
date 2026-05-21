package project

// Subject structs for project-level permission checks.
// Each subject constant is co-located with its struct.
// Subjects with condition fields implement GetField to expose them.
// Subjects without condition fields return nil from GetField.

// MetadataKeyValue represents a key-value metadata pair used in subject conditions.
type MetadataKeyValue struct {
	Key   string
	Value string
}

func (m MetadataKeyValue) SubjectType() string { return "metadataKeyValue" }

func (m MetadataKeyValue) GetField(f string) any {
	switch f {
	case "key":
		return m.Key
	case "value":
		return m.Value
	default:
		return nil
	}
}

// ===========================
// Secrets
// ===========================

const SubSecrets = "secrets"

// SecretSubject — "secrets"
type SecretSubject struct {
	Environment string
	SecretPath  string
	SecretName  string
	SecretTags  []string
}

func (s SecretSubject) SubjectType() string { return SubSecrets }
func (s SecretSubject) GetField(f string) any {
	switch f {
	case "environment":
		return s.Environment
	case "secretPath":
		return s.SecretPath
	case "secretName":
		return s.SecretName
	case "secretTags":
		return s.SecretTags
	default:
		return nil
	}
}

const SubSecretFolders = "secret-folders"

// SecretFolderSubject — "secret-folders"
type SecretFolderSubject struct {
	Environment string
	SecretPath  string
}

func (s SecretFolderSubject) SubjectType() string { return SubSecretFolders }
func (s SecretFolderSubject) GetField(f string) any {
	switch f {
	case "environment":
		return s.Environment
	case "secretPath":
		return s.SecretPath
	default:
		return nil
	}
}

const SubSecretImports = "secret-imports"

// SecretImportSubject — "secret-imports"
type SecretImportSubject struct {
	Environment string
	SecretPath  string
}

func (s SecretImportSubject) SubjectType() string { return SubSecretImports }
func (s SecretImportSubject) GetField(f string) any {
	switch f {
	case "environment":
		return s.Environment
	case "secretPath":
		return s.SecretPath
	default:
		return nil
	}
}

const SubDynamicSecrets = "dynamic-secrets"

// DynamicSecretSubject — "dynamic-secrets"
type DynamicSecretSubject struct {
	Environment string
	SecretPath  string
	Metadata    []MetadataKeyValue
}

func (s DynamicSecretSubject) SubjectType() string { return SubDynamicSecrets }
func (s DynamicSecretSubject) GetField(f string) any {
	switch f {
	case "environment":
		return s.Environment
	case "secretPath":
		return s.SecretPath
	case "metadata":
		return s.Metadata
	default:
		return nil
	}
}

const SubSecretRollback = "secret-rollback"

// SecretRollbackSubject — "secret-rollback"
type SecretRollbackSubject struct{}

func (s SecretRollbackSubject) SubjectType() string { return SubSecretRollback }
func (s SecretRollbackSubject) GetField(string) any { return nil }

const SubSecretApproval = "secret-approval"

// SecretApprovalSubject — "secret-approval"
type SecretApprovalSubject struct{}

func (s SecretApprovalSubject) SubjectType() string { return SubSecretApproval }
func (s SecretApprovalSubject) GetField(string) any { return nil }

const SubSecretApprovalRequest = "secret-approval-request"

// SecretApprovalRequestSubject — "secret-approval-request"
type SecretApprovalRequestSubject struct{}

func (s SecretApprovalRequestSubject) SubjectType() string { return SubSecretApprovalRequest }
func (s SecretApprovalRequestSubject) GetField(string) any { return nil }

const SubSecretSyncs = "secret-syncs"

// SecretSyncSubject — "secret-syncs"
type SecretSyncSubject struct {
	Environment  string
	SecretPath   string
	ConnectionID string
}

func (s SecretSyncSubject) SubjectType() string { return SubSecretSyncs }
func (s SecretSyncSubject) GetField(f string) any {
	switch f {
	case "environment":
		return s.Environment
	case "secretPath":
		return s.SecretPath
	case "connectionId":
		return s.ConnectionID
	default:
		return nil
	}
}

const SubSecretRotation = "secret-rotation"

// SecretRotationSubject — "secret-rotation"
type SecretRotationSubject struct {
	Environment  string
	SecretPath   string
	ConnectionID string
}

func (s SecretRotationSubject) SubjectType() string { return SubSecretRotation }
func (s SecretRotationSubject) GetField(f string) any {
	switch f {
	case "environment":
		return s.Environment
	case "secretPath":
		return s.SecretPath
	case "connectionId":
		return s.ConnectionID
	default:
		return nil
	}
}

const SubSecretEventSubscriptions = "secret-event-subscriptions"

// SecretEventSubject — "secret-event-subscriptions"
type SecretEventSubject struct {
	Environment string
	SecretPath  string
	SecretName  string
	SecretTags  []string
}

func (s SecretEventSubject) SubjectType() string { return SubSecretEventSubscriptions }
func (s SecretEventSubject) GetField(f string) any {
	switch f {
	case "environment":
		return s.Environment
	case "secretPath":
		return s.SecretPath
	case "secretName":
		return s.SecretName
	case "secretTags":
		return s.SecretTags
	default:
		return nil
	}
}

const SubCommits = "commits"

// CommitsSubject — "commits"
type CommitsSubject struct{}

func (s CommitsSubject) SubjectType() string { return SubCommits }
func (s CommitsSubject) GetField(string) any { return nil }

// ===========================
// Project / Settings
// ===========================

const SubProject = "workspace"

// ProjectSubject — "workspace"
type ProjectSubject struct{}

func (s ProjectSubject) SubjectType() string { return SubProject }
func (s ProjectSubject) GetField(string) any { return nil }

const SubRole = "role"

// RoleSubject — "role"
type RoleSubject struct{}

func (s RoleSubject) SubjectType() string { return SubRole }
func (s RoleSubject) GetField(string) any { return nil }

const SubSettings = "settings"

// SettingsSubject — "settings"
type SettingsSubject struct{}

func (s SettingsSubject) SubjectType() string { return SubSettings }
func (s SettingsSubject) GetField(string) any { return nil }

const SubEnvironments = "environments"

// EnvironmentsSubject — "environments"
type EnvironmentsSubject struct{}

func (s EnvironmentsSubject) SubjectType() string { return SubEnvironments }
func (s EnvironmentsSubject) GetField(string) any { return nil }

const SubTags = "tags"

// TagsSubject — "tags"
type TagsSubject struct{}

func (s TagsSubject) SubjectType() string { return SubTags }
func (s TagsSubject) GetField(string) any { return nil }

const SubIpAllowList = "ip-allowlist"

// IpAllowListSubject — "ip-allowlist"
type IpAllowListSubject struct{}

func (s IpAllowListSubject) SubjectType() string { return SubIpAllowList }
func (s IpAllowListSubject) GetField(string) any { return nil }

const SubAuditLogs = "audit-logs"

// AuditLogsSubject — "audit-logs"
type AuditLogsSubject struct{}

func (s AuditLogsSubject) SubjectType() string { return SubAuditLogs }
func (s AuditLogsSubject) GetField(string) any { return nil }

// ===========================
// Members / Identity
// ===========================

const SubMember = "member"

// MemberSubject — "member"
type MemberSubject struct {
	UserEmail         string
	AssignableRole    string
	AssignableSubject string
	AssignableAction  string
}

func (s MemberSubject) SubjectType() string { return SubMember }
func (s MemberSubject) GetField(f string) any {
	switch f {
	case "userEmail":
		return s.UserEmail
	case "assignableRole":
		return s.AssignableRole
	case "assignableSubject":
		return s.AssignableSubject
	case "assignableAction":
		return s.AssignableAction
	default:
		return nil
	}
}

const SubIdentity = "identity"

// IdentitySubject — "identity"
type IdentitySubject struct {
	IdentityID        string
	AssignableRole    string
	AssignableSubject string
	AssignableAction  string
}

func (s IdentitySubject) SubjectType() string { return SubIdentity }
func (s IdentitySubject) GetField(f string) any {
	switch f {
	case "identityId":
		return s.IdentityID
	case "assignableRole":
		return s.AssignableRole
	case "assignableSubject":
		return s.AssignableSubject
	case "assignableAction":
		return s.AssignableAction
	default:
		return nil
	}
}

const SubGroups = "groups"

// GroupSubject — "groups"
type GroupSubject struct {
	GroupName      string
	AssignableRole string
}

func (s GroupSubject) SubjectType() string { return SubGroups }
func (s GroupSubject) GetField(f string) any {
	switch f {
	case "groupName":
		return s.GroupName
	case "assignableRole":
		return s.AssignableRole
	default:
		return nil
	}
}

// ===========================
// Services / Integrations
// ===========================

const SubServiceTokens = "service-tokens"

// ServiceTokensSubject — "service-tokens"
type ServiceTokensSubject struct{}

func (s ServiceTokensSubject) SubjectType() string { return SubServiceTokens }
func (s ServiceTokensSubject) GetField(string) any { return nil }

const SubIntegrations = "integrations"

// IntegrationsSubject — "integrations"
type IntegrationsSubject struct{}

func (s IntegrationsSubject) SubjectType() string { return SubIntegrations }
func (s IntegrationsSubject) GetField(string) any { return nil }

const SubWebhooks = "webhooks"

// WebhooksSubject — "webhooks"
type WebhooksSubject struct{}

func (s WebhooksSubject) SubjectType() string { return SubWebhooks }
func (s WebhooksSubject) GetField(string) any { return nil }

// ===========================
// SSH
// ===========================

const SubSshCertificateAuthorities = "ssh-certificate-authorities"

// SshCertificateAuthoritiesSubject — "ssh-certificate-authorities"
type SshCertificateAuthoritiesSubject struct{}

func (s SshCertificateAuthoritiesSubject) SubjectType() string { return SubSshCertificateAuthorities }
func (s SshCertificateAuthoritiesSubject) GetField(string) any { return nil }

const SubSshCertificates = "ssh-certificates"

// SshCertificatesSubject — "ssh-certificates"
type SshCertificatesSubject struct{}

func (s SshCertificatesSubject) SubjectType() string { return SubSshCertificates }
func (s SshCertificatesSubject) GetField(string) any { return nil }

const SubSshCertificateTemplates = "ssh-certificate-templates"

// SshCertificateTemplatesSubject — "ssh-certificate-templates"
type SshCertificateTemplatesSubject struct{}

func (s SshCertificateTemplatesSubject) SubjectType() string { return SubSshCertificateTemplates }
func (s SshCertificateTemplatesSubject) GetField(string) any { return nil }

const SubSshHosts = "ssh-hosts"

// SshHostSubject — "ssh-hosts"
type SshHostSubject struct {
	Hostname string
}

func (s SshHostSubject) SubjectType() string { return SubSshHosts }
func (s SshHostSubject) GetField(f string) any {
	switch f {
	case "hostname":
		return s.Hostname
	default:
		return nil
	}
}

const SubSshHostGroups = "ssh-host-groups"

// SshHostGroupsSubject — "ssh-host-groups"
type SshHostGroupsSubject struct{}

func (s SshHostGroupsSubject) SubjectType() string { return SubSshHostGroups }
func (s SshHostGroupsSubject) GetField(string) any { return nil }

// ===========================
// PKI / Certificates
// ===========================

const SubCertificateAuthorities = "certificate-authorities"

// CertificateAuthoritySubject — "certificate-authorities"
type CertificateAuthoritySubject struct {
	Name string
}

func (s CertificateAuthoritySubject) SubjectType() string { return SubCertificateAuthorities }
func (s CertificateAuthoritySubject) GetField(f string) any {
	switch f {
	case "name":
		return s.Name
	default:
		return nil
	}
}

const SubCertificates = "certificates"

// CertificateSubject — "certificates"
type CertificateSubject struct {
	CommonName   string
	AltNames     string
	SerialNumber string
	FriendlyName string
	Status       string
}

func (s CertificateSubject) SubjectType() string { return SubCertificates } //nolint:gocritic // value receiver required by gocasl.Subject interface
func (s CertificateSubject) GetField(f string) any { //nolint:gocritic // value receiver required by gocasl.Subject interface
	switch f {
	case "commonName":
		return s.CommonName
	case "altNames":
		return s.AltNames
	case "serialNumber":
		return s.SerialNumber
	case "friendlyName":
		return s.FriendlyName
	case "status":
		return s.Status
	default:
		return nil
	}
}

const SubCertificateTemplates = "certificate-templates"

// CertificateTemplateSubject — "certificate-templates"
type CertificateTemplateSubject struct {
	Name string
}

func (s CertificateTemplateSubject) SubjectType() string { return SubCertificateTemplates }
func (s CertificateTemplateSubject) GetField(f string) any {
	switch f {
	case "name":
		return s.Name
	default:
		return nil
	}
}

const SubCertificateProfiles = "certificate-profiles"

// CertificateProfileSubject — "certificate-profiles"
type CertificateProfileSubject struct {
	Slug string
}

func (s CertificateProfileSubject) SubjectType() string { return SubCertificateProfiles }
func (s CertificateProfileSubject) GetField(f string) any {
	switch f {
	case "slug":
		return s.Slug
	default:
		return nil
	}
}

const SubCertificatePolicies = "certificate-policies"

// CertificatePolicySubject — "certificate-policies"
type CertificatePolicySubject struct {
	Name string
}

func (s CertificatePolicySubject) SubjectType() string { return SubCertificatePolicies }
func (s CertificatePolicySubject) GetField(f string) any {
	switch f {
	case "name":
		return s.Name
	default:
		return nil
	}
}

const SubPkiSubscribers = "pki-subscribers"

// PkiSubscriberSubject — "pki-subscribers"
type PkiSubscriberSubject struct {
	Name string
}

func (s PkiSubscriberSubject) SubjectType() string { return SubPkiSubscribers }
func (s PkiSubscriberSubject) GetField(f string) any {
	switch f {
	case "name":
		return s.Name
	default:
		return nil
	}
}

const SubPkiAlerts = "pki-alerts"

// PkiAlertsSubject — "pki-alerts"
type PkiAlertsSubject struct{}

func (s PkiAlertsSubject) SubjectType() string { return SubPkiAlerts }
func (s PkiAlertsSubject) GetField(string) any { return nil }

const SubPkiCollections = "pki-collections"

// PkiCollectionsSubject — "pki-collections"
type PkiCollectionsSubject struct{}

func (s PkiCollectionsSubject) SubjectType() string { return SubPkiCollections }
func (s PkiCollectionsSubject) GetField(string) any { return nil }

const SubPkiSyncs = "pki-syncs"

// PkiSyncSubject — "pki-syncs"
type PkiSyncSubject struct {
	SubscriberName string
	Name           string
}

func (s PkiSyncSubject) SubjectType() string { return SubPkiSyncs }
func (s PkiSyncSubject) GetField(f string) any {
	switch f {
	case "subscriberName":
		return s.SubscriberName
	case "name":
		return s.Name
	default:
		return nil
	}
}

const SubPkiDiscovery = "pki-discovery"

// PkiDiscoverySubject — "pki-discovery"
type PkiDiscoverySubject struct{}

func (s PkiDiscoverySubject) SubjectType() string { return SubPkiDiscovery }
func (s PkiDiscoverySubject) GetField(string) any { return nil }

const SubPkiCertificateInstalls = "pki-certificate-installations"

// PkiCertificateInstallsSubject — "pki-certificate-installations"
type PkiCertificateInstallsSubject struct{}

func (s PkiCertificateInstallsSubject) SubjectType() string { return SubPkiCertificateInstalls }
func (s PkiCertificateInstallsSubject) GetField(string) any { return nil }

// ===========================
// KMS / Crypto
// ===========================

const SubKms = "kms"

// KmsSubject — "kms"
type KmsSubject struct{}

func (s KmsSubject) SubjectType() string { return SubKms }
func (s KmsSubject) GetField(string) any { return nil }

const SubCmek = "cmek"

// CmekSubject — "cmek"
type CmekSubject struct{}

func (s CmekSubject) SubjectType() string { return SubCmek }
func (s CmekSubject) GetField(string) any { return nil }

const SubKmip = "kmip"

// KmipSubject — "kmip"
type KmipSubject struct{}

func (s KmipSubject) SubjectType() string { return SubKmip }
func (s KmipSubject) GetField(string) any { return nil }

// ===========================
// Secret Scanning
// ===========================

const SubSecretScanningDataSources = "secret-scanning-data-sources"

// SecretScanningDataSourcesSubject — "secret-scanning-data-sources"
type SecretScanningDataSourcesSubject struct{}

func (s SecretScanningDataSourcesSubject) SubjectType() string { return SubSecretScanningDataSources }
func (s SecretScanningDataSourcesSubject) GetField(string) any { return nil }

const SubSecretScanningFindings = "secret-scanning-findings"

// SecretScanningFindingsSubject — "secret-scanning-findings"
type SecretScanningFindingsSubject struct{}

func (s SecretScanningFindingsSubject) SubjectType() string { return SubSecretScanningFindings }
func (s SecretScanningFindingsSubject) GetField(string) any { return nil }

const SubSecretScanningConfigs = "secret-scanning-configs"

// SecretScanningConfigsSubject — "secret-scanning-configs"
type SecretScanningConfigsSubject struct{}

func (s SecretScanningConfigsSubject) SubjectType() string { return SubSecretScanningConfigs }
func (s SecretScanningConfigsSubject) GetField(string) any { return nil }

// ===========================
// App Connections
// ===========================

const SubAppConnections = "app-connections"

// AppConnectionSubject — "app-connections"
type AppConnectionSubject struct {
	ConnectionID string
}

func (s AppConnectionSubject) SubjectType() string { return SubAppConnections }
func (s AppConnectionSubject) GetField(f string) any {
	switch f {
	case "connectionId":
		return s.ConnectionID
	default:
		return nil
	}
}

// ===========================
// MCP
// ===========================

const SubMcpEndpoints = "mcp-endpoints"

// McpEndpointSubject — "mcp-endpoints"
type McpEndpointSubject struct {
	Name string
}

func (s McpEndpointSubject) SubjectType() string { return SubMcpEndpoints }
func (s McpEndpointSubject) GetField(f string) any {
	switch f {
	case "name":
		return s.Name
	default:
		return nil
	}
}

const SubMcpServers = "mcp-servers"

// McpServersSubject — "mcp-servers"
type McpServersSubject struct{}

func (s McpServersSubject) SubjectType() string { return SubMcpServers }
func (s McpServersSubject) GetField(string) any { return nil }

const SubMcpActivityLogs = "mcp-activity-logs"

// McpActivityLogsSubject — "mcp-activity-logs"
type McpActivityLogsSubject struct{}

func (s McpActivityLogsSubject) SubjectType() string { return SubMcpActivityLogs }
func (s McpActivityLogsSubject) GetField(string) any { return nil }

// ===========================
// PAM
// ===========================

const SubPamFolders = "pam-folders"

// PamFoldersSubject — "pam-folders"
type PamFoldersSubject struct{}

func (s PamFoldersSubject) SubjectType() string { return SubPamFolders }
func (s PamFoldersSubject) GetField(string) any { return nil }

const SubPamResources = "pam-resources"

// PamResourceSubject — "pam-resources"
type PamResourceSubject struct {
	Name     string
	Metadata []MetadataKeyValue
}

func (s PamResourceSubject) SubjectType() string { return SubPamResources }
func (s PamResourceSubject) GetField(f string) any {
	switch f {
	case "name":
		return s.Name
	case "metadata":
		return s.Metadata
	default:
		return nil
	}
}

const SubPamAccounts = "pam-accounts"

// PamAccountSubject — "pam-accounts"
type PamAccountSubject struct {
	ResourceName string
	AccountName  string
	Metadata     []MetadataKeyValue
}

func (s PamAccountSubject) SubjectType() string { return SubPamAccounts }
func (s PamAccountSubject) GetField(f string) any {
	switch f {
	case "resourceName":
		return s.ResourceName
	case "accountName":
		return s.AccountName
	case "metadata":
		return s.Metadata
	default:
		return nil
	}
}

const SubPamSessions = "pam-sessions"

// PamSessionsSubject — "pam-sessions"
type PamSessionsSubject struct{}

func (s PamSessionsSubject) SubjectType() string { return SubPamSessions }
func (s PamSessionsSubject) GetField(string) any { return nil }

const SubPamDiscovery = "pam-discovery"

// PamDiscoverySubject — "pam-discovery"
type PamDiscoverySubject struct{}

func (s PamDiscoverySubject) SubjectType() string { return SubPamDiscovery }
func (s PamDiscoverySubject) GetField(string) any { return nil }

// ===========================
// Approval
// ===========================

const SubApprovalRequests = "approval-requests"

// ApprovalRequestsSubject — "approval-requests"
type ApprovalRequestsSubject struct{}

func (s ApprovalRequestsSubject) SubjectType() string { return SubApprovalRequests }
func (s ApprovalRequestsSubject) GetField(string) any { return nil }

const SubApprovalRequestGrants = "approval-request-grants"

// ApprovalRequestGrantsSubject — "approval-request-grants"
type ApprovalRequestGrantsSubject struct{}

func (s ApprovalRequestGrantsSubject) SubjectType() string { return SubApprovalRequestGrants }
func (s ApprovalRequestGrantsSubject) GetField(string) any { return nil }
