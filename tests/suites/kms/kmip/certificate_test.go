package kmip_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func csrFor(t *testing.T, clientID, projectID string) (string, *ecdsa.PrivateKey) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	der, err := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{
		Subject: pkix.Name{CommonName: clientID, OrganizationalUnit: []string{projectID}},
	}, key)
	require.NoError(t, err)
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE REQUEST", Bytes: der})), key
}

func TestKmipClientCertificate_Issue(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	for _, keyAlgorithm := range []string{"RSA_2048", "RSA_3072", "RSA_4096", "EC_prime256v1", "EC_secp384r1", "EC_secp521r1"} {
		t.Run("should issue a client-auth certificate for the client and project that verifies against the root alone, with "+keyAlgorithm, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := newProject(t, tn)
			c := newClient(t, proj, "get")
			server := enrollServer(t, tn)

			// Action
			res, cert := issueCertificate(t, proj, c.ID, map[string]any{"keyAlgorithm": keyAlgorithm, "ttl": "30d"})

			// Assert
			requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
			leaf := parseCertificate(t, cert.Certificate)
			require.Equal(t, c.ID, leaf.Subject.CommonName)
			require.Equal(t, []string{proj.ID}, leaf.Subject.OrganizationalUnit)
			require.Equal(t, []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth}, leaf.ExtKeyUsage)
			require.Equal(t, cert.SerialNumber, serialOf(t, cert.Certificate))
			require.NotEmpty(t, cert.PrivateKey)
			requireVerifies(t, cert.Certificate, server.certificate.ClientCertificateChain, x509.ExtKeyUsageClientAuth)
			requireVerifies(t, server.certificate.Certificate, cert.CertificateChain, x509.ExtKeyUsageServerAuth)
		})
	}

	t.Run("should issue from a CSR without returning a private key, keeping the CSR's public key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		c := newClient(t, proj, "get")
		server := enrollServer(t, tn)
		csr, key := csrFor(t, c.ID, proj.ID)

		// Action
		res, cert := issueCertificate(t, proj, c.ID, map[string]any{"csr": csr, "ttl": "30d"})

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Empty(t, cert.PrivateKey)
		require.True(t, key.PublicKey.Equal(parseCertificate(t, cert.Certificate).PublicKey))
		requireVerifies(t, cert.Certificate, server.certificate.ClientCertificateChain, x509.ExtKeyUsageClientAuth)
	})

	t.Run("should refuse a request Infisical cannot issue from", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		c := newClient(t, proj, "get")
		csr, _ := csrFor(t, c.ID, proj.ID)
		block, _ := pem.Decode([]byte(csr))
		block.Bytes[len(block.Bytes)-1] ^= 0xff
		badSignature := string(pem.EncodeToMemory(block))
		cases := map[string]struct {
			body    map[string]any
			status  int
			message string
		}{
			"bad CSR signature":    {map[string]any{"csr": badSignature, "ttl": "30d"}, http.StatusBadRequest, "Invalid CSR signature"},
			"TTL under an hour":    {map[string]any{"keyAlgorithm": "RSA_2048", "ttl": "30m"}, http.StatusUnprocessableEntity, "TTL must be a valid duration of at least 1 hour"},
			"TTL past the CA":      {map[string]any{"keyAlgorithm": "RSA_2048", "ttl": "11y"}, http.StatusBadRequest, "notAfter date is after CA certificate's notAfter date"},
			"no CSR nor algorithm": {map[string]any{"ttl": "30d"}, http.StatusUnprocessableEntity, "Either csr or keyAlgorithm must be provided"},
		}

		for name, tc := range cases {
			// Action
			res, _ := issueCertificate(t, proj, c.ID, tc.body)

			// Assert
			require.Equalf(t, tc.status, res.StatusCode(), "%s: %s", name, apierr.Body(res.Body))
			require.Containsf(t, string(res.Body), tc.message, "%s", name)
		}
	})

	t.Run("should refuse issuing a certificate when the plan does not include KMIP", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		c := newClient(t, proj, "get")
		tn.SetPlan(t, license.Enterprise().Without(license.KMIP))

		// Action
		res, _ := issueCertificate(t, proj, c.ID, map[string]any{"keyAlgorithm": "RSA_2048", "ttl": "30d"})

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "Upgrade your plan to enterprise")
	})
}
