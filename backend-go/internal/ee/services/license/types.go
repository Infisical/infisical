package license

import "encoding/json"

type LicenseType string

const (
	OnlineLicenseType  LicenseType = "online"
	OfflineLicenseType LicenseType = "offline"
)

type InstanceType string

const (
	InstanceTypeOnPrem                  InstanceType = "self-hosted"
	InstanceTypeEnterpriseOnPrem        InstanceType = "enterprise-self-hosted"
	InstanceTypeEnterpriseOnPremOffline InstanceType = "enterprise-self-hosted-offline"
	InstanceTypeCloud                   InstanceType = "cloud"
)

type RateLimits struct {
	ReadLimit    int `json:"readLimit"`
	WriteLimit   int `json:"writeLimit"`
	SecretsLimit int `json:"secretsLimit"`
}

// IntOrBool handles JSON fields that can be either an integer or a boolean.
// When the value is true, it unmarshals as 1. When false or missing, it unmarshals as 0.
// auditLogsRetentionDays returns the number of days to retain audit logs or sometimes as true
type IntOrBool int

func (i *IntOrBool) UnmarshalJSON(data []byte) error {
	var intVal int
	if err := json.Unmarshal(data, &intVal); err == nil {
		*i = IntOrBool(intVal)
		return nil
	}

	var boolVal bool
	if err := json.Unmarshal(data, &boolVal); err == nil {
		if boolVal {
			*i = 1
		} else {
			*i = 0
		}
		return nil
	}

	*i = 0
	return nil
}

type FeatureSet struct {
	ID                           *string    `json:"_id"`
	Slug                         *string    `json:"slug"`
	Tier                         int        `json:"tier"`
	WorkspaceLimit               *int       `json:"workspaceLimit"`
	WorkspacesUsed               int        `json:"workspacesUsed"`
	MemberLimit                  *int       `json:"memberLimit"`
	MembersUsed                  int        `json:"membersUsed"`
	IdentityLimit                *int       `json:"identityLimit"`
	IdentitiesUsed               int        `json:"identitiesUsed"`
	EnvironmentLimit             *int       `json:"environmentLimit"`
	EnvironmentsUsed             int        `json:"environmentsUsed"`
	DynamicSecret                bool       `json:"dynamicSecret"`
	SecretVersioning             bool       `json:"secretVersioning"`
	PitRecovery                  bool       `json:"pitRecovery"`
	IPAllowlisting               bool       `json:"ipAllowlisting"`
	RBAC                         bool       `json:"rbac"`
	CustomRateLimits             bool       `json:"customRateLimits"`
	CustomAlerts                 bool       `json:"customAlerts"`
	AuditLogs                    bool       `json:"auditLogs"`
	AuditLogsRetentionDays       IntOrBool  `json:"auditLogsRetentionDays"`
	AuditLogStreams              bool       `json:"auditLogStreams"`
	AuditLogStreamLimit          int        `json:"auditLogStreamLimit"`
	GithubOrgSync                bool       `json:"githubOrgSync"`
	SamlSSO                      bool       `json:"samlSSO"`
	EnforceGoogleSSO             bool       `json:"enforceGoogleSSO"`
	HSM                          bool       `json:"hsm"`
	OidcSSO                      bool       `json:"oidcSSO"`
	SecretAccessInsights         bool       `json:"secretAccessInsights"`
	SCIM                         bool       `json:"scim"`
	LDAP                         bool       `json:"ldap"`
	Groups                       bool       `json:"groups"`
	SubOrganization              bool       `json:"subOrganization"`
	Status                       *string    `json:"status"`
	SecretApproval               bool       `json:"secretApproval"`
	SecretRotation               bool       `json:"secretRotation"`
	CaCrl                        bool       `json:"caCrl"`
	InstanceUserManagement       bool       `json:"instanceUserManagement"`
	ExternalKMS                  bool       `json:"externalKms"`
	RateLimits                   RateLimits `json:"rateLimits"`
	PkiEst                       bool       `json:"pkiEst"`
	PkiAcme                      bool       `json:"pkiAcme"`
	EnforceMfa                   bool       `json:"enforceMfa"`
	ProjectTemplates             bool       `json:"projectTemplates"`
	KMIP                         bool       `json:"kmip"`
	Gateway                      bool       `json:"gateway"`
	SSHHostGroups                bool       `json:"sshHostGroups"`
	SecretScanning               bool       `json:"secretScanning"`
	EnterpriseSecretSyncs        bool       `json:"enterpriseSecretSyncs"`
	EnterpriseCertificateSyncs   bool       `json:"enterpriseCertificateSyncs"`
	EnterpriseAppConnections     bool       `json:"enterpriseAppConnections"`
	MachineIdentityAuthTemplates bool       `json:"machineIdentityAuthTemplates"`
	PkiLegacyTemplates           bool       `json:"pkiLegacyTemplates"`
	FIPS                         bool       `json:"fips"`
	EventSubscriptions           bool       `json:"eventSubscriptions"`
	SecretShareExternalBranding  bool       `json:"secretShareExternalBranding"`
}

func DefaultFeatures() FeatureSet {
	return FeatureSet{
		Tier:                   -1,
		SecretVersioning:       true,
		AuditLogStreamLimit:    3,
		AuditLogs:              false,
		AuditLogsRetentionDays: 0,
		RateLimits: RateLimits{
			ReadLimit:    60,
			WriteLimit:   200,
			SecretsLimit: 40,
		},
	}
}

type OfflineLicenseContents struct {
	License   OfflineLicenseInfo `json:"license"`
	Signature string             `json:"signature"`
}

type OfflineLicenseInfo struct {
	IssuedTo     string          `json:"issuedTo"`
	LicenseID    string          `json:"licenseId"`
	CustomerID   *string         `json:"customerId"`
	IssuedAt     string          `json:"issuedAt"`
	ExpiresAt    *string         `json:"expiresAt"`
	TerminatesAt *string         `json:"terminatesAt"`
	Features     json.RawMessage `json:"features"`
}
