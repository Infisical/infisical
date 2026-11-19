package pki

import (
	"bytes"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Certificate is one an application issued, as the issue response returns it.
type Certificate struct {
	ID           uuid.UUID
	SerialNumber string
	Certificate  string
	Chain        string
	PrivateKey   string
}

type issueConfig struct{ as *harness.Principal }

type IssueOption func(*issueConfig)

// As issues as a principal other than the tenant admin, such as an application
// operator.
func As(p *harness.Principal) IssueOption { return func(c *issueConfig) { c.as = p } }

// ServerCertificate is a request for a 30-day server certificate for one DNS name,
// used as its common name too, on a server-generated RSA-2048 key signed with SHA-256.
func ServerCertificate(name string) api.CreateCertificateJSONRequestBody {
	body := api.CreateCertificateJSONRequestBody{}
	body.Attributes = &struct {
		AltNames *[]struct {
			Type  api.CreateCertificateJSONBodyAttributesAltNamesType `json:"type"`
			Value string                                              `json:"value"`
		} `json:"altNames,omitempty"`
		BasicConstraints *struct {
			IsCA       bool `json:"isCA"`
			PathLength *int `json:"pathLength,omitempty"`
		} `json:"basicConstraints,omitempty"`
		CommonName       *string `json:"commonName,omitempty"`
		Country          *string `json:"country,omitempty"`
		CustomExtensions *[]struct {
			Critical *bool   `json:"critical,omitempty"`
			Oid      string  `json:"oid"`
			Value    *string `json:"value,omitempty"`
		} `json:"customExtensions,omitempty"`
		DomainComponents   *[]string                                                   `json:"domainComponents,omitempty"`
		ExtendedKeyUsages  *[]api.CreateCertificateJSONBodyAttributesExtendedKeyUsages `json:"extendedKeyUsages,omitempty"`
		KeyAlgorithm       *api.CreateCertificateJSONBodyAttributesKeyAlgorithm        `json:"keyAlgorithm,omitempty"`
		KeyUsages          *[]api.CreateCertificateJSONBodyAttributesKeyUsages         `json:"keyUsages,omitempty"`
		Locality           *string                                                     `json:"locality,omitempty"`
		NotAfter           *string                                                     `json:"notAfter,omitempty"`
		NotBefore          *string                                                     `json:"notBefore,omitempty"`
		Organization       *string                                                     `json:"organization,omitempty"`
		OrganizationalUnit *string                                                     `json:"organizationalUnit,omitempty"`
		SignatureAlgorithm *api.CreateCertificateJSONBodyAttributesSignatureAlgorithm  `json:"signatureAlgorithm,omitempty"`
		State              *string                                                     `json:"state,omitempty"`
		Ttl                *string                                                     `json:"ttl,omitempty"`
	}{
		CommonName: new(name),
		AltNames: &[]struct {
			Type  api.CreateCertificateJSONBodyAttributesAltNamesType `json:"type"`
			Value string                                              `json:"value"`
		}{{Type: api.CreateCertificateJSONBodyAttributesAltNamesTypeDnsName, Value: name}},
		KeyAlgorithm:       new(api.CreateCertificateJSONBodyAttributesKeyAlgorithmRSA2048),
		SignatureAlgorithm: new(api.CreateCertificateJSONBodyAttributesSignatureAlgorithmRSASHA256),
		KeyUsages:          &[]api.CreateCertificateJSONBodyAttributesKeyUsages{api.CreateCertificateJSONBodyAttributesKeyUsagesDigitalSignature, api.CreateCertificateJSONBodyAttributesKeyUsagesKeyEncipherment},
		ExtendedKeyUsages:  &[]api.CreateCertificateJSONBodyAttributesExtendedKeyUsages{api.CreateCertificateJSONBodyAttributesExtendedKeyUsagesServerAuth},
		Ttl:                new("30d"),
	}
	return body
}

// Request asks the application's profile for a certificate as a principal and returns
// the response, whatever its status.
func Request(tt *testing.T, as *harness.Principal, app Application, profile Profile, body api.CreateCertificateJSONRequestBody) *api.CreateCertificateResponse {
	tt.Helper()
	body.ApplicationId = &app.ID
	body.ProfileId = profile.ID
	res, err := as.API.CreateCertificateWithResponse(tt.Context(), body)
	require.NoError(tt, err, "requesting a certificate")
	return res
}

// Renew renews a certificate as a principal with a JSON body, such as {} or one naming
// a CSR, and returns the response, whatever its status. The body is a union the
// generated client cannot serialise.
func Renew(tt *testing.T, as *harness.Principal, certID uuid.UUID, body map[string]any) *api.RenewCertificateResponse {
	tt.Helper()
	raw, err := json.Marshal(body)
	require.NoError(tt, err)
	res, err := as.API.RenewCertificateWithBodyWithResponse(tt.Context(), certID, "application/json", bytes.NewReader(raw))
	require.NoError(tt, err, "renewing a certificate")
	return res
}

// Issue issues a certificate through the application's profile and requires it to be
// issued straight away, as an internal CA does.
func Issue(tt *testing.T, app Application, profile Profile, body api.CreateCertificateJSONRequestBody, opts ...IssueOption) Certificate {
	tt.Helper()
	cfg := issueConfig{as: app.project.tn.Admin}
	for _, o := range opts {
		o(&cfg)
	}
	res := Request(tt, cfg.as, app, profile, body)
	require.NotNilf(tt, res.JSON200, "issuing a certificate returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	got := res.JSON200.Certificate
	require.NotNilf(tt, got, "issuing a certificate returned no certificate: %s", apierr.Body(res.Body))
	certID, err := uuid.Parse(got.CertificateId)
	require.NoError(tt, err)
	out := Certificate{ID: certID, SerialNumber: got.SerialNumber, Certificate: got.Certificate, Chain: got.CertificateChain}
	if got.PrivateKey != nil {
		out.PrivateKey = *got.PrivateKey
	}
	return out
}

// ParseLeaf parses the first certificate of a PEM bundle.
func ParseLeaf(tt *testing.T, bundle string) *x509.Certificate {
	tt.Helper()
	block, _ := pem.Decode([]byte(bundle))
	require.NotNil(tt, block, "not PEM: %q", bundle)
	cert, err := x509.ParseCertificate(block.Bytes)
	require.NoError(tt, err)
	return cert
}

// Revoke revokes a certificate as a principal allowed to, such as the application's
// operator, and returns when it was revoked.
func Revoke(tt *testing.T, as *harness.Principal, cert Certificate, reason api.RevokeCertificateJSONBodyRevocationReason) time.Time {
	tt.Helper()
	res := RevokeRequest(tt, as, cert.ID, reason)
	require.NotNilf(tt, res.JSON200, "revoking a certificate returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.RevokedAt
}

// RevokeRequest asks to revoke a certificate as `as` and returns the response, whatever it is.
func RevokeRequest(tt *testing.T, as *harness.Principal, certID uuid.UUID, reason api.RevokeCertificateJSONBodyRevocationReason) *api.RevokeCertificateResponse {
	tt.Helper()
	res, err := as.API.RevokeCertificateWithResponse(tt.Context(), certID.String(), api.RevokeCertificateJSONRequestBody{RevocationReason: reason})
	require.NoError(tt, err, "revoking a certificate")
	return res
}

// ReadCertificate reads a certificate as `as` and requires the read to succeed.
func ReadCertificate(tt *testing.T, as *harness.Principal, id uuid.UUID) *api.GetCertificateResponse {
	tt.Helper()
	res, err := as.API.GetCertificateWithResponse(tt.Context(), id, nil)
	require.NoError(tt, err, "reading the certificate")
	require.NotNilf(tt, res.JSON200, "reading the certificate returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res
}
