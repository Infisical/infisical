package sessionbinding_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/mail"
	"github.com/stretchr/testify/require"
)

// Any path that mints a new session from an old one has to keep the issuer. Drop it and
// the session passes every org's enforcement, so each case ends at an enforcing org.
func TestSessionBinding_Reissue(t *testing.T) {
	t.Parallel()

	t.Run("should keep refusing the session after it passes the issuing org's MFA challenge", func(t *testing.T) {
		t.Parallel()

		// Setup
		iss, other := setup(t, "member")
		other.Enforce(t)
		sso.EnforceMFA(t, iss.tn, api.None)
		challenge := iss.selectOrg(t, iss.login(t), iss.tn.OrgID)
		require.Equalf(t, http.StatusOK, challenge.StatusCode(), "selecting the issuing org: %s", apierr.Body(challenge.Body))
		require.True(t, challenge.JSON200.IsMfaEnabled, "the issuing org didn't ask for MFA")
		code, err := mail.Code(iss.tn.Mail(t).Expect(t, iss.email, smtp.Subject("Infisical MFA code")), 6)
		require.NoError(t, err)
		verified, err := iss.tn.Client(t, challenge.JSON200.Token).VerifyMfaWithResponse(t.Context(), api.VerifyMfaJSONRequestBody{MfaToken: code})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, verified.StatusCode(), "verifying MFA: %s", apierr.Body(verified.Body))

		// Action
		res := iss.selectOrg(t, verified.HTTPResponse, other.Tenant.OrgID)

		// Assert
		requireForeignSession(t, res.StatusCode(), res.Body)
	})

	t.Run("should refuse the session a first SSO login mints when it verifies the mailbox", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := sso.NewSAML(t, harness.From(t).NewTenant(t), sso.Okta)
		other := sso.NewSAML(t, harness.From(t).NewTenant(t), sso.Okta)
		alice := s.Person()
		join(t, other.Tenant.Admin.API, other.Tenant.OrgID, alice.Email, "member")
		other.Enforce(t)
		signup := s.CompleteSignup(t, s.SPLogin(t, alice), s.VerificationCode(t, alice.Email))
		require.Equalf(t, http.StatusOK, signup.StatusCode(), "completing SSO signup: %s", apierr.Body(signup.Body))

		// Action
		res, err := s.Tenant.Client(t, signup.JSON200.Token).SelectOrganizationV3WithResponse(t.Context(),
			api.SelectOrganizationV3JSONRequestBody{OrganizationId: other.Tenant.OrgID.String()})

		// Assert
		require.NoError(t, err)
		requireForeignSession(t, res.StatusCode(), res.Body)
	})

	t.Run("should keep refusing the session re-issued when the user deletes an org", func(t *testing.T) {
		t.Parallel()

		// Setup
		iss, other := setup(t, "member")
		other.Enforce(t)
		alice, selected := iss.session(t, iss.login(t), iss.tn.OrgID)
		created, err := alice.CreateOrganizationWithResponse(t.Context(), api.CreateOrganizationJSONRequestBody{Name: "throwaway-" + id.Short()})
		require.NoError(t, err)
		require.NotNilf(t, created.JSON200, "creating an org returned %d: %s", created.StatusCode(), apierr.Body(created.Body))
		throwawayID := created.JSON200.Organization.Id
		inThrowaway, _ := iss.session(t, selected, throwawayID)
		deleted, err := inThrowaway.DeleteOrganizationWithResponse(t.Context(), throwawayID.String())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, deleted.StatusCode(), "deleting the org: %s", apierr.Body(deleted.Body))

		// Action
		res := iss.selectOrg(t, deleted.HTTPResponse, other.Tenant.OrgID)

		// Assert
		requireForeignSession(t, res.StatusCode(), res.Body)
	})
}
