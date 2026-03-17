package secretmanager

import (
	"log/slog"

	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/shared"
	"github.com/infisical/api/internal/services/secretmanager/secrets"
)

type Registry struct {
	Secrets gensecrets.Service
}

func NewRegistry(logger *slog.Logger, sharedLibs *shared.Libs) *Registry {
	l := logger.With("product", "secretmanager")
	return &Registry{
		Secrets: secrets.NewService(l, sharedLibs),
	}
}
