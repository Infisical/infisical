package secretmanager

import (
	"log/slog"

	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/secretmanager/secrets"
)

type Service struct {
	Secrets gensecrets.Service
}

func NewService(logger *slog.Logger) *Service {
	l := logger.With("product", "secretmanager")
	return &Service{
		Secrets: secrets.NewService(l),
	}
}
