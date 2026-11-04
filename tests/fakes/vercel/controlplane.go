package vercel

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of one Vercel account inside fakenet.
//
// Everything generic comes from the embedded Scope: State, Seed, Fail, Calls,
// Received, and cleanup. Only the naming below is specific to Vercel.
type ControlPlane struct {
	*fakenet.Scope[Account]
}

// Open returns the account a credential addresses.
func Open(tt *testing.T, adminURL, credential string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{fakenet.Open[Account](tt, adminURL, Service.Host(), credential)}
}

// Envs is a project's environment variables. Empty when nothing was ever written to
// it, which is itself the assertion in a test about a write that should not happen.
func (cp *ControlPlane) Envs(tt *testing.T, projectID string) []Env {
	tt.Helper()
	p := cp.State(tt).Projects[projectID]
	if p == nil {
		return nil
	}
	return p.Envs
}
