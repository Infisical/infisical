package pki

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// EAB is the external account binding an ACME client registers with.
type EAB struct {
	KID    string
	Secret string
}

type AcmeOption func(map[string]any)

// SkipDNSOwnershipVerification issues without challenges.
func SkipDNSOwnershipVerification() AcmeOption {
	return func(b map[string]any) { b["skipDnsOwnershipVerification"] = true }
}

// EnableACME turns on ACME enrollment for a profile of the application and returns
// its EAB credentials.
func EnableACME(tt *testing.T, app Application, profile Profile, opts ...AcmeOption) EAB {
	tt.Helper()
	body := map[string]any{}
	for _, o := range opts {
		o(body)
	}
	api := app.project.tn.Admin.API
	res, err := api.SetPkiApplicationAcmeEnrollmentWithBodyWithResponse(tt.Context(), app.ID, profile.ID, "application/json", jsonBody(tt, body))
	require.NoError(tt, err, "enabling ACME enrollment")
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "enabling ACME enrollment: %s", apierr.Body(res.Body))

	reveal, err := api.RevealPkiApplicationAcmeEabSecretWithResponse(tt.Context(), app.ID, profile.ID)
	require.NoError(tt, err, "revealing the EAB secret")
	require.Equalf(tt, http.StatusOK, reveal.StatusCode(), "revealing the EAB secret: %s", apierr.Body(reveal.Body))
	var out struct {
		EabKid    string `json:"eabKid"`
		EabSecret string `json:"eabSecret"`
	}
	decode(tt, reveal.Body, &out)
	return EAB{KID: out.EabKid, Secret: out.EabSecret}
}

type ScepOption func(map[string]any)

// WithoutCACert leaves the CA certificate out of GetCACert, so it holds only the RA.
func WithoutCACert() ScepOption {
	return func(b map[string]any) { b["includeCaCertInResponse"] = false }
}

// WithoutRenewal refuses a renewal signed by a previously issued certificate.
func WithoutRenewal() ScepOption {
	return func(b map[string]any) { b["allowCertBasedRenewal"] = false }
}

// EnableSCEP turns on SCEP enrollment for a profile of the application with a static
// challenge password.
func EnableSCEP(tt *testing.T, app Application, profile Profile, password string, opts ...ScepOption) {
	tt.Helper()
	body := map[string]any{
		"challengeType":           "static",
		"challengePassword":       password,
		"includeCaCertInResponse": true,
		"allowCertBasedRenewal":   true,
	}
	for _, o := range opts {
		o(body)
	}
	res, err := app.project.tn.Admin.API.SetPkiApplicationScepEnrollmentWithBodyWithResponse(tt.Context(), app.ID, profile.ID, "application/json", jsonBody(tt, body))
	require.NoError(tt, err, "enabling SCEP enrollment")
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "enabling SCEP enrollment: %s", apierr.Body(res.Body))
}
