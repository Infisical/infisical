package certificates_test

import (
	"crypto/ecdsa"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

type (
	caKey   = api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithm
	leafKey = api.CreateCertificateJSONBodyAttributesKeyAlgorithm
	leafSig = api.CreateCertificateJSONBodyAttributesSignatureAlgorithm
)

// algorithmGraph is a root CA on a key of the algorithm, issuing through a profile and
// an application with API enrollment on, under a policy that sets no algorithm limits.
type algorithmGraph struct {
	proj    *pki.Project
	ca      pki.CA
	profile pki.Profile
	app     pki.Application
}

func newAlgorithmGraph(t *testing.T, tn *harness.Tenant, key caKey) algorithmGraph {
	t.Helper()
	proj := pki.CertManager(t, tn)
	ca := pki.NewRootCA(t, proj, key)
	policy := pki.AllowAll(t)
	policy.Algorithms = nil
	profile := pki.NewProfile(t, proj, ca, pki.NewPolicy(t, proj, policy))
	app := pki.NewApplication(t, proj, profile)
	pki.EnableAPI(t, app, profile, api.SetPkiApplicationApiEnrollmentJSONRequestBody{})
	return algorithmGraph{proj: proj, ca: ca, profile: profile, app: app}
}

// algorithmRequest is a server certificate request on a key of the algorithm, signed
// with sig. It asks for digitalSignature alone, the one usage every algorithm here
// supports, since PQC keys sign only.
func algorithmRequest(key leafKey, sig leafSig) api.CreateCertificateJSONRequestBody {
	body := pki.ServerCertificate(id.Short() + ".algorithms.test")
	body.Attributes.KeyAlgorithm = &key
	body.Attributes.SignatureAlgorithm = &sig
	body.Attributes.KeyUsages = &[]api.CreateCertificateJSONBodyAttributesKeyUsages{api.CreateCertificateJSONBodyAttributesKeyUsagesDigitalSignature}
	return body
}

// requireNoCAs requires the tenant to have no CA.
func requireNoCAs(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	list, err := tn.Admin.API.ListInternalCertificateAuthoritiesV1WithResponse(t.Context(), nil)
	require.NoError(t, err)
	require.NotNilf(t, list.JSON200, "listing CAs returned %d: %s", list.StatusCode(), apierr.Body(list.Body))
	require.Empty(t, *list.JSON200)
}

// algorithmOIDs reads the OIDs of a certificate's public key and of the signature over
// it straight from the DER, since crypto/x509 does not know SLH-DSA keys.
func algorithmOIDs(t *testing.T, cert *x509.Certificate) (key, sig asn1.ObjectIdentifier) {
	t.Helper()
	var spki struct {
		Algorithm pkix.AlgorithmIdentifier
		PublicKey asn1.BitString
	}
	_, err := asn1.Unmarshal(cert.RawSubjectPublicKeyInfo, &spki)
	require.NoError(t, err)
	var outer struct {
		TBS                asn1.RawValue
		SignatureAlgorithm pkix.AlgorithmIdentifier
		Signature          asn1.BitString
	}
	_, err = asn1.Unmarshal(cert.Raw, &outer)
	require.NoError(t, err)
	return spki.Algorithm.Algorithm, outer.SignatureAlgorithm.Algorithm
}

// NIST's OIDs for the PQC signature algorithms (csor, 2.16.840.1.101.3.4.3).
var (
	oidMLDSA44         = asn1.ObjectIdentifier{2, 16, 840, 1, 101, 3, 4, 3, 17}
	oidMLDSA65         = asn1.ObjectIdentifier{2, 16, 840, 1, 101, 3, 4, 3, 18}
	oidMLDSA87         = asn1.ObjectIdentifier{2, 16, 840, 1, 101, 3, 4, 3, 19}
	oidSLHDSASHA2_128f = asn1.ObjectIdentifier{2, 16, 840, 1, 101, 3, 4, 3, 21}
)

func keyBits(t *testing.T, cert *x509.Certificate) int {
	t.Helper()
	switch k := cert.PublicKey.(type) {
	case *rsa.PublicKey:
		return k.N.BitLen()
	case *ecdsa.PublicKey:
		return k.Curve.Params().BitSize
	}
	t.Fatalf("unexpected public key %T", cert.PublicKey)
	return 0
}

func TestCertificate_Algorithms(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	for _, tc := range []struct {
		ca      caKey
		key     leafKey
		sig     leafSig
		wantKey x509.PublicKeyAlgorithm
		bits    int
		wantSig x509.SignatureAlgorithm
	}{
		{api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmRSA2048, api.CreateCertificateJSONBodyAttributesKeyAlgorithmRSA3072, api.CreateCertificateJSONBodyAttributesSignatureAlgorithmRSASHA384, x509.RSA, 3072, x509.SHA384WithRSA},
		{api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmRSA4096, api.CreateCertificateJSONBodyAttributesKeyAlgorithmRSA4096, api.CreateCertificateJSONBodyAttributesSignatureAlgorithmRSASHA512, x509.RSA, 4096, x509.SHA512WithRSA},
		{api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmRSA3072, api.CreateCertificateJSONBodyAttributesKeyAlgorithmECPrime256v1, api.CreateCertificateJSONBodyAttributesSignatureAlgorithmRSASHA256, x509.ECDSA, 256, x509.SHA256WithRSA},
		{api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmECPrime256v1, api.CreateCertificateJSONBodyAttributesKeyAlgorithmECPrime256v1, api.CreateCertificateJSONBodyAttributesSignatureAlgorithmECDSASHA256, x509.ECDSA, 256, x509.ECDSAWithSHA256},
		{api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmECSecp384r1, api.CreateCertificateJSONBodyAttributesKeyAlgorithmECSecp384r1, api.CreateCertificateJSONBodyAttributesSignatureAlgorithmECDSASHA384, x509.ECDSA, 384, x509.ECDSAWithSHA384},
		{api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmECSecp521r1, api.CreateCertificateJSONBodyAttributesKeyAlgorithmECSecp521r1, api.CreateCertificateJSONBodyAttributesSignatureAlgorithmECDSASHA512, x509.ECDSA, 521, x509.ECDSAWithSHA512},
		{api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmECSecp384r1, api.CreateCertificateJSONBodyAttributesKeyAlgorithmRSA2048, api.CreateCertificateJSONBodyAttributesSignatureAlgorithmECDSASHA384, x509.RSA, 2048, x509.ECDSAWithSHA384},
	} {
		t.Run("should issue a "+string(tc.key)+" certificate a "+string(tc.ca)+" CA signs with "+string(tc.sig), func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			g := newAlgorithmGraph(t, tn, tc.ca)

			// Action
			issued := pki.Issue(t, g.app, g.profile, algorithmRequest(tc.key, tc.sig))

			// Assert
			leaf := pki.ParseLeaf(t, issued.Certificate)
			require.Equal(t, tc.wantKey, leaf.PublicKeyAlgorithm)
			require.Equal(t, tc.bits, keyBits(t, leaf))
			require.Equal(t, tc.wantSig, leaf.SignatureAlgorithm)
			require.NoError(t, leaf.CheckSignatureFrom(pki.CACertificate(t, tn.Admin, g.ca.ID)))
		})
	}

	for _, tc := range []struct {
		ca      caKey
		key     leafKey
		sig     leafSig
		wantKey asn1.ObjectIdentifier
		wantSig asn1.ObjectIdentifier
	}{
		{api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmMLDSA44, api.CreateCertificateJSONBodyAttributesKeyAlgorithmMLDSA44, api.CreateCertificateJSONBodyAttributesSignatureAlgorithmMLDSA44, oidMLDSA44, oidMLDSA44},
		{api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmMLDSA65, api.CreateCertificateJSONBodyAttributesKeyAlgorithmMLDSA87, api.CreateCertificateJSONBodyAttributesSignatureAlgorithmMLDSA65, oidMLDSA87, oidMLDSA65},
		{api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmMLDSA87, api.CreateCertificateJSONBodyAttributesKeyAlgorithmSLHDSASHA2128f, api.CreateCertificateJSONBodyAttributesSignatureAlgorithmMLDSA87, oidSLHDSASHA2_128f, oidMLDSA87},
	} {
		t.Run("should issue a "+string(tc.key)+" certificate a "+string(tc.ca)+" CA signs with "+string(tc.sig), func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			g := newAlgorithmGraph(t, tn, tc.ca)

			// Action
			issued := pki.Issue(t, g.app, g.profile, algorithmRequest(tc.key, tc.sig))

			// Assert
			leaf := pki.ParseLeaf(t, issued.Certificate)
			key, sig := algorithmOIDs(t, leaf)
			require.Equal(t, tc.wantKey, key)
			require.Equal(t, tc.wantSig, sig)
			require.NoError(t, leaf.CheckSignatureFrom(pki.CACertificate(t, tn.Admin, g.ca.ID)))
		})
	}

	for _, tc := range []struct {
		ca  caKey
		key leafKey
		sig leafSig
	}{
		{api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmRSA2048, api.CreateCertificateJSONBodyAttributesKeyAlgorithmRSA2048, api.CreateCertificateJSONBodyAttributesSignatureAlgorithmECDSASHA256},
		{api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmECPrime256v1, api.CreateCertificateJSONBodyAttributesKeyAlgorithmECPrime256v1, api.CreateCertificateJSONBodyAttributesSignatureAlgorithmRSASHA256},
		{api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmMLDSA65, api.CreateCertificateJSONBodyAttributesKeyAlgorithmMLDSA65, api.CreateCertificateJSONBodyAttributesSignatureAlgorithmMLDSA44},
	} {
		t.Run("should refuse and issue nothing when a "+string(tc.ca)+" CA is asked to sign with "+string(tc.sig), func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			g := newAlgorithmGraph(t, tn, tc.ca)

			// Action
			res := pki.Request(t, tn.Admin, g.app, g.profile, algorithmRequest(tc.key, tc.sig))

			// Assert
			require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
			require.Zero(t, pki.Requests(t, g.proj, g.profile))
		})
	}

	t.Run("should refuse an SLH-DSA CA and name ML-DSA as the alternative", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res := pki.CreateRootCA(t, pki.CertManager(t, tn), api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmSLHDSASHA2128f)

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "SLH-DSA algorithms are not currently supported for CA creation. Use ML-DSA instead.", apierr.Message(res.Body))
		requireNoCAs(t, tn)
	})

	t.Run("should refuse an ML-DSA CA when the plan does not include PQC", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.PKIPQC)))

		// Action
		res := pki.CreateRootCA(t, pki.CertManager(t, tn), api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmMLDSA65)

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "Your license does not include PQC algorithms. Please upgrade to the Enterprise plan to use a PQC algorithm.", apierr.Message(res.Body))
		requireNoCAs(t, tn)
	})
}
