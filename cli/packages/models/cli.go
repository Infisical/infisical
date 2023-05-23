package models

import (
	"github.com/99designs/keyring"
)

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
	Type  string `json:"type"`
	ID    string `json:"_id"`
	Tags  []struct {
		ID        string `json:"_id"`
		Name      string `json:"name"`
		Slug      string `json:"slug"`
		Workspace string `json:"workspace"`
	} `json:"tags"`
	Comment string `json:"comment"`
}

type Workspace struct {
	ID           string `json:"_id"`
	Name         string `json:"name"`
	Plan         string `json:"plan,omitempty"`
	V            int    `json:"__v"`
	Organization string `json:"organization,omitempty"`
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
	TagSlugs                 string
	WorkspaceId              string
}
