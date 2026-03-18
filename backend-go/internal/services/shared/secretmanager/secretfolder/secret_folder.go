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

// Service provides secret folder operations scoped to a project and environment.
type SharedService struct {
}

// NewService creates a new secret folder service instance.
func NewSharedService() *SharedService {
	return &SharedService{}
}

type SecretFolder struct {
	projectID   string
	environment string
}

// GetSecretFolder returns a scoped SecretFolder handle for the given project and environment.
func (l *SharedService) GetSecretFolders(projectID, environment string) *SecretFolder {
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
