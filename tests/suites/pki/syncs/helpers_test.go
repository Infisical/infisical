package syncs_test

import (
	"crypto"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
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

// privateKeyOf is the private key Infisical holds for a certificate, which a renewal
// response does not return.
func privateKeyOf(t *testing.T, as *harness.Principal, certID string) string {
	t.Helper()
	bundle, err := as.API.GetCertificateBundleWithResponse(t.Context(), uuid.MustParse(certID))
	require.NoError(t, err)
	require.NotNilf(t, bundle.JSON200, "reading the bundle returned %d: %s", bundle.StatusCode(), apierr.Body(bundle.Body))
	require.NotNil(t, bundle.JSON200.PrivateKey)
	return strings.TrimSpace(*bundle.JSON200.PrivateKey)
}

// pairs reports whether key is the private half of the end-entity certificate in
// certPEM, a bundle whose chain may come before or after the leaf.
func pairs(t *testing.T, key pki.PrivateKey, certPEM string) bool {
	t.Helper()
	rest := []byte(certPEM)
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		require.NotNil(t, block, "no end-entity certificate in %q", certPEM)
		if block.Type != "CERTIFICATE" {
			continue
		}
		cert, err := x509.ParseCertificate(block.Bytes)
		require.NoError(t, err)
		if !cert.IsCA {
			return key.Public().(interface{ Equal(crypto.PublicKey) bool }).Equal(cert.PublicKey)
		}
	}
}

// requireRenewedKey checks a destination holds the key Infisical issued with the renewed
// certificate, paired with the certificate it holds, and not the key the renewal replaced.
func requireRenewedKey(t *testing.T, as *harness.Principal, original pki.Certificate, renewedID, heldCert, heldKey string) {
	t.Helper()
	held := pki.ParsePrivateKey(t, heldKey)
	require.True(t, pki.ParsePrivateKey(t, privateKeyOf(t, as, renewedID)).Equal(held), "the destination does not hold the renewed certificate's key")
	require.True(t, pairs(t, held, heldCert), "the destination's key is not the pair of the certificate it holds")
	require.False(t, pki.ParsePrivateKey(t, original.PrivateKey).Equal(held), "the destination still holds the key the renewal replaced")
}
