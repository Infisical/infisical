package azureadcs

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of one scope's AD CS server inside fakenet.
type ControlPlane struct {
	*fakenet.Scope[Server]
}

// Open returns the server for a scope, which has to be tracked with fakenet.Track
// before its URL reaches Infisical.
func Open(tt *testing.T, adminURL, scope string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{fakenet.Open[Server](tt, adminURL, Service.Host(), scope)}
}

// WithTemplates is a seed publishing certificate templates on the CA.
func WithTemplates(names ...string) map[string]any {
	return map[string]any{"templates": names}
}

// WithCATemplates is a seed publishing templates that issue CA certificates, such as
// SubCA.
func WithCATemplates(names ...string) map[string]any {
	return map[string]any{"caTemplates": names}
}
