package license

import (
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// PublicKeyPath is where the instance reads the key it verifies offline licenses
// against: beside signing.mjs in the built image (backend/src/lib/crypto/signing.ts).
const PublicKeyPath = "/app/dist/lib/crypto/license_public_key.pem"

// Signer stands in for Infisical's license signing key, so a test can issue a valid
// offline license. The instance trusts it only once its public key replaces the one
// in the image (harness.WithInfisicalFile(signer.PublicKeyFile, PublicKeyPath)).
type Signer struct {
	key *rsa.PrivateKey

	// PublicKeyFile is the PKCS#1 public key, written to a temporary file for the
	// harness to copy into the container.
	PublicKeyFile string
}

// NewSigner generates a signing key. Generated rather than committed, like the
// service key: a private key in the repo would be flagged by secret scanning.
func NewSigner() (*Signer, error) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("license: generating a signing key: %w", err)
	}
	dir, err := os.MkdirTemp("", "license-signer-*")
	if err != nil {
		return nil, err
	}
	file := filepath.Join(dir, "license_public_key.pem")
	der := x509.MarshalPKCS1PublicKey(&key.PublicKey)
	if err := os.WriteFile(file, pem.EncodeToMemory(&pem.Block{Type: "RSA PUBLIC KEY", Bytes: der}), 0o644); err != nil {
		return nil, err
	}
	return &Signer{key: key, PublicKeyFile: file}, nil
}

// OfflineLicense is the signed body of an offline license key.
type OfflineLicense struct {
	IssuedTo     string     `json:"issuedTo"`
	LicenseID    string     `json:"licenseId"`
	CustomerID   *string    `json:"customerId"`
	IssuedAt     time.Time  `json:"issuedAt"`
	ExpiresAt    *time.Time `json:"expiresAt"`
	TerminatesAt *time.Time `json:"terminatesAt"`

	// Version 2 carries License Server entitlements; otherwise Features holds the
	// legacy TFeatureSet fields directly.
	Version      int            `json:"version,omitempty"`
	Features     map[string]any `json:"features"`
	Entitlements any            `json:"entitlements,omitempty"`
}

// V1 is a legacy offline license carrying TFeatureSet fields.
func V1(licenseID string, features map[string]any) OfflineLicense {
	return OfflineLicense{
		IssuedTo:  "harness",
		LicenseID: licenseID,
		IssuedAt:  time.Now().UTC().Truncate(time.Second),
		Features:  features,
	}
}

// V2 is an offline license carrying a plan's entitlements, as the License Server
// issues them now.
func V2(licenseID string, p Plan) OfflineLicense {
	return OfflineLicense{
		IssuedTo:     "harness",
		LicenseID:    licenseID,
		IssuedAt:     time.Now().UTC().Truncate(time.Second),
		Version:      2,
		Features:     map[string]any{},
		Entitlements: p.Payload(),
	}
}

// Key signs a license and returns it in the LICENSE_KEY format: base64 of
// {"license": ..., "signature": ...}.
//
// The instance checks the signature against JSON.stringify of the parsed license, so
// the signed bytes are compact JSON with HTML escaping off, which JSON.stringify
// reproduces exactly for these values.
func (s *Signer) Key(l OfflineLicense) (string, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(l); err != nil {
		return "", err
	}
	body := bytes.TrimSuffix(buf.Bytes(), []byte("\n"))

	digest := sha256.Sum256(body)
	sig, err := rsa.SignPKCS1v15(rand.Reader, s.key, crypto.SHA256, digest[:])
	if err != nil {
		return "", err
	}

	var out bytes.Buffer
	outEnc := json.NewEncoder(&out)
	outEnc.SetEscapeHTML(false)
	if err := outEnc.Encode(struct {
		License   json.RawMessage `json:"license"`
		Signature string          `json:"signature"`
	}{body, base64.StdEncoding.EncodeToString(sig)}); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(bytes.TrimSuffix(out.Bytes(), []byte("\n"))), nil
}
