package secrets

import (
	"context"
	"log/slog"

	"github.com/infisical/api/internal/services/auth"

	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/permission"
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

func (s *service) ListSecretsV4(ctx context.Context, p *gensecrets.ListSecretsV4Payload) (*gensecrets.ListSecretsResult, error) {
	s.logger.InfoContext(ctx, "listing secrets v4",
		slog.String("projectId", p.ProjectID),
		slog.String("environment", p.Environment),
	)
	return &gensecrets.ListSecretsResult{
		Secrets: []*gensecrets.SecretRaw{},
	}, nil
}

func (s *service) GetSecretByNameV4(ctx context.Context, p *gensecrets.GetSecretByNameV4Payload) (*gensecrets.GetSecretResult, error) {
	s.logger.InfoContext(ctx, "getting secret by name v4",
		slog.String("secretName", p.SecretName),
		slog.String("projectId", p.ProjectID),
		slog.String("environment", p.Environment),
	)
	return &gensecrets.GetSecretResult{
		Secret: &gensecrets.SecretRaw{
			ID:                "stub",
			LegacyID:          "stub",
			Workspace:         p.ProjectID,
			Environment:       p.Environment,
			Version:           1,
			Type:              "shared",
			SecretKey:         p.SecretName,
			SecretValue:       "",
			SecretComment:     "",
			CreatedAt:         "",
			UpdatedAt:         "",
			SecretValueHidden: false,
		},
	}, nil
}

func (s *service) ListSecretsRawV3(ctx context.Context, p *gensecrets.ListSecretsRawV3Payload) (*gensecrets.ListSecretsResult, error) {
	s.logger.InfoContext(ctx, "listing secrets raw v3")
	return &gensecrets.ListSecretsResult{
		Secrets: []*gensecrets.SecretRaw{},
	}, nil
}

func (s *service) GetSecretByNameRawV3(ctx context.Context, p *gensecrets.GetSecretByNameRawV3Payload) (*gensecrets.GetSecretResult, error) {
	s.logger.InfoContext(ctx, "getting secret by name raw v3",
		slog.String("secretName", p.SecretName),
	)
	return &gensecrets.GetSecretResult{
		Secret: &gensecrets.SecretRaw{
			ID:                "stub",
			LegacyID:          "stub",
			Workspace:         "",
			Environment:       "",
			Version:           1,
			Type:              "shared",
			SecretKey:         p.SecretName,
			SecretValue:       "",
			SecretComment:     "",
			CreatedAt:         "",
			UpdatedAt:         "",
			SecretValueHidden: false,
		},
	}, nil
}
