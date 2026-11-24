package ca_test

import (
	"crypto/x509"
	"net/http"
	"net/url"
	"path"
	"slices"
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

// distributionPoint is the CRL distribution point an issued certificate carries, and the
// CRL id in it.
func distributionPoint(t *testing.T, cert pki.Certificate) (*url.URL, string) {
	t.Helper()
	leaf := pki.ParseLeaf(t, cert.Certificate)
	require.NotEmpty(t, leaf.CRLDistributionPoints)
	u, err := url.Parse(leaf.CRLDistributionPoints[0])
	require.NoError(t, err)
	return u, path.Base(path.Dir(u.Path))
}

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
		u, crlID := distributionPoint(t, cert)

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

	t.Run("should publish a new CRL with a higher number that still lists the revoked serial when regenerated", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		cert := g.Issue(t, pki.ServerCertificate(id.Short()+".crl.test"))
		pki.Revoke(t, tn.Admin, cert, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)
		before := pki.ParseCRL(t, pki.CurrentCRL(t, tn.Admin.API, g.CA))

		// Action
		res, err := tn.Admin.API.RegenerateCaCrlWithResponse(t.Context(), g.CA.ID)
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "regenerating returned %d: %s", res.StatusCode(), apierr.Body(res.Body))

		// Assert
		published := pki.CurrentCRL(t, tn.Admin.API, g.CA)
		require.Equal(t, published, pki.DecodeCRL(res.JSON200.Crl.Crl), "regenerating returned a different CRL from the one published")
		_, crlID := distributionPoint(t, cert)
		served, err := tn.Anonymous(t).GetCrlDerWithResponse(t.Context(), crlID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, served.StatusCode(), "fetching the distribution point answered: %s", apierr.Body(served.Body))
		require.Equal(t, published, served.Body, "the certificate's distribution point serves a different CRL")
		after := pki.ParseCRL(t, published)
		require.NotNil(t, before.Number, "the CRL before regenerating has no CRL number")
		require.NotNil(t, after.Number, "the regenerated CRL has no CRL number")
		require.Equal(t, 1, after.Number.Cmp(before.Number), "the CRL number went from %s to %s", before.Number, after.Number)
		require.True(t, after.Number.IsInt64(), "CRL number %s", after.Number)
		require.Equal(t, after.Number.Int64(), res.JSON200.Crl.CrlNumber)
		require.NoError(t, after.CheckSignatureFrom(pki.CACertificate(t, tn.Admin, g.CA.ID)))
		serial := pki.ParseLeaf(t, cert.Certificate).SerialNumber
		require.True(t, slices.ContainsFunc(after.RevokedCertificateEntries, func(e x509.RevocationListEntry) bool { return e.SerialNumber.Cmp(serial) == 0 }),
			"the revoked serial is not on the regenerated CRL")
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
