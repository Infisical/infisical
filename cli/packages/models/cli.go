package models

import "time"

type UserCredentials struct {
	Email        string `json:"email"`
	PrivateKey   string `json:"privateKey"`
	JTWToken     string `json:"JTWToken"`
	RefreshToken string `json:"RefreshToken"`
}

// The file struct for Infisical config file
type ConfigFile struct {
	LoggedInUserEmail      string         `json:"loggedInUserEmail"`
	LoggedInUserDomain     string         `json:"LoggedInUserDomain,omitempty"`
	LoggedInUsers          []LoggedInUser `json:"loggedInUsers,omitempty"`
	VaultBackendType       string         `json:"vaultBackendType,omitempty"`
	VaultBackendPassphrase string         `json:"vaultBackendPassphrase,omitempty"`
}

type LoggedInUser struct {
	Email  string `json:"email"`
	Domain string `json:"domain"`
}

type SingleEnvironmentVariable struct {
	Key         string `json:"key"`
	WorkspaceId string `json:"workspace"`
	Value       string `json:"value"`
	Type        string `json:"type"`
	ID          string `json:"_id"`
	Tags        []struct {
		ID        string `json:"_id"`
		Name      string `json:"name"`
		Slug      string `json:"slug"`
		Workspace string `json:"workspace"`
	} `json:"tags"`
	Comment string `json:"comment"`
	Etag    string `json:"Etag"`
}

type PlaintextSecretResult struct {
	Secrets []SingleEnvironmentVariable
	Etag    string
}

type DynamicSecret struct {
	Id         string `json:"id"`
	DefaultTTL string `json:"defaultTTL"`
	MaxTTL     string `json:"maxTTL"`
	Type       string `json:"type"`
}

type DynamicSecretLease struct {
	Lease struct {
		Id       string    `json:"id"`
		ExpireAt time.Time `json:"expireAt"`
	} `json:"lease"`
	DynamicSecret DynamicSecret `json:"dynamicSecret"`
	// this is a varying dict based on provider
	Data map[string]interface{} `json:"data"`
}

type TokenDetails struct {
	Type  string
	Token string
}

type SingleFolder struct {
	ID   string `json:"_id"`
	Name string `json:"name"`
}

type Workspace struct {
	ID             string `json:"_id"`
	Name           string `json:"name"`
	Plan           string `json:"plan,omitempty"`
	V              int    `json:"__v"`
	OrganizationId string `json:"orgId"`
}

type WorkspaceConfigFile struct {
	WorkspaceId                   string            `json:"workspaceId"`
	DefaultEnvironment            string            `json:"defaultEnvironment"`
	GitBranchToEnvironmentMapping map[string]string `json:"gitBranchToEnvironmentMapping"`
}

type SymmetricEncryptionResult struct {
	CipherText []byte `json:"CipherText"`
	Nonce      []byte `json:"Nonce"`
	AuthTag    []byte `json:"AuthTag"`
}

type GetAllSecretsParameters struct {
	Environment              string
	EnvironmentPassedViaFlag bool
	InfisicalToken           string
	UniversalAuthAccessToken string
	TagSlugs                 string
	WorkspaceId              string
	SecretsPath              string
	IncludeImport            bool
	Recursive                bool
}

type GetAllFoldersParameters struct {
	WorkspaceId              string
	Environment              string
	FoldersPath              string
	InfisicalToken           string
	UniversalAuthAccessToken string
}

type CreateFolderParameters struct {
	FolderName     string
	WorkspaceId    string
	Environment    string
	FolderPath     string
	InfisicalToken string
}

type DeleteFolderParameters struct {
	FolderName     string
	WorkspaceId    string
	Environment    string
	FolderPath     string
	InfisicalToken string
}

type ExpandSecretsAuthentication struct {
	InfisicalToken           string
	UniversalAuthAccessToken string
}

type MachineIdentityCredentials struct {
	ClientId     string
	ClientSecret string
}

type SecretSetOperation struct {
	SecretKey       string
	SecretValue     string
	SecretOperation string
}

type BackupSecretKeyRing struct {
	ProjectID   string `json:"projectId"`
	Environment string `json:"environment"`
	SecretPath  string `json:"secretPath"`
	Secrets     []SingleEnvironmentVariable
}
