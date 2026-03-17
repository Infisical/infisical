package design

import (
	. "goa.design/goa/v3/dsl"

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
})
