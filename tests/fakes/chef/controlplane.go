package chef

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of one Chef user inside fakenet.
type ControlPlane struct {
	*fakenet.Scope[User]
}

// Open returns the user a connection signs as.
func Open(tt *testing.T, adminURL, userName string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{fakenet.Open[User](tt, adminURL, Service.Host(), userName)}
}
