package acmeca

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of one scope's CA inside fakenet.
type ControlPlane struct {
	*fakenet.Scope[CA]
	scope string
}

// Open returns the CA for a scope. The scope has to be tracked with fakenet.Track
// before its directory URL reaches Infisical.
func Open(tt *testing.T, adminURL, scope string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{Scope: fakenet.Open[CA](tt, adminURL, Service.Host(), scope), scope: scope}
}

// DirectoryURL is the URL to configure Infisical's ACME CA with.
func (cp *ControlPlane) DirectoryURL() string { return DirectoryURL(cp.scope) }
