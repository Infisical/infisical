package linuxserver

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of the host one username logs in to.
type ControlPlane struct {
	*fakenet.Scope[Server]
}

// Open returns the host a username addresses.
func Open(tt *testing.T, adminURL, username string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{fakenet.Open[Server](tt, adminURL, Service.Host(), username)}
}

// WithDirectories is a fragment creating directories on the host.
func WithDirectories(dirs ...string) map[string]any {
	return map[string]any{"directories": dirs}
}
