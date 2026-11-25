package est_test

import (
	"crypto/x509"
	"encoding/base64"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestEstCaCerts_Get(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the issuing CA and its chain as PKCS#7 without authentication", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newEstProfile(t, tn, api.SetPkiApplicationEstEnrollmentJSONRequestBody{}, pki.AllowAll(t))

		// Action
		res, err := p.client.GetEstApplicationCaCertsWithResponse(t.Context(), p.App.ID, p.Profile.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "cacerts: %s", apierr.Body(res.Body))
		certs := certsOf(t, res.Body)
		require.Len(t, certs, 2)
		require.True(t, certs[0].IsCA)
		require.Equal(t, certs[1].Subject.String(), certs[0].Issuer.String())
		require.Equal(t, certs[1].Subject.String(), certs[1].Issuer.String())
	})
}

func TestEstEnrollment_SimpleEnroll(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a leaf for the CSR's key and name that chains to the issuing CA", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newEstProfile(t, tn, api.SetPkiApplicationEstEnrollmentJSONRequestBody{}, pki.AllowAll(t))
		key, name := newKey(t), id.Short()+".est.test"

		// Action
		res := p.enroll(t, newCSR(t, key, name), enrollOpts{})

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "enrolling: %s", apierr.Body(res.Body))
		require.Contains(t, res.HTTPResponse.Header.Get("Content-Type"), "application/pkcs7-mime")
		leaf := certsOf(t, res.Body)[0]
		require.Equal(t, name, leaf.Subject.CommonName)
		require.True(t, key.PublicKey.Equal(leaf.PublicKey))
		cacerts, err := p.client.GetEstApplicationCaCertsWithResponse(t.Context(), p.App.ID, p.Profile.ID)
		require.NoError(t, err)
		require.NoError(t, leaf.CheckSignatureFrom(certsOf(t, cacerts.Body)[0]))
	})

	t.Run("should issue a leaf for an ECDSA P-256 CSR from an ECDSA P-256 CA", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newEcdsaEstProfile(t, tn)
		key, name := newEcdsaKey(t), id.Short()+".est.test"

		// Action
		res := p.enroll(t, newCSR(t, key, name), enrollOpts{})

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "enrolling: %s", apierr.Body(res.Body))
		leaf := certsOf(t, res.Body)[0]
		require.Equal(t, name, leaf.Subject.CommonName)
		require.True(t, key.PublicKey.Equal(leaf.PublicKey))
		require.Equal(t, x509.ECDSAWithSHA256, leaf.SignatureAlgorithm)
	})

	t.Run("should accept a base64 CSR broken across lines", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newEstProfile(t, tn, api.SetPkiApplicationEstEnrollmentJSONRequestBody{}, pki.AllowAll(t))
		key, name := newKey(t), id.Short()+".est.test"
		b64 := base64.StdEncoding.EncodeToString(newCSR(t, key, name))
		var body strings.Builder
		for len(b64) > 64 {
			body.WriteString(b64[:64] + "\n")
			b64 = b64[64:]
		}
		body.WriteString(b64 + "\n")

		// Action
		res := p.enrollBody(t, "application/pkcs10", body.String(), enrollOpts{})

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "enrolling: %s", apierr.Body(res.Body))
		leaf := certsOf(t, res.Body)[0]
		require.Equal(t, name, leaf.Subject.CommonName)
		require.True(t, key.PublicKey.Equal(leaf.PublicKey))
	})

	t.Run("should refuse a CSR sent as another media type with 415 and issue nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newEstProfile(t, tn, api.SetPkiApplicationEstEnrollmentJSONRequestBody{}, pki.AllowAll(t))

		// Action
		res := p.enrollBody(t, "text/plain", csrPEM(newCSR(t, newKey(t), id.Short()+".est.test")), enrollOpts{})

		// Assert
		require.Equal(t, http.StatusUnsupportedMediaType, res.StatusCode())
		require.Equal(t, "Content-Type must be application/pkcs10", string(res.Body))
		require.Zero(t, pki.Requests(t, p.Project, p.Profile))
	})

	t.Run("should refuse a wrong passphrase with 401 and issue nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newEstProfile(t, tn, api.SetPkiApplicationEstEnrollmentJSONRequestBody{}, pki.AllowAll(t))

		// Action
		res := p.enroll(t, newCSR(t, newKey(t), id.Short()+".est.test"), enrollOpts{passphrase: "not-the-passphrase"})

		// Assert
		require.Equal(t, http.StatusUnauthorized, res.StatusCode())
		require.Equal(t, "Invalid credentials", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, p.Project, p.Profile))
	})

	t.Run("should refuse once EST enrollment is cleared", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newEstProfile(t, tn, api.SetPkiApplicationEstEnrollmentJSONRequestBody{}, pki.AllowAll(t))
		clear, err := tn.Admin.API.ClearPkiApplicationEstEnrollmentWithResponse(t.Context(), p.App.ID, p.Profile.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, clear.StatusCode(), "clearing EST: %s", apierr.Body(clear.Body))

		// Action
		res := p.enroll(t, newCSR(t, newKey(t), id.Short()+".est.test"), enrollOpts{})

		// Assert
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t, "EST configuration not found for this Application/Profile pair.", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, p.Project, p.Profile))
	})

	t.Run("should refuse a client certificate outside the bootstrap CA chain when validation is on", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		trusted, _ := selfSignedCA(t)
		p := newEstProfile(t, tn, api.SetPkiApplicationEstEnrollmentJSONRequestBody{CaChain: new(certPEM(trusted)), DisableBootstrapCaValidation: new(false)}, pki.AllowAll(t))
		other, otherKey := selfSignedCA(t)
		key, name := newKey(t), id.Short()+".est.test"
		bootstrap := leafFrom(t, other, otherKey, key, name)

		// Action
		res := p.enroll(t, newCSR(t, key, name), enrollOpts{clientCert: bootstrap})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Invalid certificate chain", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, p.Project, p.Profile))
	})

	t.Run("should refuse a CSR with a SAN the profile's policy does not allow and issue nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		policy := pki.AllowAll(t)
		(*policy.Sans)[0].Allowed = &[]string{"*.allowed.test"}
		p := newEstProfile(t, tn, api.SetPkiApplicationEstEnrollmentJSONRequestBody{}, policy)

		// Action
		res := p.enroll(t, newCSR(t, newKey(t), "x.denied.test"), enrollOpts{})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Certificate request validation failed: dns_name SAN value 'x.denied.test' does not match allowed patterns: *.allowed.test", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, p.Project, p.Profile))
	})
}

func TestEstEnrollment_SimpleReenroll(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a new certificate for the same subject when presented the issued one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newEstProfile(t, tn, api.SetPkiApplicationEstEnrollmentJSONRequestBody{}, pki.AllowAll(t))
		key, name := newKey(t), id.Short()+".est.test"
		issued := p.mustEnroll(t, key, name)

		// Action
		res := p.reenroll(t, newCSR(t, key, name), enrollOpts{clientCert: issued})

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "re-enrolling: %s", apierr.Body(res.Body))
		renewed := certsOf(t, res.Body)[0]
		require.Equal(t, issued.Subject.String(), renewed.Subject.String())
		require.NotEqual(t, issued.SerialNumber, renewed.SerialNumber)
	})

	t.Run("should re-enroll an ECDSA P-256 key issued by an ECDSA P-256 CA", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newEcdsaEstProfile(t, tn)
		key, name := newEcdsaKey(t), id.Short()+".est.test"
		issued := p.mustEnroll(t, key, name)

		// Action
		res := p.reenroll(t, newCSR(t, key, name), enrollOpts{clientCert: issued})

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "re-enrolling: %s", apierr.Body(res.Body))
		renewed := certsOf(t, res.Body)[0]
		require.Equal(t, issued.Subject.String(), renewed.Subject.String())
		require.NotEqual(t, issued.SerialNumber, renewed.SerialNumber)
		require.True(t, key.PublicKey.Equal(renewed.PublicKey))
	})

	t.Run("should refuse a client certificate another CA issued and issue nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newEstProfile(t, tn, api.SetPkiApplicationEstEnrollmentJSONRequestBody{}, pki.AllowAll(t))
		ca, caKey := selfSignedCA(t)
		key, name := newKey(t), id.Short()+".est.test"
		foreign := leafFrom(t, ca, caKey, key, name)

		// Action
		res := p.reenroll(t, newCSR(t, key, name), enrollOpts{clientCert: foreign})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Invalid client certificate: unable to build a valid certificate chain", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, p.Project, p.Profile))
	})
}
