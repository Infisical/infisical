package pki

import (
	"crypto/x509"
	"encoding/pem"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// CurrentCRL is the CA's CRL as getCaCrls lists it, DER.
func CurrentCRL(tt *testing.T, client *api.ClientWithResponses, ca CA) []byte {
	tt.Helper()
	res, err := client.GetCaCrlsWithResponse(tt.Context(), ca.ID.String())
	require.NoError(tt, err, "listing CRLs")
	require.NotNilf(tt, res.JSON200, "listing CRLs returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	require.Len(tt, *res.JSON200, 1)
	return DecodeCRL((*res.JSON200)[0].Crl)
}

// DecodeCRL is the DER of a CRL as the API returns it, PEM or DER.
func DecodeCRL(raw string) []byte {
	if block, _ := pem.Decode([]byte(raw)); block != nil {
		return block.Bytes
	}
	return []byte(raw)
}

// ParseCRL parses a DER CRL, such as CurrentCRL returns.
func ParseCRL(tt *testing.T, der []byte) *x509.RevocationList {
	tt.Helper()
	crl, err := x509.ParseRevocationList(der)
	require.NoError(tt, err, "parsing the CRL")
	return crl
}
