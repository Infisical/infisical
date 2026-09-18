package license

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// generateTestKeyPair creates an RSA keypair for testing signature verification.
func generateTestKeyPair(t *testing.T) (*rsa.PrivateKey, *rsa.PublicKey) {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	return privateKey, &privateKey.PublicKey
}

// signTestLicense signs license JSON with the test private key.
func signTestLicense(t *testing.T, privateKey *rsa.PrivateKey, licenseJSON []byte) string {
	t.Helper()
	hash := sha256.Sum256(licenseJSON)
	signature, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, hash[:])
	require.NoError(t, err)
	return base64.StdEncoding.EncodeToString(signature)
}

func TestVerifySignatureWithKey_ValidSignature(t *testing.T) {
	t.Parallel()

	privateKey, publicKey := generateTestKeyPair(t)

	tests := []struct {
		name        string
		licenseJSON string
	}{
		{
			name:        "simple license",
			licenseJSON: `{"issuedTo":"test","licenseId":"123"}`,
		},
		{
			name:        "license with features",
			licenseJSON: `{"issuedTo":"Acme Corp","licenseId":"lic-456","features":{"secretsManagement":true}}`,
		},
		{
			name:        "license with termination date",
			licenseJSON: `{"issuedTo":"test","licenseId":"789","terminatesAt":"2030-01-01T00:00:00Z"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			signature := signTestLicense(t, privateKey, []byte(tt.licenseJSON))
			err := verifySignatureWithKey([]byte(tt.licenseJSON), signature, publicKey)
			require.NoError(t, err, "valid signature should be accepted")
		})
	}
}

func TestVerifySignatureWithKey_RejectsInvalidSignature(t *testing.T) {
	t.Parallel()

	_, publicKey := generateTestKeyPair(t)

	tests := []struct {
		name        string
		licenseJSON string
		signature   string
	}{
		{
			name:        "empty signature",
			licenseJSON: `{"issuedTo":"test","licenseId":"123"}`,
			signature:   "",
		},
		{
			name:        "garbage signature",
			licenseJSON: `{"issuedTo":"test","licenseId":"123"}`,
			signature:   "bm90YXZhbGlkc2lnbmF0dXJl", // "notavalidsignature" in base64
		},
		{
			name:        "valid base64 but wrong signature",
			licenseJSON: `{"issuedTo":"forged","features":{}}`,
			signature:   "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := verifySignatureWithKey([]byte(tt.licenseJSON), tt.signature, publicKey)
			require.Error(t, err, "invalid signature should be rejected")
		})
	}
}

func TestVerifySignatureWithKey_RejectsTamperedData(t *testing.T) {
	t.Parallel()

	privateKey, publicKey := generateTestKeyPair(t)

	// Sign original license
	originalJSON := `{"issuedTo":"test","licenseId":"123"}`
	signature := signTestLicense(t, privateKey, []byte(originalJSON))

	// Try to verify with tampered data
	tamperedJSON := `{"issuedTo":"hacker","licenseId":"123"}`
	err := verifySignatureWithKey([]byte(tamperedJSON), signature, publicKey)
	require.Error(t, err, "tampered data should fail signature verification")
	assert.Contains(t, err.Error(), "signature verification failed")
}

func TestVerifySignatureWithKey_RejectsWrongKey(t *testing.T) {
	t.Parallel()

	// Sign with one keypair
	privateKey1, _ := generateTestKeyPair(t)
	licenseJSON := `{"issuedTo":"test","licenseId":"123"}`
	signature := signTestLicense(t, privateKey1, []byte(licenseJSON))

	// Verify with different keypair
	_, publicKey2 := generateTestKeyPair(t)
	err := verifySignatureWithKey([]byte(licenseJSON), signature, publicKey2)
	require.Error(t, err, "signature from different key should be rejected")
}

func TestVerifyOfflineLicenseSignature_PublicKeyLoaded(t *testing.T) {
	t.Parallel()

	require.NotEmpty(t, licensePublicKeyPEM, "license public key should be embedded")
	assert.Contains(t, string(licensePublicKeyPEM), "BEGIN RSA PUBLIC KEY", "should be RSA public key PEM")

	// Verify the key is parseable
	pubKey, err := parseLicensePublicKey()
	require.NoError(t, err, "embedded public key should be parseable")
	require.NotNil(t, pubKey)
}

func TestVerifyOfflineLicenseSignature_RejectsForgedLicense(t *testing.T) {
	t.Parallel()

	// This tests that forged licenses signed with a different key are rejected
	// by the production verifyOfflineLicenseSignature function.
	forgedJSON := `{"issuedTo":"hacker","features":{"allFeatures":true}}`
	forgedSignature := "bm90YXZhbGlkc2lnbmF0dXJl"

	err := verifyOfflineLicenseSignature([]byte(forgedJSON), forgedSignature)
	require.Error(t, err, "forged license should be rejected by production verification")
}
