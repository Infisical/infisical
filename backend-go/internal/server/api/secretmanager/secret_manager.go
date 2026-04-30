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

func NewRegistry(logger *slog.Logger, db pg.DB, sharedSvc *services.Services) *Registry {
	l := logger.With(slog.String("product", "secretmanager"))

	secretManagerSvc := smService.NewServices(smService.ServicesDeps{
		DB: db,
	})

	return &Registry{
		Secrets: secrets.NewHandler(secrets.Deps{
			Logger:           l,
			SharedSvc:        sharedSvc,
			SecretManagerSvc: secretManagerSvc,
		}),
	}
}
