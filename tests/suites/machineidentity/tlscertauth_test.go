package machineidentity_test

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const clientCertHeader = "x-identity-tls-cert-auth-client-cert"

func TestTlsCertAuth_Login(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a token for a client cert issued by the configured CA with an allowed CN", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ca := newCA(t)
		identityID := tlsIdentity(t, tn, ca, false)

		// Action
		res := tlsLogin(t, tn, identityID, withClientCert(ca.issue(t, "allowed-workload").pem))

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		requireWorks(t, tn.Client(t, res.JSON200.AccessToken))
		require.Equal(t, "tls-cert-auth", *fedIdentity(t, tn, identityID).JSON200.Identity.LastLoginAuthMethod)
	})

	t.Run("should answer 404 when the identity has no TLS certificate auth", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ca := newCA(t)
		identityID := fedNewIdentity(t, tn)

		// Action
		res := tlsLogin(t, tn, identityID, withClientCert(ca.issue(t, "allowed-workload").pem))

		// Assert
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "TLS Certificate auth method not found for identity")
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	refusals := []struct {
		name    string
		status  int
		message string
		cert    func(t *testing.T, configured *testCA) []api.RequestEditorFn
	}{
		{
			name: "should refuse a cert issued by another CA", status: http.StatusUnauthorized,
			message: "Access denied: Certificate not issued by the provided CA.",
			cert: func(t *testing.T, _ *testCA) []api.RequestEditorFn {
				return []api.RequestEditorFn{withClientCert(newCA(t).issue(t, "allowed-workload").pem)}
			},
		},
		{
			name: "should refuse a cert whose CN is not allowed", status: http.StatusUnauthorized,
			message: "Access denied: TLS Certificate Auth common name not allowed.",
			cert: func(t *testing.T, ca *testCA) []api.RequestEditorFn {
				return []api.RequestEditorFn{withClientCert(ca.issue(t, "other-workload").pem)}
			},
		},
		{
			name: "should refuse a login with no client cert header as a bad request", status: http.StatusBadRequest,
			message: "Missing TLS certificate in header",
			cert:    func(*testing.T, *testCA) []api.RequestEditorFn { return nil },
		},
		{
			name: "should refuse the CA cert used as the client cert", status: http.StatusUnauthorized,
			message: "Access denied: a CA certificate cannot be used as a client certificate.",
			cert: func(_ *testing.T, ca *testCA) []api.RequestEditorFn {
				return []api.RequestEditorFn{withClientCert(ca.pem)}
			},
		},
	}
	for _, tc := range refusals {
		t.Run(tc.name+" and issue no token", func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			ca := newCA(t)
			identityID := tlsIdentity(t, tn, ca, false)

			// Action
			res := tlsLogin(t, tn, identityID, tc.cert(t, ca)...)

			// Assert
			requireStatus(t, tc.status, res.StatusCode(), res.Body)
			require.Contains(t, string(res.Body), tc.message)
			require.Nil(t, res.JSON200)
			fedRequireNeverLoggedIn(t, tn, identityID)
		})
	}

	t.Run("should refuse a cert-bound token presented without the cert it was issued for", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ca := newCA(t)
		identityID := tlsIdentity(t, tn, ca, true)
		cert := ca.issue(t, "allowed-workload")
		login := tlsLogin(t, tn, identityID, withClientCert(cert.pem))
		requireStatus(t, http.StatusOK, login.StatusCode(), login.Body)
		token := login.JSON200.AccessToken

		// Action
		bare, err := tn.Client(t, token).GetMachineIdentityDetailsWithResponse(t.Context())
		require.NoError(t, err)
		other, err := tn.Client(t, token).GetMachineIdentityDetailsWithResponse(t.Context(),
			withClientCert(ca.issue(t, "allowed-workload").pem))
		require.NoError(t, err)

		// Assert
		requireStatus(t, http.StatusUnauthorized, bare.StatusCode(), bare.Body)
		require.Contains(t, string(bare.Body), "no client certificate was presented")
		requireStatus(t, http.StatusUnauthorized, other.StatusCode(), other.Body)
		require.Contains(t, string(other.Body), "does not match the certificate the access token is bound to")
		same, err := tn.Client(t, token).GetMachineIdentityDetailsWithResponse(t.Context(), withClientCert(cert.pem))
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, same.StatusCode(), same.Body)
	})
}

type testCA struct {
	cert *x509.Certificate
	key  *ecdsa.PrivateKey
	pem  string
}

type testCert struct {
	pem string
}

func newCA(t *testing.T) *testCA {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	tmpl := &x509.Certificate{
		SerialNumber:          serial(t),
		Subject:               pkix.Name{CommonName: "test-ca-" + uuid.NewString()[:8]},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)
	cert, err := x509.ParseCertificate(der)
	require.NoError(t, err)
	return &testCA{cert: cert, key: key, pem: string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))}
}

// issue signs a client-auth leaf certificate with the given common name.
func (ca *testCA) issue(t *testing.T, cn string) testCert {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	tmpl := &x509.Certificate{
		SerialNumber: serial(t),
		Subject:      pkix.Name{CommonName: cn},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, ca.cert, &key.PublicKey, ca.key)
	require.NoError(t, err)
	return testCert{pem: string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))}
}

func serial(t *testing.T) *big.Int {
	t.Helper()
	n, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 62))
	require.NoError(t, err)
	return n
}

// withClientCert sends a certificate the way a TLS-terminating proxy forwards it:
// URL-encoded PEM in a header. Path escaping, because the server decodes with
// decodeURIComponent, which leaves a '+' as a plus rather than a space.
func withClientCert(certPEM string) api.RequestEditorFn {
	return func(_ context.Context, req *http.Request) error {
		req.Header.Set(clientCertHeader, url.PathEscape(certPEM))
		return nil
	}
}

// tlsIdentity creates an identity whose TLS cert auth trusts ca and allows the common
// name allowed-workload.
func tlsIdentity(t *testing.T, tn *harness.Tenant, ca *testCA, bind bool) uuid.UUID {
	t.Helper()
	identityID := createIdentity(t, tn, api.CreateMachineIdentityJSONRequestBody{})
	res, err := tn.Admin.API.AttachTlsCertAuthWithResponse(t.Context(), identityID.String(), api.AttachTlsCertAuthJSONRequestBody{
		CaCertificate:                ca.pem,
		AllowedCommonNames:           new("allowed-workload"),
		BindAccessTokenToCertificate: &bind,
	})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return identityID
}

func tlsLogin(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, editors ...api.RequestEditorFn) *api.LoginWithTlsCertAuthResponse {
	t.Helper()
	res, err := tn.Anonymous(t).LoginWithTlsCertAuthWithResponse(t.Context(),
		api.LoginWithTlsCertAuthJSONRequestBody{IdentityId: identityID.String()}, editors...)
	require.NoError(t, err)
	return res
}
