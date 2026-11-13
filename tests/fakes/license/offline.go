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

// PublicKeyPath sits next to signing.mjs in the built image (see backend/src/lib/crypto/signing.ts).
const PublicKeyPath = "/app/dist/lib/crypto/license_public_key.pem"

// Signer fakes Infisical's license signing key. The instance only trusts it once you
// swap its public key into the image with harness.WithInfisicalFile.
type Signer struct {
	key *rsa.PrivateKey

	// Temp file with the PKCS#1 public key, for the harness to copy into the container.
	PublicKeyFile string
}

// NewSigner generates its key instead of committing one: secret scanning would flag it.
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

type OfflineLicense struct {
	IssuedTo     string     `json:"issuedTo"`
	LicenseID    string     `json:"licenseId"`
	CustomerID   *string    `json:"customerId"`
	IssuedAt     time.Time  `json:"issuedAt"`
	ExpiresAt    *time.Time `json:"expiresAt"`
	TerminatesAt *time.Time `json:"terminatesAt"`

	// Version 2 carries License Server entitlements; otherwise Features holds the
	// legacy Plan fields directly.
	Version      int            `json:"version,omitempty"`
	Features     map[string]any `json:"features"`
	Entitlements any            `json:"entitlements,omitempty"`
}

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

// Key signs l as compact JSON with HTML escaping off, to match the JSON.stringify the
// instance verifies against byte for byte.
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
