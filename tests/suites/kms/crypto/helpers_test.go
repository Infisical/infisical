package crypto_test

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/mldsa"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/sha512"
	"crypto/x509"
	"encoding/asn1"
	"encoding/base64"
	"fmt"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func requireStatus(t *testing.T, want, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "body: %s", apierr.Body(body))
}

func newProject(t *testing.T, tn *harness.Tenant) *fixture.Project {
	t.Helper()
	return fixture.NewProject(t, tn, fixture.WithProjectType("kms"))
}

// publicKey returns the DER SPKI public key of a sign-verify key.
func publicKey(t *testing.T, p *fixture.Project, keyID uuid.UUID) []byte {
	t.Helper()
	res, err := p.Tenant().Admin.API.GetKmsKeyPublicKeyWithResponse(t.Context(), keyID)
	require.NoError(t, err)
	requireStatus(t, 200, res.StatusCode(), res.Body)
	return unb64(t, kms.Decode[struct{ PublicKey string }](t, res.Body).PublicKey)
}

func b64(b []byte) string { return base64.StdEncoding.EncodeToString(b) }

func unb64(t *testing.T, s string) []byte {
	t.Helper()
	b, err := base64.StdEncoding.DecodeString(s)
	require.NoError(t, err)
	return b
}

type signResult struct {
	Signature        string
	SigningAlgorithm string
}

func sign(t *testing.T, client *api.ClientWithResponses, keyID uuid.UUID, algorithm string, data []byte, isDigest bool) (*api.SignWithKmsKeyResponse, signResult) {
	t.Helper()
	res, err := client.SignWithKmsKeyWithBodyWithResponse(t.Context(), keyID, "application/json", kms.JSON(t,
		map[string]any{"signingAlgorithm": algorithm, "data": b64(data), "isDigest": isDigest}))
	require.NoError(t, err)
	var out signResult
	if res.StatusCode() == 200 {
		out = kms.Decode[signResult](t, res.Body)
	}
	return res, out
}

func signOK(t *testing.T, client *api.ClientWithResponses, keyID uuid.UUID, algorithm string, data []byte) []byte {
	t.Helper()
	res, out := sign(t, client, keyID, algorithm, data, false)
	requireStatus(t, 200, res.StatusCode(), res.Body)
	return unb64(t, out.Signature)
}

// verify returns whether Infisical accepts the signature.
func verify(t *testing.T, client *api.ClientWithResponses, keyID uuid.UUID, algorithm string, data, signature []byte, isDigest bool) bool {
	t.Helper()
	res, err := client.VerifyWithKmsKeyWithBodyWithResponse(t.Context(), keyID, "application/json", kms.JSON(t,
		map[string]any{"signingAlgorithm": algorithm, "data": b64(data), "signature": b64(signature), "isDigest": isDigest}))
	require.NoError(t, err)
	requireStatus(t, 200, res.StatusCode(), res.Body)
	return kms.Decode[struct{ SignatureValid bool }](t, res.Body).SignatureValid
}

func hashFor(algorithm string) (crypto.Hash, func([]byte) []byte) {
	switch {
	case strings.HasSuffix(algorithm, "SHA_256"):
		return crypto.SHA256, func(b []byte) []byte { s := sha256.Sum256(b); return s[:] }
	case strings.HasSuffix(algorithm, "SHA_384"):
		return crypto.SHA384, func(b []byte) []byte { s := sha512.Sum384(b); return s[:] }
	default:
		return crypto.SHA512, func(b []byte) []byte { s := sha512.Sum512(b); return s[:] }
	}
}

var mldsaParameters = map[string]mldsa.Parameters{
	"ML_DSA_44": mldsa.MLDSA44(), "ML_DSA_65": mldsa.MLDSA65(), "ML_DSA_87": mldsa.MLDSA87(),
}

// verifyLocally checks a signature with the Go standard library against the DER SPKI public key Infisical exports.
func verifyLocally(t *testing.T, publicKeyDER []byte, signingAlgorithm string, data, signature []byte) error {
	t.Helper()

	if params, ok := mldsaParameters[signingAlgorithm]; ok {
		var spki struct {
			Algorithm asn1.RawValue
			PublicKey asn1.BitString
		}
		_, err := asn1.Unmarshal(publicKeyDER, &spki)
		require.NoError(t, err)
		pub, err := mldsa.NewPublicKey(params, spki.PublicKey.Bytes)
		require.NoError(t, err)
		return mldsa.Verify(pub, data, signature, nil)
	}

	pub, err := x509.ParsePKIXPublicKey(publicKeyDER)
	require.NoError(t, err)
	hash, digest := hashFor(signingAlgorithm)

	switch key := pub.(type) {
	case *rsa.PublicKey:
		if strings.HasPrefix(signingAlgorithm, "RSASSA_PSS") {
			return rsa.VerifyPSS(key, hash, digest(data), signature, nil)
		}
		return rsa.VerifyPKCS1v15(key, hash, digest(data), signature)
	case *ecdsa.PublicKey:
		if !ecdsa.VerifyASN1(key, digest(data), signature) {
			return fmt.Errorf("ecdsa signature invalid")
		}
		return nil
	case ed25519.PublicKey:
		if !ed25519.Verify(key, data, signature) {
			return fmt.Errorf("ed25519 signature invalid")
		}
		return nil
	}
	return fmt.Errorf("unexpected public key type %T", pub)
}
