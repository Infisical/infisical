package pki

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// CA is a certificate authority a profile issues from.
type CA struct{ ID uuid.UUID }

// NewInternalCA creates an active root CA on an RSA-2048 key.
func NewInternalCA(tt *testing.T, p *Project) CA {
	tt.Helper()
	res, err := p.tn.Admin.API.CreateInternalCertificateAuthorityV1WithBodyWithResponse(tt.Context(), "application/json", jsonBody(tt, map[string]any{
		"projectId": p.ID,
		"name":      "ca-" + id.Short(),
		"status":    "active",
		"configuration": map[string]any{
			"type":          "root",
			"organization":  "Infisical Harness",
			"ou":            "",
			"country":       "",
			"province":      "",
			"locality":      "",
			"commonName":    "",
			"notAfter":      "2035-11-07",
			"maxPathLength": -1,
			"keyAlgorithm":  "RSA_2048",
		},
	}))
	require.NoError(tt, err, "creating an internal CA")
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "creating an internal CA: %s", apierr.Body(res.Body))
	var out struct {
		ID uuid.UUID `json:"id"`
	}
	decode(tt, res.Body, &out)
	return CA{ID: out.ID}
}

// NewAcmeCA creates a CA that orders from an upstream ACME directory, answering its
// DNS-01 challenges in a zone of the DNS provider the connection reaches. provider is
// the dnsProviderConfig name, such as "cloudflare" or "dns-made-easy".
func NewAcmeCA(tt *testing.T, p *Project, dns *fixture.AppConnection, provider, zoneID, directoryURL string) CA {
	tt.Helper()
	res, err := p.tn.Admin.API.CreateAcmeCertificateAuthorityV1WithBodyWithResponse(tt.Context(), "application/json", jsonBody(tt, map[string]any{
		"projectId": p.ID,
		"name":      "acme-ca-" + id.Short(),
		"status":    "active",
		"configuration": map[string]any{
			"dnsAppConnectionId": dns.ID,
			"dnsProviderConfig":  map[string]any{"provider": provider, "hostedZoneId": zoneID},
			"directoryUrl":       directoryURL,
			"accountEmail":       "pki@harness.test",
		},
	}))
	require.NoError(tt, err, "creating an ACME CA")
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "creating an ACME CA: %s", apierr.Body(res.Body))
	var out struct {
		ID uuid.UUID `json:"id"`
	}
	decode(tt, res.Body, &out)
	return CA{ID: out.ID}
}
