package secret

import "github.com/infisical/api/pkg/chita"

// RegisterRoutes registers the routes for secrets endpoints.
func RegisterRoutes(router *chita.Router, app *chita.App, handler *Handler) {
	// V4 endpoints
	router.Route("/api/v4/secrets", func(r *chita.Router) {
		r.WithTags("Secrets")
		r.WithSecurity(
			chita.NewSecurity("jwt"),
			chita.NewSecurity("identity_access_token"),
			chita.NewSecurity("service_token"),
		)

		r.GET("/", chita.Handler(app, handler.ListSecretsV4).
			Summary("List secrets for a project environment").
			Description("Returns all secrets in the specified project environment and path").
			OperationID("listSecretsV4"))

		r.GET("/{secretName}", chita.Handler(app, handler.GetSecretByNameV4).
			Summary("Get a secret by name").
			Description("Returns a single secret by its name").
			OperationID("getSecretByNameV4"))
	})

	// V3 endpoints (deprecated)
	router.Route("/api/v3/secrets/raw", func(r *chita.Router) {
		r.WithTags("Secrets")
		r.WithSecurity(
			chita.NewSecurity("jwt"),
			chita.NewSecurity("identity_access_token"),
			chita.NewSecurity("service_token"),
		)

		r.GET("/", chita.Handler(app, handler.ListSecretsRawV3).
			Summary("List raw secrets (deprecated)").
			Description("Returns all secrets in the specified workspace environment and path. Deprecated: use V4 endpoint instead.").
			OperationID("listSecretsRawV3").
			Deprecated())

		r.GET("/{secretName}", chita.Handler(app, handler.GetSecretByNameRawV3).
			Summary("Get a raw secret by name (deprecated)").
			Description("Returns a single secret by its name. Deprecated: use V4 endpoint instead.").
			OperationID("getSecretByNameRawV3").
			Deprecated())
	})
}
