package pki

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Policy is a certificate policy: what a certificate a profile issues may contain.
type Policy struct{ ID uuid.UUID }

// AllowAll is a policy body that allows any name, every key usage and extended key
// usage, every algorithm, and up to a year of validity. Narrow it before NewPolicy to
// test a restriction.
func AllowAll(tt *testing.T) api.CreateCertificatePolicyJSONRequestBody {
	tt.Helper()
	var commonName api.CreateCertificatePolicyJSONBody_Subject_Item
	require.NoError(tt, commonName.FromCreateCertificatePolicyJSONBodySubject0(api.CreateCertificatePolicyJSONBodySubject0{
		Type:    api.CreateCertificatePolicyJSONBodySubject0TypeCommonName,
		Allowed: &[]string{"*"},
	}))
	body := api.CreateCertificatePolicyJSONRequestBody{
		Subject: &[]api.CreateCertificatePolicyJSONBody_Subject_Item{commonName},
		Validity: &struct {
			Max *string `json:"max,omitempty"`
		}{Max: new("365d")},
	}
	body.Sans = &[]struct {
		Allowed  *[]string                                   `json:"allowed,omitempty"`
		Denied   *[]string                                   `json:"denied,omitempty"`
		Required *[]string                                   `json:"required,omitempty"`
		Type     api.CreateCertificatePolicyJSONBodySansType `json:"type"`
	}{{Type: api.CreateCertificatePolicyJSONBodySansTypeDnsName, Allowed: &[]string{"*"}}}
	body.KeyUsages = &struct {
		Allowed  *[]api.CreateCertificatePolicyJSONBodyKeyUsagesAllowed  `json:"allowed,omitempty"`
		Denied   *[]api.CreateCertificatePolicyJSONBodyKeyUsagesDenied   `json:"denied,omitempty"`
		Required *[]api.CreateCertificatePolicyJSONBodyKeyUsagesRequired `json:"required,omitempty"`
	}{Allowed: &[]api.CreateCertificatePolicyJSONBodyKeyUsagesAllowed{
		api.CreateCertificatePolicyJSONBodyKeyUsagesAllowedDigitalSignature,
		api.CreateCertificatePolicyJSONBodyKeyUsagesAllowedNonRepudiation,
		api.CreateCertificatePolicyJSONBodyKeyUsagesAllowedKeyEncipherment,
		api.CreateCertificatePolicyJSONBodyKeyUsagesAllowedDataEncipherment,
		api.CreateCertificatePolicyJSONBodyKeyUsagesAllowedKeyAgreement,
		api.CreateCertificatePolicyJSONBodyKeyUsagesAllowedKeyCertSign,
		api.CreateCertificatePolicyJSONBodyKeyUsagesAllowedCrlSign,
		api.CreateCertificatePolicyJSONBodyKeyUsagesAllowedEncipherOnly,
		api.CreateCertificatePolicyJSONBodyKeyUsagesAllowedDecipherOnly,
	}}
	body.ExtendedKeyUsages = &struct {
		Allowed  *[]api.CreateCertificatePolicyJSONBodyExtendedKeyUsagesAllowed  `json:"allowed,omitempty"`
		Denied   *[]api.CreateCertificatePolicyJSONBodyExtendedKeyUsagesDenied   `json:"denied,omitempty"`
		Required *[]api.CreateCertificatePolicyJSONBodyExtendedKeyUsagesRequired `json:"required,omitempty"`
	}{Allowed: &[]api.CreateCertificatePolicyJSONBodyExtendedKeyUsagesAllowed{
		api.CreateCertificatePolicyJSONBodyExtendedKeyUsagesAllowedClientAuth,
		api.CreateCertificatePolicyJSONBodyExtendedKeyUsagesAllowedServerAuth,
		api.CreateCertificatePolicyJSONBodyExtendedKeyUsagesAllowedCodeSigning,
		api.CreateCertificatePolicyJSONBodyExtendedKeyUsagesAllowedEmailProtection,
		api.CreateCertificatePolicyJSONBodyExtendedKeyUsagesAllowedOcspSigning,
		api.CreateCertificatePolicyJSONBodyExtendedKeyUsagesAllowedTimeStamping,
	}}
	body.Algorithms = &struct {
		KeyAlgorithm *[]string `json:"keyAlgorithm,omitempty"`
		Signature    *[]string `json:"signature,omitempty"`
	}{
		Signature:    &[]string{"SHA256-RSA", "SHA384-RSA", "SHA512-RSA", "SHA256-ECDSA", "SHA384-ECDSA", "SHA512-ECDSA"},
		KeyAlgorithm: &[]string{"RSA-2048", "RSA-3072", "RSA-4096", "ECDSA-P256", "ECDSA-P384", "ECDSA-P521"},
	}
	return body
}

// NewPolicy creates a policy from a body, usually AllowAll's, possibly narrowed.
func NewPolicy(tt *testing.T, p *Project, body api.CreateCertificatePolicyJSONRequestBody) Policy {
	tt.Helper()
	body.ProjectId = new(p.ID.String())
	body.Name = "policy-" + id.Short()
	res, err := p.tn.Admin.API.CreateCertificatePolicyWithResponse(tt.Context(), body)
	require.NoError(tt, err, "creating a certificate policy")
	require.NotNilf(tt, res.JSON200, "creating a certificate policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return Policy{ID: res.JSON200.CertificatePolicy.Id}
}
