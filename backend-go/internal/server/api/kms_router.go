package api

import (
	"log/slog"

	"github.com/go-chi/chi/v5"
	"github.com/infisical/api/internal/ee/services/ratelimit"
	"github.com/infisical/api/internal/server/api/cmek"
	"github.com/infisical/api/internal/server/api/shared"
	"github.com/infisical/api/internal/server/api/svc/kms"
	"github.com/infisical/api/internal/services/auth/apiauth"
)

func RegisterCmekServiceRoutes(router chi.Router, logger *slog.Logger, svc *PlatformServices, kmsSvc *kms.Service) {
	l := logger.With(slog.String("svc", "kms"))

	cmekHandler := cmek.NewHandler(cmek.Options{
		Logger:     l,
		Kms:        kmsSvc.Client,
		Permission: kmsSvc.Permission,
		KmsStore:   kmsSvc.KmsStore,
	})

	// Create adapter with shared error handler
	cmekAdapter := cmek.NewHTTPAdapter(cmekHandler, shared.NewErrorHandler(l))

	// Mount cmek routes
	router.Route("/api-go/v1/kms", func(r chi.Router) {
		// Authenticated routes
		r.Group(func(r chi.Router) {
			r.Use(svc.ApiAuthenticator.RequireAuth(
				apiauth.WithAuthModes(apiauth.JWTAuth, apiauth.IdentityAccessTokenAuth, apiauth.ServiceTokenAuth),
			))
			r.Use(svc.RateLimit.Middleware(ratelimit.PresetWrite))
			r.Post("/keys", cmekAdapter.CreateKmsKey)
			r.Post("/keys/{keyId}/sign", cmekAdapter.SignWithKmsKey)
			r.Post("/keys/{keyId}/verify", cmekAdapter.VerifyWithKmsKey)

			r.Delete("/keys/{keyId}", cmekAdapter.DeleteKmsKey)
			r.Delete("/keys/{keyId}", cmekAdapter.DeleteKmsKey)
		})
	})
}
