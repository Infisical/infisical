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
}

type BatchCreateSecretsByWorkspaceAndEnvRequest struct {
	Environment string   `json:"environment"`
	WorkspaceId string   `json:"workspaceId"`
	Secrets     []Secret `json:"secrets"`
}

type BatchModifySecretsByWorkspaceAndEnvRequest struct {
	Environment string   `json:"environment"`
	WorkspaceId string   `json:"workspaceId"`
	Secrets     []Secret `json:"secrets"`
}

type BatchDeleteSecretsBySecretIdsRequest struct {
	EnvironmentName string   `json:"environmentName"`
	WorkspaceId     string   `json:"workspaceId"`
	SecretIds       []string `json:"secretIds"`
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

type GetEncryptedSecretsV2Request struct {
	Environment string `json:"environment"`
	WorkspaceId string `json:"workspaceId"`
	TagSlugs    string `json:"tagSlugs"`
}

type GetEncryptedSecretsV2Response struct {
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
		V                       int       `json:"__v"`
		CreatedAt               time.Time `json:"createdAt"`
		UpdatedAt               time.Time `json:"updatedAt"`
		User                    string    `json:"user,omitempty"`
		Tags                    []struct {
			ID        string `json:"_id"`
			Name      string `json:"name"`
			Slug      string `json:"slug"`
			Workspace string `json:"workspace"`
		} `json:"tags"`
	} `json:"secrets"`
}

type GetServiceTokenDetailsResponse struct {
	ID          string `json:"_id"`
	Name        string `json:"name"`
	Workspace   string `json:"workspace"`
	Environment string `json:"environment"`
	User        struct {
		ID        string    `json:"_id"`
		Email     string    `json:"email"`
		CreatedAt time.Time `json:"createdAt"`
		UpdatedAt time.Time `json:"updatedAt"`
		V         int       `json:"__v"`
		FirstName string    `json:"firstName"`
		LastName  string    `json:"lastName"`
	} `json:"user"`
	ExpiresAt    time.Time `json:"expiresAt"`
	EncryptedKey string    `json:"encryptedKey"`
	Iv           string    `json:"iv"`
	Tag          string    `json:"tag"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
	V            int       `json:"__v"`
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
