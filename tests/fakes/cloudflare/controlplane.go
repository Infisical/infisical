package cloudflare

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of what one API token reaches inside fakenet.
type ControlPlane struct {
	*fakenet.Scope[Account]
}

// Open returns the account an API token belongs to.
func Open(tt *testing.T, adminURL, apiToken string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{fakenet.Open[Account](tt, adminURL, Service.Host(), apiToken)}
}
