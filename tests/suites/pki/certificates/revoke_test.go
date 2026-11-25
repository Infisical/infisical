package certificates_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

const adminRevokesWhy = `Revoked by the Product Admin: an application operator is refused revocation
	today, which TestApplicationAccess_KnownIssues covers.`

func TestCertificate_Revoke(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should mark the certificate revoked with the reason and time", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, adminRevokesWhy)

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issued := g.Issue(t, pki.ServerCertificate(id.Short()+".revoke.test"))

		// Action
		res, err := tn.Admin.API.RevokeCertificateWithResponse(t.Context(), issued.ID.String(), api.RevokeCertificateJSONRequestBody{RevocationReason: api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "revoking returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		got := pki.ReadCertificate(t, g.Operator, issued.ID).JSON200.Certificate
		require.Equal(t, "revoked", got.Status)
		require.NotNil(t, got.RevokedAt)
		require.WithinDuration(t, res.JSON200.RevokedAt, *got.RevokedAt, time.Second)
		require.Equal(t, new(float32(1)), got.RevocationReason)
	})

	t.Run("should refuse to revoke twice and keep the first revocation", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, adminRevokesWhy)

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		name := id.Short() + ".revoke.test"
		issued := g.Issue(t, pki.ServerCertificate(name))
		first := pki.Revoke(t, tn.Admin, issued, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Action
		res, err := tn.Admin.API.RevokeCertificateWithResponse(t.Context(), issued.ID.String(), api.RevokeCertificateJSONRequestBody{RevocationReason: api.RevokeCertificateJSONBodyRevocationReasonSUPERSEDED})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "Certificate '"+name+"' is already revoked.", apierr.Message(res.Body))
		got := pki.ReadCertificate(t, g.Operator, issued.ID).JSON200.Certificate
		require.WithinDuration(t, first, *got.RevokedAt, time.Second)
		require.Equal(t, new(float32(1)), got.RevocationReason)
	})

	t.Run("should refuse another organization revoking the certificate and leave it active", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, crossOrgWhy)

		// Setup
		owner, other := h.NewTenant(t), h.NewTenant(t)
		g := pki.NewGraph(t, owner)
		issued := g.Issue(t, pki.ServerCertificate(id.Short()+".cross.test"))

		// Action
		res, err := other.Admin.API.RevokeCertificateWithResponse(t.Context(), issued.ID.String(), api.RevokeCertificateJSONRequestBody{RevocationReason: api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "This project does not belong to your selected organization.", apierr.Message(res.Body))
		require.Equal(t, "active", pki.ReadCertificate(t, g.Operator, issued.ID).JSON200.Certificate.Status)
	})
}
