package models

import "time"

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

type SingleEnvironmentVariable struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}
