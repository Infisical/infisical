package pki

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// EAB is the external account binding an ACME client registers with.
type EAB struct {
	KID    string
	Secret string
}

// EnableACME turns on ACME enrollment for a profile of the application and returns
// its EAB credentials.
func EnableACME(tt *testing.T, app Application, profile Profile, body api.SetPkiApplicationAcmeEnrollmentJSONRequestBody) EAB {
	tt.Helper()
	res, err := app.project.tn.Admin.API.SetPkiApplicationAcmeEnrollmentWithResponse(tt.Context(), app.ID, profile.ID, body)
	require.NoError(tt, err, "enabling ACME enrollment")
	require.NotNilf(tt, res.JSON200, "enabling ACME enrollment returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return RevealEAB(tt, app, profile)
}

// RevealEAB returns the current EAB credentials of the application's ACME enrollment for the profile.
func RevealEAB(tt *testing.T, app Application, profile Profile) EAB {
	tt.Helper()
	reveal, err := app.project.tn.Admin.API.RevealPkiApplicationAcmeEabSecretWithResponse(tt.Context(), app.ID, profile.ID)
	require.NoError(tt, err, "revealing the EAB secret")
	require.NotNilf(tt, reveal.JSON200, "revealing the EAB secret returned %d: %s", reveal.StatusCode(), apierr.Body(reveal.Body))
	return EAB{KID: reveal.JSON200.EabKid, Secret: reveal.JSON200.EabSecret}
}

// EnableSCEP turns on SCEP enrollment for a profile of the application.
func EnableSCEP(tt *testing.T, app Application, profile Profile, body api.SetPkiApplicationScepEnrollmentJSONRequestBody) {
	tt.Helper()
	res, err := app.project.tn.Admin.API.SetPkiApplicationScepEnrollmentWithResponse(tt.Context(), app.ID, profile.ID, body)
	require.NoError(tt, err, "enabling SCEP enrollment")
	require.NotNilf(tt, res.JSON200, "enabling SCEP enrollment returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

// EnableAPI turns on API enrollment for a profile of the application.
func EnableAPI(tt *testing.T, app Application, profile Profile, body api.SetPkiApplicationApiEnrollmentJSONRequestBody) {
	tt.Helper()
	res, err := app.project.tn.Admin.API.SetPkiApplicationApiEnrollmentWithResponse(tt.Context(), app.ID, profile.ID, body)
	require.NoError(tt, err, "enabling API enrollment")
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "enabling API enrollment: %s", apierr.Body(res.Body))
}
