package panos

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of one firewall inside fakenet.
type ControlPlane struct {
	*fakenet.Scope[Firewall]
}

// Open returns the firewall an admin addresses.
func Open(tt *testing.T, adminURL, user string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{fakenet.Open[Firewall](tt, adminURL, Service.Host(), user)}
}
