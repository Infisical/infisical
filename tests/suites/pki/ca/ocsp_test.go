package ca_test

import (
	"bytes"
	"crypto/rand"
	"crypto/x509"
	"encoding/base64"
	"math/big"
	"net/http"
	"strconv"
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
	got, _ := askOcspByPost(t, tn, ca, cert, issuer)
	return got
}

// askOcspByPost is askOcsp, also returning the response headers.
func askOcspByPost(t *testing.T, tn *harness.Tenant, ca pki.CA, cert, issuer *x509.Certificate) (*ocsp.Response, http.Header) {
	t.Helper()
	req, err := ocsp.CreateRequest(cert, issuer, nil)
	require.NoError(t, err)
	res, err := tn.Anonymous(t).PostOcspRequestWithBodyWithResponse(t.Context(), ca.ID, "application/ocsp-request", bytes.NewReader(req))
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
	return parseSigned(t, res.Body, issuer), res.HTTPResponse.Header
}

// askOcspByGet sends the same request as askOcsp in the URL path, base64 encoded as
// RFC 6960 appendix A.1 describes, and returns the checked answer with its headers.
func askOcspByGet(t *testing.T, tn *harness.Tenant, ca pki.CA, cert, issuer *x509.Certificate) (*ocsp.Response, http.Header) {
	t.Helper()
	req, err := ocsp.CreateRequest(cert, issuer, nil)
	require.NoError(t, err)
	res, err := tn.Anonymous(t).GetOcspRequestWithResponse(t.Context(), ca.ID, base64.StdEncoding.EncodeToString(req))
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
	return parseSigned(t, res.Body, issuer), res.HTTPResponse.Header
}

func parseSigned(t *testing.T, body []byte, issuer *x509.Certificate) *ocsp.Response {
	t.Helper()
	got, err := ocsp.ParseResponse(body, nil)
	require.NoError(t, err)
	require.NoError(t, issuer.CheckSignature(got.SignatureAlgorithm, got.TBSResponseData, got.Signature), "the response is not signed by the CA")
	return got
}

// requireCacheable requires a Cache-Control header of "public, max-age=N" with N > 0.
// N counts down to the response's next update, so it is not pinned.
func requireCacheable(t *testing.T, header http.Header) {
	t.Helper()
	cc := header.Get("Cache-Control")
	maxAge, ok := strings.CutPrefix(cc, "public, max-age=")
	require.Truef(t, ok, "Cache-Control: %q", cc)
	n, err := strconv.Atoi(maxAge)
	require.NoErrorf(t, err, "Cache-Control: %q", cc)
	require.Positive(t, n)
}

// requireNotCacheable checks that a shared cache may not store the response. No-store
// or no-cache is fine; a public or positive max-age directive is not.
func requireNotCacheable(t *testing.T, header http.Header) {
	t.Helper()
	cc := header.Get("Cache-Control")
	for directive := range strings.SplitSeq(cc, ",") {
		directive = strings.ToLower(strings.TrimSpace(directive))
		require.NotEqualf(t, "public", directive, "Cache-Control: %q", cc)
		for _, prefix := range []string{"max-age=", "s-maxage="} {
			if age, ok := strings.CutPrefix(directive, prefix); ok {
				n, err := strconv.Atoi(age)
				require.Falsef(t, err == nil && n > 0, "Cache-Control: %q", cc)
			}
		}
	}
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

	t.Run("should answer unknown for a serial another CA in the project issued", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		leaf := pki.ParseLeaf(t, g.Issue(t, pki.ServerCertificate(id.Short()+".ocsp.test")).Certificate)
		other := pki.NewIntermediateCA(t, g.Project, g.Root)
		require.Equal(t, ocsp.Good, askOcsp(t, tn, g.CA, leaf, pki.CACertificate(t, tn.Admin, g.CA.ID)).Status)

		// Action
		got := askOcsp(t, tn, other, &x509.Certificate{SerialNumber: leaf.SerialNumber}, pki.CACertificate(t, tn.Admin, other.ID))

		// Assert
		require.Equal(t, ocsp.Unknown, got.Status)
		require.Equal(t, leaf.SerialNumber, got.SerialNumber)
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
		requireMalformed(t, res.HTTPResponse, res.Body)
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
		requireMalformed(t, res.HTTPResponse, res.Body)
	})

	t.Run("should answer a GET exactly as a POST, signed by the CA, for an active and a revoked certificate, and mark only the GET cacheable", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issuer := pki.CACertificate(t, tn.Admin, g.CA.ID)
		active := pki.ParseLeaf(t, g.Issue(t, pki.ServerCertificate(id.Short()+".ocsp.test")).Certificate)
		revokedCert := g.Issue(t, pki.ServerCertificate(id.Short()+".ocsp.test"))
		pki.Revoke(t, tn.Admin, revokedCert, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)
		revoked := pki.ParseLeaf(t, revokedCert.Certificate)

		for _, c := range []struct {
			leaf   *x509.Certificate
			status int
		}{{active, ocsp.Good}, {revoked, ocsp.Revoked}} {
			// Action
			byGet, getHeader := askOcspByGet(t, tn, g.CA, c.leaf, issuer)
			byPost, postHeader := askOcspByPost(t, tn, g.CA, c.leaf, issuer)

			// Assert
			require.Equal(t, c.status, byGet.Status)
			require.Equal(t, c.leaf.SerialNumber, byGet.SerialNumber)
			require.Equal(t, byPost.Status, byGet.Status)
			require.Equal(t, byPost.SerialNumber, byGet.SerialNumber)
			require.Equal(t, byPost.RevocationReason, byGet.RevocationReason)
			require.True(t, byPost.RevokedAt.Equal(byGet.RevokedAt), "revoked at %s by GET, %s by POST", byGet.RevokedAt, byPost.RevokedAt)
			requireCacheable(t, getHeader)
			requireNotCacheable(t, postHeader)
		}
	})

	t.Run("should answer malformedRequest as an OCSP response to a GET whose path is not a base64 OCSP request", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)

		// Action
		res, err := tn.Anonymous(t).GetOcspRequestWithResponse(t.Context(), g.CA.ID, base64.StdEncoding.EncodeToString([]byte("not an OCSP request")))

		// Assert
		require.NoError(t, err)
		requireMalformed(t, res.HTTPResponse, res.Body)
	})
}

// requireMalformed checks the responder answered 200 with an OCSP response whose
// status is malformedRequest, as OCSP clients expect, rather than an HTTP error.
func requireMalformed(t *testing.T, res *http.Response, body []byte) {
	t.Helper()
	require.Equalf(t, http.StatusOK, res.StatusCode, "answered: %s", apierr.Body(body))
	require.Equal(t, "application/ocsp-response", res.Header.Get("Content-Type"))
	_, err := ocsp.ParseResponse(body, nil)
	var respErr ocsp.ResponseError
	require.ErrorAs(t, err, &respErr)
	require.Equal(t, ocsp.Malformed, respErr.Status)
}
