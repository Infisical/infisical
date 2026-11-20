package user_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/mail"
	"github.com/stretchr/testify/require"
)

const setupSubject = "Infisical Password Setup"

func TestPassword_Setup(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// oauthOnly is an invited member who signed up through Google, so has no password yet,
	// with a session selected into the organization: the setup route is org-scoped.
	oauthOnly := func(t *testing.T, tn *harness.Tenant) (fixture.OAuthPerson, session) {
		t.Helper()
		p := fixture.NewOAuthPerson(tn, true)
		invite(t, tn, p.Email)
		s := sessionFrom(t, tn, fixture.OAuthLogin(t, tn, fixture.OAuthGoogle, p))
		selected := selectOrg(t, tn, s, tn.OrgID.String())
		require.Equalf(t, http.StatusOK, selected.StatusCode(), "selecting the organization: %s", apierr.Body(selected.Body))
		return p, session{IP: s.IP, Token: selected.JSON200.Token, API: as(t, tn, selected.JSON200.Token, s.IP)}
	}

	t.Run("should set a first password through the mailed token, revoke sessions, and log in with it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p, s := oauthOnly(t, tn)
		sent, err := s.API.SendPasswordSetupEmailWithResponse(t.Context())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, sent.StatusCode(), "sending the setup mail: %s", apierr.Body(sent.Body))
		token, err := mail.Param(tn.Mail(t).Expect(t, p.Email, smtp.Subject(setupSubject)), "token")
		require.NoError(t, err)

		// Action
		res, err := s.API.SetupPasswordWithResponse(t.Context(), api.SetupPasswordJSONRequestBody{Password: newPassword, Token: token})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "setting the password: %s", apierr.Body(res.Body))
		requireSessionGone(t, s.API)
		loggedIn, _ := login(t, tn, p.Email, newPassword)
		require.Equal(t, http.StatusOK, loggedIn.StatusCode())
	})

	t.Run("should refuse a wrong setup token and set no password", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p, s := oauthOnly(t, tn)
		sent, err := s.API.SendPasswordSetupEmailWithResponse(t.Context())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, sent.StatusCode(), "sending the setup mail: %s", apierr.Body(sent.Body))
		tn.Mail(t).Expect(t, p.Email, smtp.Subject(setupSubject))

		// Action
		res, err := s.API.SetupPasswordWithResponse(t.Context(), api.SetupPasswordJSONRequestBody{Password: newPassword, Token: "0000000000"})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Equal(t, "Expired or invalid token. Please try again.", apierr.Message(res.Body))
		refused, _ := login(t, tn, p.Email, newPassword)
		require.NotEqual(t, http.StatusOK, refused.StatusCode())
	})
}
