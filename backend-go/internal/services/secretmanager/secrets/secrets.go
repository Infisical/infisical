package secrets

import (
	"context"
	"log/slog"

	"github.com/infisical/api/internal/services/shared/auth"

	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/shared/permission"
)

type permissionSvc interface {
	GetProjectPermission(ctx context.Context, args *permission.GetProjectPermissionArgs) (*permission.GetProjectPermissionResult, error)
}

type secretFolderSvc any

type service struct {
	auth.AuthHandler
	logger          *slog.Logger
	permissionSvc   permissionSvc
	secretFolderSvc secretFolderSvc
}

// Deps holds the dependencies for the secrets service.
type Deps struct {
	AuthHandler  auth.AuthHandler
	Permission   permissionSvc
	SecretFolder secretFolderSvc
}

func NewService(logger *slog.Logger, deps Deps) gensecrets.Service {
	return &service{
		AuthHandler:     deps.AuthHandler,
		logger:          logger.With(slog.String("service", "secrets")),
		permissionSvc:   deps.Permission,
		secretFolderSvc: deps.SecretFolder,
	}
}

func (s *service) GetHealth(ctx context.Context) (string, error) {
	s.logger.InfoContext(ctx, "health check")
	return "secrets service is healthy", nil
}

func (s *service) CreateSecret(ctx context.Context, p *gensecrets.CreateSecretPayload) (*gensecrets.SecretResult, error) {
	s.logger.InfoContext(ctx, "creating secret", slog.String("key", p.Key))
	return &gensecrets.SecretResult{
		ID:          "generated-id",
		Key:         p.Key,
		Value:       p.Value,
		Environment: p.Environment,
		ProjectID:   p.ProjectID,
	}, nil
}

func (s *service) GetSecret(ctx context.Context, p *gensecrets.GetSecretPayload) (*gensecrets.SecretResult, error) {
	s.logger.InfoContext(ctx, "getting secret", slog.String("id", p.ID))
	_, err := s.permissionSvc.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		ProjectID: "",
	})
	if err != nil {
		return nil, err
	}

	return &gensecrets.SecretResult{ID: p.ID, Key: "stub", Value: "stub", Environment: "dev", ProjectID: "proj-1"}, nil
}

func (s *service) UpdateSecret(ctx context.Context, p *gensecrets.UpdateSecretPayload) (*gensecrets.SecretResult, error) {
	s.logger.InfoContext(ctx, "updating secret", slog.String("id", p.ID))
	return &gensecrets.SecretResult{ID: p.ID, Key: "updated", Value: "updated", Environment: "dev", ProjectID: "proj-1"}, nil
}

func (s *service) DeleteSecret(ctx context.Context, p *gensecrets.DeleteSecretPayload) error {
	s.logger.InfoContext(ctx, "deleting secret", slog.String("id", p.ID))
	return nil
}

func (s *service) ListSecrets(ctx context.Context, p *gensecrets.ListSecretsPayload) (gensecrets.SecretResultCollection, error) {
	s.logger.InfoContext(ctx, "listing secrets", slog.String("projectId", p.ProjectID), slog.String("env", p.Environment))
	return gensecrets.SecretResultCollection{}, nil
}
