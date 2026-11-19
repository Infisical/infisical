package certificates_test

import (
	"math/big"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestCertificate_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should remove the certificate from reads and keep its revoked serial on the CRL", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Revoked and deleted by the Product Admin: deleting is not an operator's to do, and
			an operator is refused revocation today (TestApplicationAccess_KnownIssues).
			Revoking a second certificate after the delete rebuilds the CRL from what is stored then.`)

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issued := g.Issue(t, pki.ServerCertificate(id.Short()+".delete.test"))
		rebuild := g.Issue(t, pki.ServerCertificate(id.Short()+".delete.test"))
		pki.Revoke(t, tn.Admin, issued, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Action
		res, err := tn.Admin.API.DeleteCertificateWithResponse(t.Context(), issued.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting answered: %s", apierr.Body(res.Body))
		pki.Revoke(t, tn.Admin, rebuild, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Assert
		require.Equal(t, http.StatusNotFound, readCert(t, tn.Admin, issued.ID).StatusCode())
		crl := pki.ParseCRL(t, pki.CurrentCRL(t, tn.Admin.API, g.CA))
		listed := func(cert pki.Certificate) bool {
			serial, ok := new(big.Int).SetString(cert.SerialNumber, 16)
			require.True(t, ok, "serial %q is not hex", cert.SerialNumber)
			for _, e := range crl.RevokedCertificateEntries {
				if e.SerialNumber.Cmp(serial) == 0 {
					return true
				}
			}
			return false
		}
		require.True(t, listed(rebuild), "the CRL was not rebuilt after the delete")
		require.True(t, listed(issued), "the deleted certificate's serial left the CRL")
	})
}
