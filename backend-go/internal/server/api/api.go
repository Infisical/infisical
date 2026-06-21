package api

import (
	"log/slog"

	"github.com/go-chi/chi/v5"

	"github.com/infisical/api/internal/server/api/shared"
	"github.com/infisical/api/internal/services"
	"github.com/infisical/api/internal/services/auth/apiauth"
)

// NewErrorHandler re-exports shared.NewErrorHandler for convenience.
var NewErrorHandler = shared.NewErrorHandler

// Router wraps chi.Router with service dependencies.
type Router struct {
	chi.Router
	logger   *slog.Logger
	services *services.Services
	auth     *apiauth.ApiAuthenticator
}

// NewRouter creates a new router with all routes registered.
func NewRouter(logger *slog.Logger, svc *services.Services) *Router {
	auth := apiauth.NewApiAuthenticator(
		logger,
		svc.Infra().DB,
		svc.Infra().Config.AuthSecret,
		svc.Infra().KeyStore,
		svc.AssumePrivilege,
		NewErrorHandler(logger),
	)

	r := &Router{
		Router:   chi.NewRouter(),
		logger:   logger,
		services: svc,
		auth:     auth,
	}

	r.registerSecretsRoutes()

	return r
}
