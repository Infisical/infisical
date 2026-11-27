package powerdns

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of the server one API key reaches.
type ControlPlane struct {
	*fakenet.Scope[Server]
}

// Open returns the server an API key reaches.
func Open(tt *testing.T, adminURL, apiKey string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{fakenet.Open[Server](tt, adminURL, Service.Host(), apiKey)}
}
