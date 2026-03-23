package secretmanager

import (
	"log/slog"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/server/api/secretmanager/secrets"
	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services"
	smService "github.com/infisical/api/internal/services/secretmanager"
)

type Registry struct {
	Secrets gensecrets.Service
}

func NewRegistry(logger *slog.Logger, db pg.DB, sharedServices *services.Services) *Registry {
	l := logger.With(slog.String("product", "secretmanager"))

	smServices := smService.NewServices(smService.ServicesDeps{
		DB: db,
	})

	return &Registry{
		Secrets: secrets.NewService(l, secrets.Deps{
			AuthHandler:  sharedServices.AuthHandler,
			Permission:   sharedServices.Permission,
			SecretFolder: smServices.SecretFolder,
		}),
	}
}
