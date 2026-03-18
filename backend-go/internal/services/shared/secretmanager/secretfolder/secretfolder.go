package secretfolder

import (
	"context"
)

// FolderEnvironment holds the environment info associated with a folder.
type FolderEnvironment struct {
	ID   string
	Name string
	Slug string
}

// Lib provides secret folder operations scoped to a project and environment.
type Lib struct {
}

// NewLib creates a new secret folder library instance.
func NewLib() *Lib {
	return &Lib{}
}

type SecretFolder struct {
	projectID   string
	environment string
}

// GetSecretFolder returns a scoped SecretFolder handle for the given project and environment.
func (l *Lib) GetSecretFolders(projectID, environment string) *SecretFolder {
	return &SecretFolder{
		projectID:   projectID,
		environment: environment,
	}
}

// GetFolderIdByPath resolves a folder path (e.g. "/prod/backend") to its ID.
// TODO: Implement the actual path resolution logic.
func (sf *SecretFolder) GetFolderIdByPath(ctx context.Context, path string) (string, error) {
	panic("not implemented")
}
