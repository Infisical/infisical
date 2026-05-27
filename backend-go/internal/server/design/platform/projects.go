package platform

import (
	. "goa.design/goa/v3/dsl"

	"github.com/infisical/api/internal/server/design/auth"
	"github.com/infisical/api/internal/server/design/common"
)

// ProjectResult describes the output of a project operation.
var ProjectResult = ResultType("application/vnd.project", func() {
	TypeName("ProjectResult")
	Attributes(func() {
		Attribute("id", String, "Project ID")
		Attribute("name", String, "Project name")
		Attribute("orgId", String, "Organization ID")
	})
	Required("id", "name", "orgId")
})

var _ = Service("projects", func() {
	Description("Service for managing projects.")

	common.CommonServiceErrors()

	Method("getHealth", func() {
		Description("Health check for the projects service.")
		NoSecurity()
		Result(String)
		HTTP(func() {
			GET("/api/v1/platform/projects/health")
			Response(StatusOK)
		})
	})

	Method("createProject", func() {
		Description("Create a new project.")
		auth.Secured(auth.JWTAuth, auth.IdentityAccessTokenAuth, auth.ServiceTokenAuth).
			Payload(func() {
				Attribute("name", String, "Project name", func() {
					MinLength(1)
				})
				Attribute("orgId", String, "Organization ID")
				Required("name", "orgId")
			})
		Result(ProjectResult)
		HTTP(func() {
			POST("/api/v1/platform/projects")
			Response(StatusCreated)
		})
	})
})
