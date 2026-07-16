//go:build integration

package infra

// Request and response types for Node.js API calls.
// These provide type safety without requiring full OpenAPI code generation.

// BootstrapRequest is the request body for POST /api/v1/admin/bootstrap.
type BootstrapRequest struct {
	Email        string `json:"email"`
	Password     string `json:"password"`
	Organization string `json:"organization"`
}

// BootstrapResponse is the response from POST /api/v1/admin/bootstrap.
type BootstrapResponse struct {
	Organization struct {
		ID string `json:"id"`
	} `json:"organization"`
	Identity struct {
		Credentials struct {
			Token string `json:"token"`
		} `json:"credentials"`
	} `json:"identity"`
	User struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	} `json:"user"`
}

// LoginRequest is the request body for POST /api/v3/auth/login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginResponse is the response from POST /api/v3/auth/login.
type LoginResponse struct {
	AccessToken string `json:"accessToken"`
}

// SelectOrgRequest is the request body for POST /api/v3/auth/select-organization.
type SelectOrgRequest struct {
	OrganizationID string `json:"organizationId"`
}

// SelectOrgResponse is the response from POST /api/v3/auth/select-organization.
type SelectOrgResponse struct {
	Token string `json:"token"`
}

// CreateProjectRequest is the request body for POST /api/v1/projects.
type CreateProjectRequest struct {
	ProjectName string `json:"projectName"`
	Slug        string `json:"slug"`
	Type        string `json:"type"`
}

// CreateProjectResponse is the response from POST /api/v1/projects.
type CreateProjectResponse struct {
	Project struct {
		ID   string `json:"id"`
		Slug string `json:"slug"`
	} `json:"project"`
}

// CreateIdentityRequest is the request body for POST /api/v1/identities.
type CreateIdentityRequest struct {
	Name           string `json:"name"`
	OrganizationID string `json:"organizationId"`
	Role           string `json:"role"`
}

// CreateIdentityResponse is the response from POST /api/v1/identities.
type CreateIdentityResponse struct {
	Identity struct {
		ID string `json:"id"`
	} `json:"identity"`
}

// RoleAssignment represents a role with optional temporary access settings.
type RoleAssignment struct {
	Role                     string `json:"role"`
	IsTemporary              bool   `json:"isTemporary,omitempty"`
	TemporaryMode            string `json:"temporaryMode,omitempty"`
	TemporaryRange           string `json:"temporaryRange,omitempty"`
	TemporaryAccessStartTime string `json:"temporaryAccessStartTime,omitempty"`
}

// AddIdentityToProjectWithRolesRequest is the request body with roles array.
type AddIdentityToProjectWithRolesRequest struct {
	Roles []RoleAssignment `json:"roles"`
}

// InviteToOrgRequest is the request body for POST /api/v1/invite-org/signup.
type InviteToOrgRequest struct {
	InviteeEmails  []string `json:"inviteeEmails"`
	OrganizationID string   `json:"organizationId"`
}

// AddUserToProjectRequest is the request body for POST /api/v1/projects/{id}/memberships.
type AddUserToProjectRequest struct {
	Usernames []string `json:"usernames"`
	RoleSlugs []string `json:"roleSlugs"`
}

// Permission represents a CASL permission rule.
type Permission struct {
	Subject    string         `json:"subject"`
	Action     any            `json:"action"`
	Conditions map[string]any `json:"conditions,omitempty"`
	Inverted   bool           `json:"inverted,omitempty"`
}

// CreateCustomRoleRequest is the request body for POST /api/v1/projects/{id}/roles.
type CreateCustomRoleRequest struct {
	Slug        string       `json:"slug"`
	Name        string       `json:"name"`
	Permissions []Permission `json:"permissions"`
}

// CreateCustomRoleResponse is the response from POST /api/v1/projects/{id}/roles.
type CreateCustomRoleResponse struct {
	Role struct {
		ID   string `json:"id"`
		Slug string `json:"slug"`
		Name string `json:"name"`
	} `json:"role"`
}

// CreateGroupRequest is the request body for POST /api/v1/groups.
type CreateGroupRequest struct {
	Name string `json:"name"`
	Role string `json:"role"`
}

// CreateGroupResponse is the response from POST /api/v1/groups.
type CreateGroupResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

// AddGroupToProjectRequest is the request body for POST /api/v1/projects/{id}/memberships/groups/{id}.
type AddGroupToProjectRequest struct {
	Role string `json:"role"`
}

// PrivilegeType specifies whether a privilege is temporary.
type PrivilegeType struct {
	IsTemporary              bool   `json:"isTemporary"`
	TemporaryMode            string `json:"temporaryMode,omitempty"`
	TemporaryRange           string `json:"temporaryRange,omitempty"`
	TemporaryAccessStartTime string `json:"temporaryAccessStartTime,omitempty"`
}

// CreateIdentityPrivilegeRequest is the request body for POST /api/v2/identity-project-additional-privilege.
type CreateIdentityPrivilegeRequest struct {
	IdentityID  string        `json:"identityId"`
	ProjectID   string        `json:"projectId"`
	Permissions []Permission  `json:"permissions"`
	Type        PrivilegeType `json:"type"`
}

// CreateUserPrivilegeRequest is the request body for POST /api/v1/user-project-additional-privilege.
type CreateUserPrivilegeRequest struct {
	ProjectMembershipID string        `json:"projectMembershipId"`
	Permissions         []Permission  `json:"permissions"`
	Type                PrivilegeType `json:"type"`
}

// SecretMetadataEntry represents a metadata key-value pair for a secret.
type SecretMetadataEntry struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	IsEncrypted bool   `json:"isEncrypted,omitempty"`
}

// CreateSecretRequest is the request body for POST /api/v4/secrets/{key}.
type CreateSecretRequest struct {
	ProjectID                string                `json:"projectId"`
	Environment              string                `json:"environment"`
	SecretPath               string                `json:"secretPath"`
	SecretValue              string                `json:"secretValue"`
	SecretComment            string                `json:"secretComment,omitempty"`
	SecretMetadata           []SecretMetadataEntry `json:"secretMetadata,omitempty"`
	Type                     string                `json:"type"`
	TagIDs                   []string              `json:"tagIds,omitempty"`
	SecretReminderNote       string                `json:"secretReminderNote,omitempty"`
	SecretReminderRepeatDays *int                  `json:"secretReminderRepeatDays,omitempty"`
}

// CreateSecretResponse is the response from POST /api/v4/secrets/{key}.
type CreateSecretResponse struct {
	Secret struct {
		ID string `json:"id"`
	} `json:"secret"`
}

// GetSecretResponse is the response from GET /api/v4/secrets/{key}.
type GetSecretResponse struct {
	Secret struct {
		ID          string `json:"id"`
		Key         string `json:"secretKey"`
		Value       string `json:"secretValue"`
		Version     int    `json:"version"`
		SecretPath  string `json:"secretPath"`
		Environment string `json:"environment"`
	} `json:"secret"`
}

// CreateFolderRequest is the request body for POST /api/v2/folders.
type CreateFolderRequest struct {
	ProjectID   string `json:"projectId"`
	Environment string `json:"environment"`
	Path        string `json:"path"`
	Name        string `json:"name"`
}

// CreateFolderResponse is the response from POST /api/v2/folders.
type CreateFolderResponse struct {
	Folder struct {
		ID string `json:"id"`
	} `json:"folder"`
}

// SecretImportTarget specifies the source for a secret import.
type SecretImportTarget struct {
	Environment string `json:"environment"`
	Path        string `json:"path"`
}

// CreateSecretImportRequest is the request body for POST /api/v2/secret-imports.
type CreateSecretImportRequest struct {
	ProjectID   string             `json:"projectId"`
	Environment string             `json:"environment"`
	Path        string             `json:"path"`
	Import      SecretImportTarget `json:"import"`
}

// CreateSecretImportResponse is the response from POST /api/v2/secret-imports.
type CreateSecretImportResponse struct {
	SecretImport struct {
		ID string `json:"id"`
	} `json:"secretImport"`
}

// CreateEnvironmentRequest is the request body for POST /api/v1/projects/{id}/environments.
type CreateEnvironmentRequest struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

// CreateEnvironmentResponse is the response from POST /api/v1/projects/{id}/environments.
type CreateEnvironmentResponse struct {
	Environment struct {
		ID string `json:"id"`
	} `json:"environment"`
}

// CreateTagRequest is the request body for POST /api/v1/projects/{id}/tags.
type CreateTagRequest struct {
	Slug  string `json:"slug"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// CreateTagResponse is the response from POST /api/v1/projects/{id}/tags.
type CreateTagResponse struct {
	Tag struct {
		ID string `json:"id"`
	} `json:"tag"`
}

// IPAddress represents a trusted IP address.
type IPAddress struct {
	IPAddress string `json:"ipAddress"`
}

// CreateUniversalAuthRequest is the request body for POST /api/v1/auth/universal-auth/identities/{id}.
type CreateUniversalAuthRequest struct {
	IdentityID                    string      `json:"identityId"`
	AccessTokenTrustedIPs         []IPAddress `json:"accessTokenTrustedIps"`
	AccessTokenTTL                int         `json:"accessTokenTTL"`
	AccessTokenMaxTTL             int         `json:"accessTokenMaxTTL"`
	AccessTokenNumUsesLimit       int         `json:"accessTokenNumUsesLimit"`
	ClientSecretTrustedIPs        []IPAddress `json:"clientSecretTrustedIps"`
	ClientSecretNumUsesLimit      int         `json:"clientSecretNumUsesLimit"`
	IsClientSecretRotationEnabled bool        `json:"isClientSecretRotationEnabled"`
}

// CreateUniversalAuthResponse is the response from POST /api/v1/auth/universal-auth/identities/{id}.
type CreateUniversalAuthResponse struct {
	IdentityUniversalAuth struct {
		ID       string `json:"id"`
		ClientID string `json:"clientId"`
	} `json:"identityUniversalAuth"`
}

// CreateClientSecretRequest is the request body for POST /api/v1/auth/universal-auth/identities/{id}/client-secrets.
type CreateClientSecretRequest struct {
	Description  string `json:"description"`
	TTL          int    `json:"ttl"`
	NumUsesLimit int    `json:"numUsesLimit"`
}

// CreateClientSecretResponse is the response from POST /api/v1/auth/universal-auth/identities/{id}/client-secrets.
// Note: clientId is NOT in this response - it's in the universal auth creation response.
type CreateClientSecretResponse struct {
	ClientSecretData struct {
		ID                 string `json:"id"`
		ClientSecretPrefix string `json:"clientSecretPrefix"`
	} `json:"clientSecretData"`
	ClientSecret string `json:"clientSecret"`
}

// UniversalAuthLoginRequest is the request body for POST /api/v1/auth/universal-auth/login.
type UniversalAuthLoginRequest struct {
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
}

// UniversalAuthLoginResponse is the response from POST /api/v1/auth/universal-auth/login.
type UniversalAuthLoginResponse struct {
	AccessToken string `json:"accessToken"`
}

// CreateOrgRequest is the request body for POST /api/v1/organizations.
type CreateOrgRequest struct {
	Name string `json:"name"`
}

// CreateOrgResponse is the response from POST /api/v1/organizations.
type CreateOrgResponse struct {
	Organization struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"organization"`
}

// OrgSeed contains metadata for an org created via the Node.js API.
type OrgSeed struct {
	ID   string
	Name string
}
