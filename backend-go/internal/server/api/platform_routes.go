package api

import (
	"log/slog"

	"github.com/go-chi/chi/v5"

	"github.com/infisical/api/internal/ee/services/ratelimit"
	"github.com/infisical/api/internal/server/api/platform/projects"
	"github.com/infisical/api/internal/server/api/shared"
	"github.com/infisical/api/internal/services/auth/apiauth"
)

// RegisterPlatformRoutes initializes platform handlers and registers their routes.
func RegisterPlatformRoutes(router chi.Router, logger *slog.Logger, svc *PlatformServices) {
	l := logger.With(slog.String("product", "platform"))

	projectsHandler := projects.NewHandler(&projects.Deps{
		Logger:     l,
		Permission: svc.Permission,
	})

	// Create adapter with shared error handler
	projectsAdapter := projects.NewHTTPAdapter(projectsHandler, shared.NewErrorHandler(l))

	// Mount projects routes
	router.Route("/api/v1/platform/projects", func(r chi.Router) {
		// Unauthenticated routes
		r.Get("/health", projectsAdapter.GetProjectsHealth)

		// Authenticated routes
		r.Group(func(r chi.Router) {
			r.Use(svc.ApiAuthenticator.RequireAuth(
				apiauth.WithAuthModes(apiauth.JWTAuth, apiauth.IdentityAccessTokenAuth, apiauth.ServiceTokenAuth),
			))
			r.Use(svc.RateLimit.Middleware(ratelimit.PresetWrite))
			r.Post("/", projectsAdapter.CreateProject)
		})
	})
}
