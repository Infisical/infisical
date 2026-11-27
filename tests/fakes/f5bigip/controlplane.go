package f5bigip

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of one BIG-IP inside fakenet.
type ControlPlane struct {
	*fakenet.Scope[BigIP]
}

// Open returns the BIG-IP a user addresses.
func Open(tt *testing.T, adminURL, user string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{fakenet.Open[BigIP](tt, adminURL, Service.Host(), user)}
}
