package pki

import (
	"testing"

	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Policy is a certificate policy: what a certificate a profile issues may contain.
type Policy struct{ ID uuid.UUID }

type PolicyOption func(map[string]any)

// WithAllowedNames narrows the common names and DNS SANs a certificate may carry.
func WithAllowedNames(commonNames, dnsNames []string) PolicyOption {
	return func(b map[string]any) {
		b["subject"] = []any{map[string]any{"type": "common_name", "allowed": commonNames}}
		b["sans"] = []any{map[string]any{"type": "dns_name", "allowed": dnsNames}}
	}
}

// WithAlgorithms narrows the CSR signature and key algorithms, in the policy's own
// spelling (SHA256-RSA, RSA-2048, ECDSA-P256).
func WithAlgorithms(signature, keyAlgorithm []string) PolicyOption {
	return func(b map[string]any) {
		b["algorithms"] = map[string]any{"signature": signature, "keyAlgorithm": keyAlgorithm}
	}
}

// NewPolicy creates a policy that allows any name, every usage and algorithm, and up
// to a year of validity, unless narrowed by options.
func NewPolicy(tt *testing.T, p *Project, opts ...PolicyOption) Policy {
	tt.Helper()
	body := map[string]any{
		"projectId": p.ID,
		"name":      "policy-" + id.Short(),
		"subject":   []any{map[string]any{"type": "common_name", "allowed": []string{"*"}}},
		"sans":      []any{map[string]any{"type": "dns_name", "allowed": []string{"*"}}},
		"keyUsages": map[string]any{"required": []string{}, "allowed": []string{
			"digital_signature", "non_repudiation", "key_encipherment", "data_encipherment",
			"key_agreement", "key_cert_sign", "crl_sign", "encipher_only", "decipher_only",
		}},
		"extendedKeyUsages": map[string]any{"required": []string{}, "allowed": []string{
			"client_auth", "server_auth", "code_signing", "email_protection", "ocsp_signing", "time_stamping",
		}},
		"algorithms": map[string]any{
			"signature":    []string{"SHA256-RSA", "SHA384-RSA", "SHA512-RSA", "SHA256-ECDSA", "SHA384-ECDSA", "SHA512-ECDSA"},
			"keyAlgorithm": []string{"RSA-2048", "RSA-3072", "RSA-4096", "ECDSA-P256", "ECDSA-P384", "ECDSA-P521"},
		},
		"validity": map[string]any{"max": "365d"},
	}
	for _, o := range opts {
		o(body)
	}
	res, err := p.tn.Admin.API.CreateCertificatePolicyWithBodyWithResponse(tt.Context(), "application/json", jsonBody(tt, body))
	require.NoError(tt, err, "creating a certificate policy")
	require.NotNilf(tt, res.JSON200, "creating a certificate policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	var out struct {
		CertificatePolicy struct {
			ID uuid.UUID `json:"id"`
		} `json:"certificatePolicy"`
	}
	decode(tt, res.Body, &out)
	return Policy{ID: out.CertificatePolicy.ID}
}
