package syncs_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
)

// issued is a certificate an application issued, to be synced.
func issued(t *testing.T, tn *harness.Tenant) (*pki.Graph, pki.Certificate) {
	t.Helper()
	g := pki.NewGraph(t, tn)
	return g, g.Issue(t, pki.ServerCertificate(id.Short()+".sync.test"))
}
