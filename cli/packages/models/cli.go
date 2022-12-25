package models

import "github.com/99designs/keyring"

type UserCredentials struct {
	Email      string `json:"email"`
	PrivateKey string `json:"privateKey"`
	JTWToken   string `json:"JTWToken"`
}

// The file struct for Infisical config file
type ConfigFile struct {
	LoggedInUserEmail string              `json:"loggedInUserEmail"`
	VaultBackendType  keyring.BackendType `json:"vaultBackendType"`
}

type SingleEnvironmentVariable struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type WorkspaceConfigFile struct {
	WorkspaceId string `json:"workspaceId"`
}
