// Package kms builds KMS resources: keys and the operations a test needs to set up or observe them.
package kms

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Key usages, as the API names them.
const (
	EncryptDecrypt = "encrypt-decrypt"
	SignVerify     = "sign-verify"
	MAC            = "generate-verify-mac"
)

// Key is a KMS key as the key routes return it.
type Key struct {
	ID                  uuid.UUID `json:"id"`
	Name                string    `json:"name"`
	Description         *string   `json:"description"`
	ProjectID           string    `json:"projectId"`
	OrgID               uuid.UUID `json:"orgId"`
	KeyUsage            string    `json:"keyUsage"`
	Algorithm           string    `json:"algorithm"`
	Version             int       `json:"version"`
	IsDisabled          bool      `json:"isDisabled"`
	IsExportable        bool      `json:"isExportable"`
	HasDeleteProtection bool      `json:"hasDeleteProtection"`
}

type Option func(*config)

type config struct {
	name             string
	usage            string
	algorithm        string
	notExportable    bool
	deleteProtection bool
}

func WithName(name string) Option { return func(c *config) { c.name = name } }

// WithUsage picks the key usage; without it a key is encrypt-decrypt.
func WithUsage(usage string) Option { return func(c *config) { c.usage = usage } }

// WithAlgorithm picks the algorithm; without it the server's default for the usage applies.
func WithAlgorithm(algorithm string) Option { return func(c *config) { c.algorithm = algorithm } }

func NotExportable() Option { return func(c *config) { c.notExportable = true } }

func WithDeleteProtection() Option { return func(c *config) { c.deleteProtection = true } }

func resolve(opts []Option) config {
	cfg := config{name: "k-" + id.Short()}
	for _, o := range opts {
		o(&cfg)
	}
	return cfg
}

// CreateBody is the create request a NewKey call sends, for a test about creating a key.
func CreateBody(p *fixture.Project, opts ...Option) map[string]any {
	cfg := resolve(opts)
	body := map[string]any{"projectId": p.ID, "name": cfg.name}
	if cfg.usage != "" {
		body["keyUsage"] = cfg.usage
	}
	if cfg.algorithm != "" {
		body["algorithm"] = cfg.algorithm
	}
	if cfg.notExportable {
		body["isExportable"] = false
	}
	if cfg.deleteProtection {
		body["hasDeleteProtection"] = true
	}
	return body
}

func NewKey(tt *testing.T, p *fixture.Project, opts ...Option) Key {
	tt.Helper()
	cfg := resolve(opts)

	res, err := p.Tenant().Admin.API.CreateKmsKeyWithBodyWithResponse(tt.Context(), "application/json",
		JSON(tt, CreateBody(p, append(opts, WithName(cfg.name))...)))
	require.NoError(tt, err, "creating a KMS key")
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "creating KMS key %s: %s", cfg.name, apierr.Body(res.Body))
	return Decode[struct{ Key Key }](tt, res.Body).Key
}

// GetKey reads a key as the tenant administrator.
func GetKey(tt *testing.T, p *fixture.Project, keyID uuid.UUID) Key {
	tt.Helper()

	res, err := p.Tenant().Admin.API.GetKmsKeyByIdWithResponse(tt.Context(), keyID)
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "reading KMS key %s: %s", keyID, apierr.Body(res.Body))
	return Decode[struct{ Key Key }](tt, res.Body).Key
}

// Encrypt returns the base64 ciphertext of plaintext.
func Encrypt(tt *testing.T, p *fixture.Project, keyID uuid.UUID, plaintext []byte) string {
	tt.Helper()

	res, err := p.Tenant().Admin.API.EncryptWithKmsKeyWithBodyWithResponse(tt.Context(), keyID, "application/json",
		JSON(tt, map[string]any{"plaintext": base64.StdEncoding.EncodeToString(plaintext)}))
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "encrypting with %s: %s", keyID, apierr.Body(res.Body))
	return Decode[struct{ Ciphertext string }](tt, res.Body).Ciphertext
}

// DecryptResponse sends a decrypt request and returns the raw response, for tests whose claim is the refusal.
func DecryptResponse(tt *testing.T, client *api.ClientWithResponses, keyID uuid.UUID, ciphertext string) *api.DecryptWithKmsKeyResponse {
	tt.Helper()

	res, err := client.DecryptWithKmsKeyWithBodyWithResponse(tt.Context(), keyID, "application/json",
		JSON(tt, map[string]any{"ciphertext": ciphertext}))
	require.NoError(tt, err)
	return res
}

func Decrypt(tt *testing.T, p *fixture.Project, keyID uuid.UUID, ciphertext string) []byte {
	tt.Helper()

	res := DecryptResponse(tt, p.Tenant().Admin.API, keyID, ciphertext)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "decrypting with %s: %s", keyID, apierr.Body(res.Body))
	plaintext, err := base64.StdEncoding.DecodeString(Decode[struct{ Plaintext string }](tt, res.Body).Plaintext)
	require.NoError(tt, err)
	return plaintext
}

// ExportPrivateKey returns the key material Infisical exports: raw bytes for symmetric and MAC keys,
// a PKCS8 PEM for classical asymmetric keys, and PKCS8 DER for ML-DSA.
func ExportPrivateKey(tt *testing.T, p *fixture.Project, keyID uuid.UUID) []byte {
	tt.Helper()

	res, err := p.Tenant().Admin.API.GetKmsKeyPrivateKeyWithResponse(tt.Context(), keyID)
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "exporting %s: %s", keyID, apierr.Body(res.Body))
	material, err := base64.StdEncoding.DecodeString(Decode[struct{ PrivateKey string }](tt, res.Body).PrivateKey)
	require.NoError(tt, err)
	return material
}

// JSON encodes a request body. The KMS bodies are sent as JSON rather than generated structs because several
// carry enums and unions the generated types do not round-trip; see docs/client.md.
func JSON(tt *testing.T, v any) *bytes.Reader {
	tt.Helper()
	raw, err := json.Marshal(v)
	require.NoError(tt, err)
	return bytes.NewReader(raw)
}

// Decode reads a response body into T.
func Decode[T any](tt *testing.T, body []byte) T {
	tt.Helper()
	var v T
	require.NoErrorf(tt, json.Unmarshal(body, &v), "decoding %s", apierr.Body(body))
	return v
}
