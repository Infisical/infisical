package services

import (
	"log/slog"

	"github.com/infisical/api/internal/services/platform"
	"github.com/infisical/api/internal/services/secretmanager"
)

type Service struct {
	Platform      *platform.Service
	SecretManager *secretmanager.Service
}

func NewService(logger *slog.Logger) *Service {
	return &Service{
		Platform:      platform.NewService(logger),
		SecretManager: secretmanager.NewService(logger),
	}
}
