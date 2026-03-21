package secretmanager

import (
	"log/slog"

	"github.com/infisical/api/internal/database/pg"
	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/secretmanager/secrets"
	"github.com/infisical/api/internal/services/shared"
	smService "github.com/infisical/api/internal/services/shared/secretmanager"
)

type Registry struct {
	Secrets gensecrets.Service
}

func NewRegistry(logger *slog.Logger, db pg.DB, sharedServices *shared.SharedServices) *Registry {
	l := logger.With(slog.String("product", "secretmanager"))

	smSharedService := smService.NewSharedServices(smService.SharedServicesDeps{
		DB: db,
	})

	return &Registry{
		Secrets: secrets.NewService(l, secrets.Deps{
			Permission:   sharedServices.Permission,
			SecretFolder: smSharedService.SecretFolder,
		}),
	}
}
