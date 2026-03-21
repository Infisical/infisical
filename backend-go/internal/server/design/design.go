package design

import (
	. "goa.design/goa/v3/dsl"

	"github.com/infisical/api/internal/server/design/common"
	// Blank-import product line designs to register their DSL.
	_ "github.com/infisical/api/internal/server/design/platform"
	_ "github.com/infisical/api/internal/server/design/secretmanager"
)

var _ = API("infisical", func() {
	Title("Infisical API")
	Description("Infisical secret management platform API")
	Version("0.0.1")
	Server("infisical", func() {
		Host("localhost", func() {
			URI("http://localhost:8080")
		})
	})
	Meta("openapi:example", "false")

	// Global error declarations — generate OpenAPI error responses for all endpoints.
	Error("bad_request", common.APIErrorResult, "Invalid request")
	Error("unauthorized", common.APIErrorResult, "Authentication required")
	Error("forbidden", common.APIErrorResult, "Permission denied")
	Error("not_found", common.APIErrorResult, "Resource not found")
	Error("internal_error", common.APIErrorResult, "Internal server error")

	HTTP(func() {
		Response("bad_request", StatusBadRequest)
		Response("unauthorized", StatusUnauthorized)
		Response("forbidden", StatusForbidden)
		Response("not_found", StatusNotFound)
		Response("internal_error", StatusInternalServerError)
	})
})
