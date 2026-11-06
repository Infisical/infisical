package website

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of one scope's site inside fakenet.
type ControlPlane struct {
	*fakenet.Scope[Site]
	scope string
}

// Open returns the site for a scope. The scope has to be tracked with fakenet.Track
// before a name under it reaches Infisical.
func Open(tt *testing.T, adminURL, scope string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{Scope: fakenet.Open[Site](tt, adminURL, Service.Host(), scope), scope: scope}
}

// Name is a hostname this site answers for.
func (cp *ControlPlane) Name(label string) string { return Name(cp.scope, label) }

// Publish serves a key authorization at /.well-known/acme-challenge/<token>.
func (cp *ControlPlane) Publish(tt *testing.T, token, keyAuthorization string) {
	tt.Helper()
	cp.Seed(tt, Challenge(token, keyAuthorization))
}
