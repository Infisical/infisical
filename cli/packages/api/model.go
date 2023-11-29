package api

import "time"

// Stores info for login one
type LoginOneRequest struct {
	Email           string `json:"email"`
	ClientPublicKey string `json:"clientPublicKey"`
}

type LoginOneResponse struct {
	ServerPublicKey string `json:"serverPublicKey"`
	ServerSalt      string `json:"salt"`
}

// Stores info for login two

type LoginTwoRequest struct {
	Email       string `json:"email"`
	ClientProof string `json:"clientProof"`
}

type LoginTwoResponse struct {
	JTWToken            string `json:"token"`
	RefreshToken        string `json:"refreshToken"`
	PublicKey           string `json:"publicKey"`
	EncryptedPrivateKey string `json:"encryptedPrivateKey"`
	IV                  string `json:"iv"`
	Tag                 string `json:"tag"`
}

type PullSecretsRequest struct {
	Environment string `json:"environment"`
}

type PullSecretsResponse struct {
	Secrets []struct {
		ID                    string    `json:"_id"`
		Workspace             string    `json:"workspace"`
		Type                  string    `json:"type"`
		Environment           string    `json:"environment"`
		SecretKeyCiphertext   string    `json:"secretKeyCiphertext"`
		SecretKeyIV           string    `json:"secretKeyIV"`
		SecretKeyTag          string    `json:"secretKeyTag"`
		SecretKeyHash         string    `json:"secretKeyHash"`
		SecretValueCiphertext string    `json:"secretValueCiphertext"`
		SecretValueIV         string    `json:"secretValueIV"`
		SecretValueTag        string    `json:"secretValueTag"`
		SecretValueHash       string    `json:"secretValueHash"`
		V                     int       `json:"__v"`
		CreatedAt             time.Time `json:"createdAt"`
		UpdatedAt             time.Time `json:"updatedAt"`
		User                  string    `json:"user,omitempty"`
	} `json:"secrets"`
	Key struct {
		ID           string `json:"_id"`
		EncryptedKey string `json:"encryptedKey"`
		Nonce        string `json:"nonce"`
		Sender       struct {
			ID         string    `json:"_id"`
			Email      string    `json:"email"`
			CustomerID string    `json:"customerId"`
			CreatedAt  time.Time `json:"createdAt"`
			UpdatedAt  time.Time `json:"updatedAt"`
			V          int       `json:"__v"`
			FirstName  string    `json:"firstName"`
			LastName   string    `json:"lastName"`
			PublicKey  string    `json:"publicKey"`
		} `json:"sender"`
		Receiver  string    `json:"receiver"`
		Workspace string    `json:"workspace"`
		V         int       `json:"__v"`
		CreatedAt time.Time `json:"createdAt"`
		UpdatedAt time.Time `json:"updatedAt"`
	} `json:"key"`
}

type PullSecretsByInfisicalTokenResponse struct {
	Secrets []struct {
		ID          string `json:"_id"`
		Workspace   string `json:"workspace"`
		Type        string `json:"type"`
		Environment string `json:"environment"`
		SecretKey   struct {
			Workspace  string `json:"workspace"`
			Ciphertext string `json:"ciphertext"`
			Iv         string `json:"iv"`
			Tag        string `json:"tag"`
			Hash       string `json:"hash"`
		} `json:"secretKey"`
		SecretValue struct {
			Workspace  string `json:"workspace"`
			Ciphertext string `json:"ciphertext"`
			Iv         string `json:"iv"`
			Tag        string `json:"tag"`
			Hash       string `json:"hash"`
		} `json:"secretValue"`
	} `json:"secrets"`
	Key struct {
		EncryptedKey string `json:"encryptedKey"`
		Nonce        string `json:"nonce"`
		Sender       struct {
			PublicKey string `json:"publicKey"`
		} `json:"sender"`
		Receiver struct {
			RefreshVersion int       `json:"refreshVersion"`
			ID             string    `json:"_id"`
			Email          string    `json:"email"`
			CustomerID     string    `json:"customerId"`
			CreatedAt      time.Time `json:"createdAt"`
			UpdatedAt      time.Time `json:"updatedAt"`
			V              int       `json:"__v"`
			FirstName      string    `json:"firstName"`
			LastName       string    `json:"lastName"`
			PublicKey      string    `json:"publicKey"`
		} `json:"receiver"`
		Workspace string `json:"workspace"`
	} `json:"key"`
}

type GetWorkSpacesResponse struct {
	Workspaces []struct {
		ID           string `json:"_id"`
		Name         string `json:"name"`
		Plan         string `json:"plan,omitempty"`
		V            int    `json:"__v"`
		Organization string `json:"organization,omitempty"`
	} `json:"workspaces"`
}

type Secret struct {
	SecretKeyCiphertext     string `json:"secretKeyCiphertext,omitempty"`
	SecretKeyIV             string `json:"secretKeyIV,omitempty"`
	SecretKeyTag            string `json:"secretKeyTag,omitempty"`
	SecretKeyHash           string `json:"secretKeyHash,omitempty"`
	SecretValueCiphertext   string `json:"secretValueCiphertext,omitempty"`
	SecretValueIV           string `json:"secretValueIV,omitempty"`
	SecretValueTag          string `json:"secretValueTag,omitempty"`
	SecretValueHash         string `json:"secretValueHash,omitempty"`
	SecretCommentCiphertext string `json:"secretCommentCiphertext,omitempty"`
	SecretCommentIV         string `json:"secretCommentIV,omitempty"`
	SecretCommentTag        string `json:"secretCommentTag,omitempty"`
	SecretCommentHash       string `json:"secretCommentHash,omitempty"`
	Type                    string `json:"type,omitempty"`
	ID                      string `json:"id,omitempty"`
	PlainTextKey            string `json:"plainTextKey"`
}

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

type GetSecretsByWorkspaceIdAndEnvironmentRequest struct {
	EnvironmentName string `json:"environmentName"`
	WorkspaceId     string `json:"workspaceId"`
}

type GetServiceTokenDetailsResponse struct {
	ID           string    `json:"_id"`
	Name         string    `json:"name"`
	Workspace    string    `json:"workspace"`
	ExpiresAt    time.Time `json:"expiresAt"`
	EncryptedKey string    `json:"encryptedKey"`
	Iv           string    `json:"iv"`
	Tag          string    `json:"tag"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
	Scopes       []struct {
		Environment string `json:"environment"`
		SecretPath  string `json:"secretPath"`
	} `json:"scopes"`
}

type GetAccessibleEnvironmentsRequest struct {
	WorkspaceId string `json:"workspaceId"`
}

type GetAccessibleEnvironmentsResponse struct {
	AccessibleEnvironments []struct {
		Name          string `json:"name"`
		Slug          string `json:"slug"`
		IsWriteDenied bool   `json:"isWriteDenied"`
	} `json:"accessibleEnvironments"`
}

type GetLoginOneV2Request struct {
	Email           string `json:"email"`
	ClientPublicKey string `json:"clientPublicKey"`
}

type GetLoginOneV2Response struct {
	ServerPublicKey string `json:"serverPublicKey"`
	Salt            string `json:"salt"`
}

type GetLoginTwoV2Request struct {
	Email       string `json:"email"`
	ClientProof string `json:"clientProof"`
}

type GetLoginTwoV2Response struct {
	MfaEnabled          bool   `json:"mfaEnabled"`
	EncryptionVersion   int    `json:"encryptionVersion"`
	Token               string `json:"token"`
	PublicKey           string `json:"publicKey"`
	EncryptedPrivateKey string `json:"encryptedPrivateKey"`
	Iv                  string `json:"iv"`
	Tag                 string `json:"tag"`
	ProtectedKey        string `json:"protectedKey"`
	ProtectedKeyIV      string `json:"protectedKeyIV"`
	ProtectedKeyTag     string `json:"protectedKeyTag"`
	RefreshToken        string `json:"RefreshToken"`
}

type VerifyMfaTokenRequest struct {
	Email    string `json:"email"`
	MFAToken string `json:"mfaToken"`
}

type VerifyMfaTokenResponse struct {
	EncryptionVersion   int    `json:"encryptionVersion"`
	Token               string `json:"token"`
	PublicKey           string `json:"publicKey"`
	EncryptedPrivateKey string `json:"encryptedPrivateKey"`
	Iv                  string `json:"iv"`
	Tag                 string `json:"tag"`
	ProtectedKey        string `json:"protectedKey"`
	ProtectedKeyIV      string `json:"protectedKeyIV"`
	ProtectedKeyTag     string `json:"protectedKeyTag"`
	RefreshToken        string `json:"refreshToken"`
}

type VerifyMfaTokenErrorResponse struct {
	Type    string `json:"type"`
	Message string `json:"message"`
	Context struct {
		Code      string `json:"code"`
		TriesLeft int    `json:"triesLeft"`
	} `json:"context"`
	Level       int           `json:"level"`
	LevelName   string        `json:"level_name"`
	StatusCode  int           `json:"status_code"`
	DatetimeIso time.Time     `json:"datetime_iso"`
	Application string        `json:"application"`
	Extra       []interface{} `json:"extra"`
}

type GetNewAccessTokenWithRefreshTokenResponse struct {
	Token string `json:"token"`
}

type GetEncryptedSecretsV3Request struct {
	Environment   string `json:"environment"`
	WorkspaceId   string `json:"workspaceId"`
	SecretPath    string `json:"secretPath"`
	IncludeImport bool   `json:"include_imports"`
}

type GetFoldersV1Request struct {
	Environment string `json:"environment"`
	WorkspaceId string `json:"workspaceId"`
	FoldersPath string `json:"foldersPath"`
}

type GetFoldersV1Response struct {
	Folders []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"folders"`
}

type CreateFolderV1Request struct {
	FolderName  string `json:"folderName"`
	WorkspaceId string `json:"workspaceId"`
	Environment string `json:"environment"`
	Directory   string `json:"directory"`
}

type CreateFolderV1Response struct {
	Folder struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"folder"`
}

type DeleteFolderV1Request struct {
	FolderName  string `json:"folderName"`
	WorkspaceId string `json:"workspaceId"`
	Environment string `json:"environment"`
	Directory   string `json:"directory"`
}

type DeleteFolderV1Response struct {
	Folders []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"folders"`
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

type ImportedSecretV3 struct {
	Environment string              `json:"environment"`
	FolderId    string              `json:"folderId"`
	SecretPath  string              `json:"secretPath"`
	Secrets     []EncryptedSecretV3 `json:"secrets"`
}

type GetEncryptedSecretsV3Response struct {
	Secrets         []EncryptedSecretV3 `json:"secrets"`
	ImportedSecrets []ImportedSecretV3  `json:"imports,omitempty"`
}

type CreateSecretV3Request struct {
	SecretName              string `json:"secretName"`
	WorkspaceID             string `json:"workspaceId"`
	Type                    string `json:"type"`
	Environment             string `json:"environment"`
	SecretKeyCiphertext     string `json:"secretKeyCiphertext"`
	SecretKeyIV             string `json:"secretKeyIV"`
	SecretKeyTag            string `json:"secretKeyTag"`
	SecretValueCiphertext   string `json:"secretValueCiphertext"`
	SecretValueIV           string `json:"secretValueIV"`
	SecretValueTag          string `json:"secretValueTag"`
	SecretCommentCiphertext string `json:"secretCommentCiphertext"`
	SecretCommentIV         string `json:"secretCommentIV"`
	SecretCommentTag        string `json:"secretCommentTag"`
	SecretPath              string `json:"secretPath"`
}

type DeleteSecretV3Request struct {
	SecretName  string `json:"secretName"`
	WorkspaceId string `json:"workspaceId"`
	Environment string `json:"environment"`
	Type        string `json:"type"`
	SecretPath  string `json:"secretPath"`
}

type UpdateSecretByNameV3Request struct {
	SecretName            string `json:"secretName"`
	WorkspaceID           string `json:"workspaceId"`
	Environment           string `json:"environment"`
	Type                  string `json:"type"`
	SecretPath            string `json:"secretPath"`
	SecretValueCiphertext string `json:"secretValueCiphertext"`
	SecretValueIV         string `json:"secretValueIV"`
	SecretValueTag        string `json:"secretValueTag"`
}

type GetSingleSecretByNameV3Request struct {
	SecretName  string `json:"secretName"`
	WorkspaceId string `json:"workspaceId"`
	Environment string `json:"environment"`
	Type        string `json:"type"`
	SecretPath  string `json:"secretPath"`
}

type GetSingleSecretByNameSecretResponse struct {
	Secrets []struct {
		ID                      string    `json:"_id"`
		Version                 int       `json:"version"`
		Workspace               string    `json:"workspace"`
		Type                    string    `json:"type"`
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
	} `json:"secrets"`
}

type ScopePermission struct {
	Environment string `json:"environment"`
	SecretPath  string `json:"secretPath"`
}

type CreateServiceTokenRequest struct {
	Name         string            `json:"name"`
	WorkspaceId  string            `json:"workspaceId"`
	Scopes       []ScopePermission `json:"scopes"`
	ExpiresIn    int               `json:"expiresIn"`
	EncryptedKey string            `json:"encryptedKey"`
	Iv           string            `json:"iv"`
	Tag          string            `json:"tag"`
	RandomBytes  string            `json:"randomBytes"`
	Permissions  []string          `json:"permissions"`
}

type ServiceTokenData struct {
	ID          string        `json:"_id"`
	Name        string        `json:"name"`
	Workspace   string        `json:"workspace"`
	Scopes      []interface{} `json:"scopes"`
	User        string        `json:"user"`
	LastUsed    time.Time     `json:"lastUsed"`
	Permissions []string      `json:"permissions"`
	CreatedAt   time.Time     `json:"createdAt"`
	UpdatedAt   time.Time     `json:"updatedAt"`
}

type CreateServiceTokenResponse struct {
	ServiceToken     string           `json:"serviceToken"`
	ServiceTokenData ServiceTokenData `json:"serviceTokenData"`
}

type ServiceTokenV3RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token"`
}
type ServiceTokenV3RefreshTokenResponse struct {
	RefreshToken string `json:"refresh_token"`
	AccessToken  string `json:"access_token"`
	ExpiresIn    int    `json:"expires_in"`
	TokenType    string `json:"token_type"`
}

type GetRawSecretsV3Request struct {
	Environment   string `json:"environment"`
	WorkspaceId   string `json:"workspaceId"`
	SecretPath    string `json:"secretPath"`
	IncludeImport bool   `json:"include_imports"`
}

type GetRawSecretsV3Response struct {
	Secrets []struct {
		ID            string `json:"_id"`
		Version       int    `json:"version"`
		Workspace     string `json:"workspace"`
		Type          string `json:"type"`
		Environment   string `json:"environment"`
		SecretKey     string `json:"secretKey"`
		SecretValue   string `json:"secretValue"`
		SecretComment string `json:"secretComment"`
	} `json:"secrets"`
	Imports []any `json:"imports"`
}
