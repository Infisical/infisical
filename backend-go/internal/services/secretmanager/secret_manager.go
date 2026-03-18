package secretmanager

import (
	"log/slog"

	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/secretmanager/secrets"
	"github.com/infisical/api/internal/services/shared"
	"github.com/infisical/api/internal/services/shared/secretmanager/secretfolder"
)

type Registry struct {
	Secrets gensecrets.Service
}

func NewRegistry(logger *slog.Logger, sharedLibs *shared.SharedServices) *Registry {
	l := logger.With("product", "secretmanager")

	secretFolderLib := secretfolder.NewSharedService()

	return &Registry{
		Secrets: secrets.NewService(l, sharedLibs.Permission, secretFolderLib),
	}
}
