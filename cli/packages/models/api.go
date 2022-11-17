package models

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
	Workspaces []Workspace `json:"workspaces"`
}
type Workspace struct {
	ID           string `json:"_id"`
	Name         string `json:"name"`
	Plan         string `json:"plan,omitempty"`
	V            int    `json:"__v"`
	Organization string `json:"organization,omitempty"`
}
