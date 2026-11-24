package kemp

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of one LoadMaster inside fakenet.
type ControlPlane struct {
	*fakenet.Scope[LoadMaster]
}

// Open returns the LoadMaster a user addresses.
func Open(tt *testing.T, adminURL, user string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{fakenet.Open[LoadMaster](tt, adminURL, Service.Host(), user)}
}
