package secrets

import (
	"context"
	"log/slog"

	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/shared"
)

type service struct {
	logger *slog.Logger
	libs   *shared.Libs
}

func NewService(logger *slog.Logger, sharedLibs *shared.Libs) gensecrets.Service {
	return &service{
		logger: logger.With("service", "secrets"),
		libs:   sharedLibs,
	}
}

func (s *service) GetHealth(ctx context.Context) (string, error) {
	s.logger.InfoContext(ctx, "health check")
	return "secrets service is healthy", nil
}

func (s *service) CreateSecret(ctx context.Context, p *gensecrets.Secret) (*gensecrets.SecretResult, error) {
	s.logger.InfoContext(ctx, "creating secret", "key", p.Key)
	return &gensecrets.SecretResult{
		ID:          "generated-id",
		Key:         p.Key,
		Value:       p.Value,
		Environment: p.Environment,
		ProjectID:   p.ProjectID,
	}, nil
}

func (s *service) GetSecret(ctx context.Context, p *gensecrets.GetSecretPayload) (*gensecrets.SecretResult, error) {
	s.logger.InfoContext(ctx, "getting secret", "id", p.ID)
	return &gensecrets.SecretResult{ID: p.ID, Key: "stub", Value: "stub", Environment: "dev", ProjectID: "proj-1"}, nil
}

func (s *service) UpdateSecret(ctx context.Context, p *gensecrets.UpdateSecretPayload) (*gensecrets.SecretResult, error) {
	s.logger.InfoContext(ctx, "updating secret", "id", p.ID)
	return &gensecrets.SecretResult{ID: p.ID, Key: "updated", Value: "updated", Environment: "dev", ProjectID: "proj-1"}, nil
}

func (s *service) DeleteSecret(ctx context.Context, p *gensecrets.DeleteSecretPayload) error {
	s.logger.InfoContext(ctx, "deleting secret", "id", p.ID)
	return nil
}

func (s *service) ListSecrets(ctx context.Context, p *gensecrets.ListSecretsPayload) (gensecrets.SecretResultCollection, error) {
	s.logger.InfoContext(ctx, "listing secrets", "projectId", p.ProjectID, "env", p.Environment)
	return gensecrets.SecretResultCollection{}, nil
}
