package api

import "time"

type GetEncryptedWorkspaceKeyRequest struct {
	WorkspaceId string `json:"workspaceId"`
}

type GetEncryptedWorkspaceKeyResponse struct {
	ID           string `json:"_id"`
	EncryptedKey string `json:"encryptedKey"`
	Nonce        string `json:"nonce"`
	Sender       struct {
		ID             string    `json:"_id"`
		Email          string    `json:"email"`
		RefreshVersion int       `json:"refreshVersion"`
		CreatedAt      time.Time `json:"createdAt"`
		UpdatedAt      time.Time `json:"updatedAt"`
		V              int       `json:"__v"`
		FirstName      string    `json:"firstName"`
		LastName       string    `json:"lastName"`
		PublicKey      string    `json:"publicKey"`
	} `json:"sender"`
	Receiver  string    `json:"receiver"`
	Workspace string    `json:"workspace"`
	V         int       `json:"__v"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type GetEncryptedSecretsV3Request struct {
	Environment   string `json:"environment"`
	WorkspaceId   string `json:"workspaceId"`
	Recursive     bool   `json:"recursive"`
	SecretPath    string `json:"secretPath"`
	IncludeImport bool   `json:"include_imports"`
	ETag          string `json:"etag,omitempty"`
}

type EncryptedSecretV3 struct {
	ID        string `json:"_id"`
	Version   int    `json:"version"`
	Workspace string `json:"workspace"`
	Type      string `json:"type"`
	Tags      []struct {
		ID        string `json:"_id"`
		Name      string `json:"name"`
		Slug      string `json:"slug"`
		Workspace string `json:"workspace"`
	} `json:"tags"`
	Environment             string    `json:"environment"`
	SecretKeyCiphertext     string    `json:"secretKeyCiphertext"`
	SecretKeyIV             string    `json:"secretKeyIV"`
	SecretKeyTag            string    `json:"secretKeyTag"`
	SecretValueCiphertext   string    `json:"secretValueCiphertext"`
	SecretValueIV           string    `json:"secretValueIV"`
	SecretValueTag          string    `json:"secretValueTag"`
	SecretCommentCiphertext string    `json:"secretCommentCiphertext"`
	SecretCommentIV         string    `json:"secretCommentIV"`
	SecretCommentTag        string    `json:"secretCommentTag"`
	Algorithm               string    `json:"algorithm"`
	KeyEncoding             string    `json:"keyEncoding"`
	Folder                  string    `json:"folder"`
	V                       int       `json:"__v"`
	CreatedAt               time.Time `json:"createdAt"`
	UpdatedAt               time.Time `json:"updatedAt"`
}

type DecryptedSecretV3 struct {
	ID            string `json:"id"`
	Workspace     string `json:"workspace"`
	Environment   string `json:"environment"`
	Version       int    `json:"version"`
	Type          string `json:"string"`
	SecretKey     string `json:"secretKey"`
	SecretValue   string `json:"secretValue"`
	SecretComment string `json:"secretComment"`
}

type ImportedSecretV3 struct {
	Environment string              `json:"environment"`
	FolderId    string              `json:"folderId"`
	SecretPath  string              `json:"secretPath"`
	Secrets     []EncryptedSecretV3 `json:"secrets"`
}

type ImportedRawSecretV3 struct {
	Environment string              `json:"environment"`
	FolderId    string              `json:"folderId"`
	SecretPath  string              `json:"secretPath"`
	Secrets     []DecryptedSecretV3 `json:"secrets"`
}

type GetEncryptedSecretsV3Response struct {
	Secrets         []EncryptedSecretV3 `json:"secrets"`
	ImportedSecrets []ImportedSecretV3  `json:"imports,omitempty"`
	Modified        bool                `json:"modified,omitempty"`
	ETag            string              `json:"ETag,omitempty"`
}

type GetDecryptedSecretsV3Response struct {
	Secrets  []DecryptedSecretV3   `json:"secrets"`
	ETag     string                `json:"ETag,omitempty"`
	Modified bool                  `json:"modified,omitempty"`
	Imports  []ImportedRawSecretV3 `json:"imports,omitempty"`
}

type GetDecryptedSecretsV3Request struct {
	ProjectID              string `json:"workspaceId"`
	ProjectSlug            string `json:"workspaceSlug"`
	Environment            string `json:"environment"`
	SecretPath             string `json:"secretPath"`
	Recursive              bool   `json:"recursive"`
	ExpandSecretReferences bool   `json:"expandSecretReferences"`
	ETag                   string `json:"etag,omitempty"`
}

type GetServiceTokenDetailsResponse struct {
	ID           string `json:"_id"`
	Name         string `json:"name"`
	Workspace    string `json:"workspace"`
	Environment  string `json:"environment"`
	EncryptedKey string `json:"encryptedKey"`
	Iv           string `json:"iv"`
	Tag          string `json:"tag"`
	SecretPath   string `json:"secretPath"`
}

type ServiceAccountDetailsResponse struct {
	ServiceAccount struct {
		ID           string    `json:"_id"`
		Name         string    `json:"name"`
		Organization string    `json:"organization"`
		PublicKey    string    `json:"publicKey"`
		LastUsed     time.Time `json:"lastUsed"`
		ExpiresAt    time.Time `json:"expiresAt"`
	} `json:"serviceAccount"`
}

type MachineIdentityDetailsResponse struct {
	AccessToken       string `json:"accessToken"`
	ExpiresIn         int    `json:"expiresIn"`
	AccessTokenMaxTTL int    `json:"accessTokenMaxTTL"`
	TokenType         string `json:"tokenType"`
}

type ServiceAccountWorkspacePermission struct {
	ID             string `json:"_id"`
	ServiceAccount string `json:"serviceAccount"`
	Workspace      struct {
		ID                 string `json:"_id"`
		Name               string `json:"name"`
		AutoCapitalization bool   `json:"autoCapitalization"`
		Organization       string `json:"organization"`
		Environments       []struct {
			Name string `json:"name"`
			Slug string `json:"slug"`
			ID   string `json:"_id"`
		} `json:"environments"`
	} `json:"workspace"`
	Environment string `json:"environment"`
	Read        bool   `json:"read"`
	Write       bool   `json:"write"`
}

type ServiceAccountWorkspacePermissions struct {
	ServiceAccountWorkspacePermission []ServiceAccountWorkspacePermissions `json:"serviceAccountWorkspacePermissions"`
}

type GetServiceAccountKeysRequest struct {
	ServiceAccountId string `json:"id"`
}

type MachineIdentityUniversalAuthLoginRequest struct {
	ClientId     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
}

type MachineIdentityUniversalAuthRefreshRequest struct {
	AccessToken string `json:"accessToken"`
}

type ServiceAccountKey struct {
	ID             string    `json:"_id"`
	EncryptedKey   string    `json:"encryptedKey"`
	Nonce          string    `json:"nonce"`
	Sender         string    `json:"sender"`
	ServiceAccount string    `json:"serviceAccount"`
	Workspace      string    `json:"workspace"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type GetServiceAccountKeysResponse struct {
	ServiceAccountKeys []ServiceAccountKey `json:"serviceAccountKeys"`
}
