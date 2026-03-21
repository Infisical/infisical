package platform

import (
	. "goa.design/goa/v3/dsl"

	"github.com/infisical/api/internal/server/design/common"
)

// CreateProjectPayload describes the input for creating a project.
var CreateProjectPayload = Type("CreateProjectPayload", func() {
	Attribute("name", String, "Project name", func() {
		MinLength(1)
	})
	Attribute("orgId", String, "Organization ID")
	Required("name", "orgId")
})

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
		Result(String)
		HTTP(func() {
			GET("/api/v1/platform/projects/health")
			Response(StatusOK)
		})
	})

	Method("createProject", func() {
		Description("Create a new project.")
		Payload(CreateProjectPayload)
		Result(ProjectResult)
		HTTP(func() {
			POST("/api/v1/platform/projects")
			Response(StatusCreated)
		})
	})
})
