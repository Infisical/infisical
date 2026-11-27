package ultradns

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of what one user reaches.
type ControlPlane struct {
	*fakenet.Scope[Account]
}

// Open returns the account a username belongs to.
func Open(tt *testing.T, adminURL, username string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{fakenet.Open[Account](tt, adminURL, Service.Host(), username)}
}
