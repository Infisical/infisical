package syncs_test

import (
	"encoding/json"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

// issued is a certificate an application issued, to be synced.
func issued(t *testing.T, tn *harness.Tenant) (*pki.Graph, pki.Certificate) {
	t.Helper()
	g := pki.NewGraph(t, tn)
	return g, g.Issue(t, pki.ServerCertificate(id.Short()+".sync.test"))
}

// fromJSON fills a generated request body from its JSON form, for bodies whose nested
// fields the generator declares as anonymous structs.
func fromJSON(t *testing.T, dst any, v any) {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(raw, dst))
}
