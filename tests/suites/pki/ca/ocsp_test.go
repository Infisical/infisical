package ca_test

import (
	"bytes"
	"crypto/rand"
	"crypto/x509"
	"math/big"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/ocsp"
)

// askOcsp posts an OCSP request for cert to the CA's responder, unauthenticated, and
// checks the answer is signed by the issuer. The response embeds the CA's own
// certificate, which ocsp.ParseResponse would check against the issuer as if it were a
// delegated responder's, so the signature is checked here instead.
func askOcsp(t *testing.T, tn *harness.Tenant, ca pki.CA, cert, issuer *x509.Certificate) *ocsp.Response {
	t.Helper()
	req, err := ocsp.CreateRequest(cert, issuer, nil)
	require.NoError(t, err)
	res, err := tn.Anonymous(t).PostOcspRequestWithBodyWithResponse(t.Context(), ca.ID, "application/ocsp-request", bytes.NewReader(req))
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
	got, err := ocsp.ParseResponse(res.Body, nil)
	require.NoError(t, err)
	require.NoError(t, issuer.CheckSignature(got.SignatureAlgorithm, got.TBSResponseData, got.Signature), "the response is not signed by the CA")
	return got
}

func TestInternalCA_Ocsp(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should answer good, signed by the CA, for an active certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		leaf := pki.ParseLeaf(t, g.Issue(t, pki.ServerCertificate(id.Short()+".ocsp.test")).Certificate)

		// Action
		got := askOcsp(t, tn, g.CA, leaf, pki.CACertificate(t, tn.Admin, g.CA.ID))

		// Assert
		require.Equal(t, ocsp.Good, got.Status)
		require.Equal(t, leaf.SerialNumber, got.SerialNumber)
	})

	t.Run("should answer revoked with the revocation time once a certificate it answered good for is revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		cert := g.Issue(t, pki.ServerCertificate(id.Short()+".ocsp.test"))
		leaf, issuer := pki.ParseLeaf(t, cert.Certificate), pki.CACertificate(t, tn.Admin, g.CA.ID)
		require.Equal(t, ocsp.Good, askOcsp(t, tn, g.CA, leaf, issuer).Status)
		revokedAt := pki.Revoke(t, tn.Admin, cert, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Action
		got := askOcsp(t, tn, g.CA, leaf, issuer)

		// Assert
		require.Equal(t, ocsp.Revoked, got.Status)
		require.WithinDuration(t, revokedAt, got.RevokedAt, time.Second)
	})

	t.Run("should answer unknown for a serial the CA never issued", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 150))
		require.NoError(t, err)

		// Action
		got := askOcsp(t, tn, g.CA, &x509.Certificate{SerialNumber: serial}, pki.CACertificate(t, tn.Admin, g.CA.ID))

		// Assert
		require.Equal(t, ocsp.Unknown, got.Status)
	})

	t.Run("should answer malformedRequest as an OCSP response to a body that is not an OCSP request", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)

		// Action
		res, err := tn.Anonymous(t).PostOcspRequestWithBodyWithResponse(t.Context(), g.CA.ID, "application/json", strings.NewReader(`{"not":"ocsp"}`))

		// Assert
		require.NoError(t, err)
		requireMalformed(t, res)
	})

	t.Run("should answer malformedRequest as an OCSP response to an empty request", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)

		// Action
		res, err := tn.Anonymous(t).PostOcspRequestWithBodyWithResponse(t.Context(), g.CA.ID, "application/ocsp-request", bytes.NewReader(nil))

		// Assert
		require.NoError(t, err)
		requireMalformed(t, res)
	})
}

// requireMalformed checks the responder answered 200 with an OCSP response whose
// status is malformedRequest, as OCSP clients expect, rather than an HTTP error.
func requireMalformed(t *testing.T, res *api.PostOcspRequestResponse) {
	t.Helper()
	require.Equalf(t, http.StatusOK, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
	require.Equal(t, "application/ocsp-response", res.HTTPResponse.Header.Get("Content-Type"))
	_, err := ocsp.ParseResponse(res.Body, nil)
	var respErr ocsp.ResponseError
	require.ErrorAs(t, err, &respErr)
	require.Equal(t, ocsp.Malformed, respErr.Status)
}
