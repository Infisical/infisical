package certificates_test

import (
	"crypto"
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
	"software.sslmate.com/src/go-pkcs12"
)

func TestCertificate_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should read back the issued certificate, and a bundle with its chain and key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issued := g.Issue(t, pki.ServerCertificate(id.Short()+".read.test"))

		// Action
		res, err := g.Operator.API.GetCertificateBundleWithResponse(t.Context(), issued.ID)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading the bundle returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, pki.ParseLeaf(t, issued.Certificate).Raw, pki.ParseLeaf(t, res.JSON200.Certificate).Raw)
		require.Equal(t, issued.SerialNumber, res.JSON200.SerialNumber)
		require.NotNil(t, res.JSON200.CertificateChain)
		require.Equal(t, issued.Chain, *res.JSON200.CertificateChain)
		require.NotNil(t, res.JSON200.PrivateKey)
		require.Equal(t, issued.PrivateKey, *res.JSON200.PrivateKey)
		require.Equal(t, issued.SerialNumber, pki.ReadCertificate(t, g.Operator, issued.ID).JSON200.Certificate.SerialNumber)
	})

	t.Run("should export a PKCS#12 bundle that opens with the password to the certificate, chain and key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issued := g.Issue(t, pki.ServerCertificate(id.Short()+".p12.test"))

		// Action
		res, err := g.Operator.API.ExportCertificatePkcs12WithResponse(t.Context(), issued.ID, api.ExportCertificatePkcs12JSONRequestBody{
			Alias:    "server",
			Password: "correct-horse-battery-9",
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "exporting answered: %s", apierr.Body(res.Body))
		key, cert, chain, err := pkcs12.DecodeChain(res.Body, "correct-horse-battery-9")
		require.NoError(t, err)
		require.Equal(t, pki.ParseLeaf(t, issued.Certificate).Raw, cert.Raw)
		require.Len(t, chain, 2)
		require.True(t, publicKeyOf(t, issued.PrivateKey).Equal(key.(crypto.Signer).Public()))
	})

	t.Run("should refuse the private key of a certificate issued from a CSR", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		name := id.Short() + ".csr.test"
		csr, _ := newCSR(t, name, name)
		issued := g.Issue(t, csrRequest(csr))

		// Action
		res, err := g.Operator.API.GetCertificatePrivateKeyWithResponse(t.Context(), issued.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, fmt.Sprintf("Certificate secret for certificate with ID '%s' not found", issued.ID), apierr.Message(res.Body))
	})

	t.Run("should refuse another organization the certificate's private key", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, crossOrgWhy)

		// Setup
		owner, other := h.NewTenant(t), h.NewTenant(t)
		issued := pki.NewGraph(t, owner).Issue(t, pki.ServerCertificate(id.Short()+".cross.test"))

		// Action
		res, err := other.Admin.API.GetCertificatePrivateKeyWithResponse(t.Context(), issued.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "This project does not belong to your selected organization.", apierr.Message(res.Body))
	})
}
