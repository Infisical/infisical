package pki

import (
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
	raw := (*res.JSON200)[0].Crl
	if block, _ := pem.Decode([]byte(raw)); block != nil {
		return block.Bytes
	}
	return []byte(raw)
}
