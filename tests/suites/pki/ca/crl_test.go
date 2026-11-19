package ca_test

import (
	"crypto/x509"
	"net/http"
	"net/url"
	"path"
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

func TestInternalCA_Crl(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list a revoked certificate with its reason and time on the issuing CA's signed CRL, and no unrevoked one", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "Revocation regenerates the CRL itself; regenerateCaCrl is not needed.")

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		revoked := g.Issue(t, pki.ServerCertificate(id.Short()+".crl.test"))
		kept := g.Issue(t, pki.ServerCertificate(id.Short()+".crl.test"))

		// Action
		revokedAt := pki.Revoke(t, tn.Admin, revoked, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Assert
		crl := pki.ParseCRL(t, pki.CurrentCRL(t, tn.Admin.API, g.CA))
		require.NoError(t, crl.CheckSignatureFrom(pki.CACertificate(t, tn.Admin, g.CA.ID)))
		serials := map[string]x509.RevocationListEntry{}
		for _, e := range crl.RevokedCertificateEntries {
			serials[e.SerialNumber.String()] = e
		}
		entry, ok := serials[pki.ParseLeaf(t, revoked.Certificate).SerialNumber.String()]
		require.True(t, ok, "the revoked serial is not on the CRL")
		require.Equal(t, 1, entry.ReasonCode)
		require.WithinDuration(t, revokedAt, entry.RevocationTime, time.Second)
		require.NotContains(t, serials, pki.ParseLeaf(t, kept.Certificate).SerialNumber.String())
	})

	t.Run("should serve the same CRL, unauthenticated, at the distribution point issued certificates carry", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		cert := g.Issue(t, pki.ServerCertificate(id.Short()+".crl.test"))
		pki.Revoke(t, tn.Admin, cert, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)
		leaf := pki.ParseLeaf(t, cert.Certificate)
		require.NotEmpty(t, leaf.CRLDistributionPoints)
		u, err := url.Parse(leaf.CRLDistributionPoints[0])
		require.NoError(t, err)
		crlID := path.Base(path.Dir(u.Path))

		// Action
		res, err := tn.Anonymous(t).GetCrlDerWithResponse(t.Context(), crlID)

		// Assert
		require.NoError(t, err)
		require.Equal(t, h.App().SiteURL(), u.Scheme+"://"+u.Host)
		require.Equal(t, "/api/v1/cert-manager/crl/"+crlID+"/der", u.Path)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "fetching %s answered: %s", u, apierr.Body(res.Body))
		require.Equal(t, "application/pkix-crl", res.HTTPResponse.Header.Get("Content-Type"))
		require.Equal(t, pki.CurrentCRL(t, tn.Admin.API, g.CA), res.Body)
	})

	t.Run("should refuse another organization the CA's CRLs", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] An unknown id answers 404 and another organization's id 403 naming the
			project, which tells a caller the id exists.`)

		// Setup
		owner, other := h.NewTenant(t), h.NewTenant(t)
		ca := pki.NewInternalCA(t, pki.CertManager(t, owner))

		// Action
		res, err := other.Admin.API.GetCaCrlsWithResponse(t.Context(), ca.ID.String())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "This project does not belong to your selected organization.", apierr.Message(res.Body))
	})
}
