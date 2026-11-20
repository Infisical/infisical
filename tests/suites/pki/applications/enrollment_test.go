package applications_test

import (
	"fmt"
	"net/http"
	"net/url"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func readEnrollment(t *testing.T, as *harness.Principal, g *pki.Graph) *api.GetPkiApplicationEnrollmentResponse {
	t.Helper()
	res, err := as.API.GetPkiApplicationEnrollmentWithResponse(t.Context(), g.App.ID, g.Profile.ID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the enrollment returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res
}

// requirePath requires the URL to point at the path, whatever host the server is configured with.
func requirePath(t *testing.T, want, raw string) {
	t.Helper()
	u, err := url.Parse(raw)
	require.NoError(t, err)
	require.Equal(t, want, u.Path)
}

func TestApplicationEnrollment_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should report API enrollment with its renewal settings and every other method off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		pki.EnableAPI(t, g.App, g.Profile, api.SetPkiApplicationApiEnrollmentJSONRequestBody{AutoRenew: new(true), RenewBeforeDays: new(10)})

		// Action
		got := readEnrollment(t, tn.Admin, g).JSON200

		// Assert
		require.NotNil(t, got.Api)
		require.True(t, got.Api.AutoRenew)
		require.Equal(t, new(10), got.Api.RenewBeforeDays)
		require.False(t, got.AcmeConfigured)
		require.False(t, got.EstConfigured)
		require.False(t, got.ScepConfigured)
	})

	t.Run("should report ACME, EST and SCEP on with endpoints for the application and profile", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		pki.EnableACME(t, g.App, g.Profile, api.SetPkiApplicationAcmeEnrollmentJSONRequestBody{})
		est, err := tn.Admin.API.SetPkiApplicationEstEnrollmentWithResponse(t.Context(), g.App.ID, g.Profile.ID, api.SetPkiApplicationEstEnrollmentJSONRequestBody{
			Passphrase:                   "est-passphrase-" + id.Short(),
			DisableBootstrapCaValidation: new(true),
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, est.StatusCode(), "enabling EST: %s", apierr.Body(est.Body))
		pki.EnableSCEP(t, g.App, g.Profile, api.SetPkiApplicationScepEnrollmentJSONRequestBody{
			ChallengeType:     new(api.SetPkiApplicationScepEnrollmentJSONBodyChallengeTypeStatic),
			ChallengePassword: new("scep-password-" + id.Short()),
		})

		// Action
		got := readEnrollment(t, tn.Admin, g).JSON200

		// Assert
		appProfile := fmt.Sprintf("applications/%s/profiles/%s", g.App.ID, g.Profile.ID)
		require.True(t, got.AcmeConfigured)
		require.True(t, got.EstConfigured)
		require.True(t, got.ScepConfigured)
		require.NotNil(t, got.Acme)
		requirePath(t, "/api/v1/cert-manager/acme/"+appProfile+"/directory", got.Acme.DirectoryUrl)
		require.NotNil(t, got.Est)
		requirePath(t, "/.well-known/est/"+appProfile, got.Est.EstEndpointUrl)
		require.NotNil(t, got.Scep)
		requirePath(t, "/scep/"+appProfile+"/pkiclient.exe", got.Scep.ScepEndpointUrl)
	})

	t.Run("should show an auditor the ACME settings but not the EAB secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		eab := pki.EnableACME(t, g.App, g.Profile, api.SetPkiApplicationAcmeEnrollmentJSONRequestBody{})
		auditor := member(t, tn, g, "auditor")

		// Action
		read := readEnrollment(t, auditor, g)
		reveal, err := auditor.API.RevealPkiApplicationAcmeEabSecretWithResponse(t.Context(), g.App.ID, g.Profile.ID)
		require.NoError(t, err)

		// Assert
		require.True(t, read.JSON200.AcmeConfigured)
		require.NotContains(t, string(read.Body), eab.Secret)
		require.Equalf(t, http.StatusForbidden, reveal.StatusCode(), "revealing answered: %s", apierr.Body(reveal.Body))
		require.Equal(t, "You are not allowed to reveal-acme-eab-secret on certificate-application-enrollment", apierr.Message(reveal.Body))
	})
}

func TestApplicationEnrollment_ClearApi(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse issuance through the API and report it off once API enrollment is cleared", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)

		// Action
		clear, err := tn.Admin.API.ClearPkiApplicationApiEnrollmentWithResponse(t.Context(), g.App.ID, g.Profile.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, clear.StatusCode(), "clearing API enrollment: %s", apierr.Body(clear.Body))

		// Assert
		res := pki.Request(t, g.Operator, g.App, g.Profile, pki.ServerCertificate(id.Short()+".app.test"))
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "API enrollment is not configured for this profile on the Application.", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, g.Project, g.Profile))
		require.Nil(t, readEnrollment(t, tn.Admin, g).JSON200.Api)
	})
}
