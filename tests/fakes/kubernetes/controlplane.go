package kubernetes

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// ControlPlane is a test's view of the cluster one reviewer JWT reaches.
type ControlPlane struct {
	*fakenet.Scope[Cluster]
	ReviewerJWT string
}

// Open mints a reviewer JWT and returns the cluster it reaches.
func Open(tt *testing.T, adminURL string) *ControlPlane {
	tt.Helper()
	reviewer := id.Nonce() + "-reviewer"
	fakenet.Track(tt, adminURL, Service.Host(), reviewer)
	return &ControlPlane{Scope: fakenet.Open[Cluster](tt, adminURL, Service.Host(), reviewer), ReviewerJWT: reviewer}
}

// ServiceAccountToken mints a token the cluster vouches for as namespace/name.
func (cp *ControlPlane) ServiceAccountToken(tt *testing.T, namespace, name string, audiences ...string) string {
	tt.Helper()
	token := "sa-" + id.Nonce()
	cp.Seed(tt, map[string]any{"reviews": map[string]Review{token: {
		Authenticated: true, Username: ServiceAccount(namespace, name), Audiences: audiences,
	}}})
	return token
}

// RejectReviewer makes the cluster refuse the reviewer's own credential.
func (cp *ControlPlane) RejectReviewer(tt *testing.T) {
	tt.Helper()
	cp.Seed(tt, map[string]any{"rejectReviewer": true})
}
