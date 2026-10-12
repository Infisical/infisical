package license

var (
	ActiveCerts                  = Feature{V2: "active_certs", V1: ""}
	AuditLogStreamLimit          = Feature{V2: "audit_log_stream_limit", V1: "auditLogStreamLimit"}
	AuditLogStreams              = Feature{V2: "audit_log_streams", V1: "auditLogStreams"}
	AuditLogs                    = Feature{V2: "audit_logs", V1: "auditLogs"}
	AuditRetentionDays           = Feature{V2: "audit_retention_days", V1: "auditLogsRetentionDays"}
	CACRL                        = Feature{V2: "ca_crl", V1: "caCrl"}
	CertManager                  = Feature{V2: "cert_manager", V1: "certManager"}
	CrossProjectSecretSharing    = Feature{V2: "cross_project_secret_sharing", V1: "crossProjectSecretSharing"}
	CustomAlerts                 = Feature{V2: "custom_alerts", V1: "customAlerts"}
	CustomRateLimits             = Feature{V2: "custom_rate_limits", V1: "customRateLimits"}
	DynamicSecret                = Feature{V2: "dynamic_secret", V1: "dynamicSecret"}
	EnforceGoogleSSO             = Feature{V2: "enforce_google_sso", V1: "enforceGoogleSSO"}
	EnforceMFA                   = Feature{V2: "enforce_mfa", V1: "enforceMfa"}
	EnterpriseAppConnections     = Feature{V2: "enterprise_app_connections", V1: "enterpriseAppConnections"}
	EnterprisePAMAccount         = Feature{V2: "enterprise_pam_account", V1: "enterprisePamAccount"}
	EnterpriseSecretSyncs        = Feature{V2: "enterprise_secret_syncs", V1: "enterpriseSecretSyncs"}
	EnvironmentLimit             = Feature{V2: "environment_limit", V1: "environmentLimit"}
	EventSubscriptions           = Feature{V2: "event_subscriptions", V1: "eventSubscriptions"}
	ExternalKMS                  = Feature{V2: "external_kms", V1: "externalKms"}
	FIPS                         = Feature{V2: "fips", V1: "fips"}
	Gateway                      = Feature{V2: "gateway", V1: "gateway"}
	GatewayPool                  = Feature{V2: "gateway_pool", V1: "gatewayPool"}
	GithubOrgSync                = Feature{V2: "github_org_sync", V1: "githubOrgSync"}
	Groups                       = Feature{V2: "groups", V1: "groups"}
	HSM                          = Feature{V2: "hsm", V1: "hsm"}
	HoneyTokenLimit              = Feature{V2: "honey_token_limit", V1: "honeyTokenLimit"}
	HoneyTokens                  = Feature{V2: "honey_tokens", V1: "honeyTokens"}
	IPAllowlisting               = Feature{V2: "ip_allowlisting", V1: "ipAllowlisting"}
	Identities                   = Feature{V2: "identities", V1: ""}
	InstanceUserManagement       = Feature{V2: "instance_user_management", V1: "instanceUserManagement"}
	InternalCAs                  = Feature{V2: "internal_cas", V1: ""}
	KMIP                         = Feature{V2: "kmip", V1: "kmip"}
	KMSPQC                       = Feature{V2: "kms_pqc", V1: "kmsPqc"}
	LDAP                         = Feature{V2: "ldap", V1: "ldap"}
	MachineIdentityAuthTemplates = Feature{V2: "machine_identity_auth_templates", V1: "machineIdentityAuthTemplates"}
	MaxCAs                       = Feature{V2: "max_cas", V1: "maxCas"}
	MaxCertificates              = Feature{V2: "max_certificates", V1: "maxCertificates"}
	MaxIdentityLimit             = Feature{V2: "max_identity_limit", V1: "identityLimit"}
	MaxInternalCAs               = Feature{V2: "max_internal_cas", V1: "maxInternalCas"}
	MaxPAMAccounts               = Feature{V2: "max_pam_accounts", V1: "maxPamAccounts"}
	MaxSansPerCertificate        = Feature{V2: "max_sans_per_certificate", V1: "maxSansPerCertificate"}
	MaxWildcardCertificates      = Feature{V2: "max_wildcard_certificates", V1: "maxWildcardCertificates"}
	OIDCSSO                      = Feature{V2: "oidc_sso", V1: "oidcSSO"}
	PAM                          = Feature{V2: "pam", V1: "pam"}
	PAMSlackNotifications        = Feature{V2: "pam_slack_notifications", V1: "pamSlackNotifications"}
	PITRecovery                  = Feature{V2: "pit_recovery", V1: "pitRecovery"}
	PKIACME                      = Feature{V2: "pki_acme", V1: "pkiAcme"}
	PKIApprovals                 = Feature{V2: "pki_approvals", V1: "pkiApprovals"}
	PKICodeSigning               = Feature{V2: "pki_code_signing", V1: "pkiCodeSigning"}
	PKIDiscovery                 = Feature{V2: "pki_discovery", V1: "pkiDiscovery"}
	PKIEST                       = Feature{V2: "pki_est", V1: "pkiEst"}
	PKIEnterpriseAlerting        = Feature{V2: "pki_enterprise_alerting", V1: "pkiEnterpriseAlerting"}
	PKIEnterpriseCAIntegrations  = Feature{V2: "pki_enterprise_ca_integrations", V1: "pkiEnterpriseCaIntegrations"}
	PKIExternalIntermediateCA    = Feature{V2: "pki_external_intermediate_ca", V1: "pkiExternalIntermediateCa"}
	PKIPQC                       = Feature{V2: "pki_pqc", V1: "pkiPqc"}
	PKISCEP                      = Feature{V2: "pki_scep", V1: "pkiScep"}
	PKISyncs                     = Feature{V2: "pki_syncs", V1: "pkiSyncs"}
	ProjectTemplates             = Feature{V2: "project_templates", V1: "projectTemplates"}
	RBAC                         = Feature{V2: "rbac", V1: "rbac"}
	ReadRateLimit                = Feature{V2: "read_rate_limit", V1: "rateLimits.readLimit"}
	SAMLSSO                      = Feature{V2: "saml_sso", V1: "samlSSO"}
	SCIM                         = Feature{V2: "scim", V1: "scim"}
	SSOEnforcement               = Feature{V2: "sso_enforcement", V1: ""}
	SecretAccessInsights         = Feature{V2: "secret_access_insights", V1: "secretAccessInsights"}
	SecretApproval               = Feature{V2: "secret_approval", V1: "secretApproval"}
	SecretRotation               = Feature{V2: "secret_rotation", V1: "secretRotation"}
	SecretScanning               = Feature{V2: "secret_scanning", V1: "secretScanning"}
	SecretShareExternalBranding  = Feature{V2: "secret_share_external_branding", V1: "secretShareExternalBranding"}
	SecretSyncLimit              = Feature{V2: "secret_sync_limit", V1: "secretSyncLimit"}
	SecretVersioning             = Feature{V2: "secret_versioning", V1: "secretVersioning"}
	SecretsBrokering             = Feature{V2: "secrets_brokering", V1: "secretsBrokering"}
	SecretsFolderRBAC            = Feature{V2: "secrets_folder_rbac", V1: "secretsFolderRbac"}
	SecretsRateLimit             = Feature{V2: "secrets_rate_limit", V1: "rateLimits.secretsLimit"}
	SecretsTemporaryAccess       = Feature{V2: "secrets_temporary_access", V1: "secretsTemporaryAccess"}
	SubOrganization              = Feature{V2: "sub_organization", V1: "subOrganization"}
	WildcardCerts                = Feature{V2: "wildcard_certs", V1: ""}
	WriteRateLimit               = Feature{V2: "write_rate_limit", V1: "rateLimits.writeLimit"}
)

// All is every mapped feature. Enterprise turns all of them on, which it has to do
// explicitly: projectV2ToFeatureSet layers entitlements over the OSS defaults, so a
// feature the stub omits stays off.
var All = []Feature{
	ActiveCerts,
	AuditLogStreamLimit,
	AuditLogStreams,
	AuditLogs,
	AuditRetentionDays,
	CACRL,
	CertManager,
	CrossProjectSecretSharing,
	CustomAlerts,
	CustomRateLimits,
	DynamicSecret,
	EnforceGoogleSSO,
	EnforceMFA,
	EnterpriseAppConnections,
	EnterprisePAMAccount,
	EnterpriseSecretSyncs,
	EnvironmentLimit,
	EventSubscriptions,
	ExternalKMS,
	FIPS,
	Gateway,
	GatewayPool,
	GithubOrgSync,
	Groups,
	HSM,
	HoneyTokenLimit,
	HoneyTokens,
	IPAllowlisting,
	Identities,
	InstanceUserManagement,
	InternalCAs,
	KMIP,
	KMSPQC,
	LDAP,
	MachineIdentityAuthTemplates,
	MaxCAs,
	MaxCertificates,
	MaxIdentityLimit,
	MaxInternalCAs,
	MaxPAMAccounts,
	MaxSansPerCertificate,
	MaxWildcardCertificates,
	OIDCSSO,
	PAM,
	PAMSlackNotifications,
	PITRecovery,
	PKIACME,
	PKIApprovals,
	PKICodeSigning,
	PKIDiscovery,
	PKIEST,
	PKIEnterpriseAlerting,
	PKIEnterpriseCAIntegrations,
	PKIExternalIntermediateCA,
	PKIPQC,
	PKISCEP,
	PKISyncs,
	ProjectTemplates,
	RBAC,
	ReadRateLimit,
	SAMLSSO,
	SCIM,
	SSOEnforcement,
	SecretAccessInsights,
	SecretApproval,
	SecretRotation,
	SecretScanning,
	SecretShareExternalBranding,
	SecretSyncLimit,
	SecretVersioning,
	SecretsBrokering,
	SecretsFolderRBAC,
	SecretsRateLimit,
	SecretsTemporaryAccess,
	SubOrganization,
	WildcardCerts,
	WriteRateLimit,
}
