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

type GetEncryptedSecretsV2Request struct {
	EnvironmentName string `json:"environmentName"`
	WorkspaceId     string `json:"workspaceId"`
	ETag            string `json:"etag,omitempty"`
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
		SecretKeyHash           string    `json:"secretKeyHash"`
		SecretValueCiphertext   string    `json:"secretValueCiphertext"`
		SecretValueIV           string    `json:"secretValueIV"`
		SecretValueTag          string    `json:"secretValueTag"`
		SecretValueHash         string    `json:"secretValueHash"`
		SecretCommentCiphertext string    `json:"secretCommentCiphertext"`
		SecretCommentIV         string    `json:"secretCommentIV"`
		SecretCommentTag        string    `json:"secretCommentTag"`
		SecretCommentHash       string    `json:"secretCommentHash"`
		V                       int       `json:"__v"`
		CreatedAt               time.Time `json:"createdAt"`
		UpdatedAt               time.Time `json:"updatedAt"`
		User                    string    `json:"user,omitempty"`
	}

	Modified bool   `json:"modified,omitempty"`
	ETag     string `json:"ETag,omitempty"`
}

type GetServiceTokenDetailsResponse struct {
	ID           string `json:"_id"`
	Name         string `json:"name"`
	Workspace    string `json:"workspace"`
	Environment  string `json:"environment"`
	User         string `json:"user"`
	EncryptedKey string `json:"encryptedKey"`
	Iv           string `json:"iv"`
	Tag          string `json:"tag"`
}
