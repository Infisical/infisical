package est_test

import (
	"crypto"
	"crypto/x509"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestEstEnrollment_RenewalLink(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should link the new certificate to the client certificate it renews", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newEstProfile(t, tn, api.SetPkiApplicationEstEnrollmentJSONRequestBody{}, pki.AllowAll(t))
		key, name := newKey(t), id.Short()+".est.test"
		issued := p.mustEnroll(t, key, name)

		// Action
		renewed := p.linkReenroll(t, key, name, issued)

		// Assert
		original, replacement := p.stored(t, tn, issued), p.stored(t, tn, renewed)
		require.Equal(t, &replacement.ID, original.RenewedBy)
		require.Equal(t, &original.ID, replacement.RenewedFrom)
	})

	t.Run("should link a re-enrollment with an already-renewed certificate to the end of its chain", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newEstProfile(t, tn, api.SetPkiApplicationEstEnrollmentJSONRequestBody{}, pki.AllowAll(t))
		key, name := newKey(t), id.Short()+".est.test"
		issued := p.mustEnroll(t, key, name)
		firstRenewal := p.linkReenroll(t, key, name, issued)

		// Action
		secondRenewal := p.linkReenroll(t, key, name, issued)

		// Assert
		require.NotEqual(t, firstRenewal.SerialNumber, secondRenewal.SerialNumber)
		original, first, second := p.stored(t, tn, issued), p.stored(t, tn, firstRenewal), p.stored(t, tn, secondRenewal)
		require.Equal(t, &first.ID, original.RenewedBy, "the original keeps its first replacement")
		require.Equal(t, &second.ID, first.RenewedBy)
		require.Equal(t, &first.ID, second.RenewedFrom)
	})

	t.Run("should leave another Application's certificate unlinked when a client re-enrolls with it here", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newEstProfile(t, tn, api.SetPkiApplicationEstEnrollmentJSONRequestBody{}, pki.AllowAll(t))
		otherGraph := *p.ApplicationGraph
		otherGraph.App = pki.NewApplication(t, p.Project, p.Profile)
		other := enableEst(t, tn, &otherGraph, api.SetPkiApplicationEstEnrollmentJSONRequestBody{})
		key, name := newKey(t), id.Short()+".est.test"
		issuedElsewhere := other.mustEnroll(t, key, name)

		// Action
		res := p.reenroll(t, newCSR(t, key, name), enrollOpts{clientCert: issuedElsewhere})

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "re-enrolling: %s", apierr.Body(res.Body))
		require.Nil(t, p.stored(t, tn, issuedElsewhere).RenewedBy)
		require.Nil(t, p.stored(t, tn, certsOf(t, res.Body)[0]).RenewedFrom)
	})
}

// linkReenroll re-enrolls key and name with the client certificate and returns the issued leaf.
func (p estProfile) linkReenroll(t *testing.T, key crypto.Signer, name string, clientCert *x509.Certificate) *x509.Certificate {
	t.Helper()
	res := p.reenroll(t, newCSR(t, key, name), enrollOpts{clientCert: clientCert})
	require.Equalf(t, http.StatusOK, res.StatusCode(), "re-enrolling: %s", apierr.Body(res.Body))
	return certsOf(t, res.Body)[0]
}
