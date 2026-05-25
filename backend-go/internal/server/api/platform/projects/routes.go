package projects

import "github.com/infisical/api/pkg/chita"

// RegisterRoutes registers the routes for projects endpoints.
func RegisterRoutes(router *chita.Router, app *chita.App, handler *Handler) {
	router.Route("/api/v1/platform/projects", func(r *chita.Router) {
		r.WithTags("Projects")

		r.GET("/health", chita.Handler(app, handler.GetHealth).
			Summary("Health check").
			Description("Returns health status for the projects service").
			OperationID("getProjectsHealth"))

		r.POST("", chita.Handler(app, handler.CreateProject).
			Security(
				chita.NewSecurity("jwt"),
				chita.NewSecurity("identity_access_token"),
				chita.NewSecurity("service_token"),
			).
			Summary("Create a project").
			Description("Creates a new project in the organization").
			OperationID("createProject"))
	})
}
