package user_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func TestEmailChange(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should change the email after both codes, revoke sessions, and log in with the new address", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		next := tn.Email("renamed-" + id.Short())
		confirmed := confirmCurrentEmail(t, tn, alice, next)
		require.Equalf(t, http.StatusOK, confirmed.StatusCode(), "confirming: %s", apierr.Body(confirmed.Body))
		newCode := code(t, tn.Mail(t).Expect(t, next, smtp.Subject("Infisical email change verification")))

		// Action
		res, err := alice.API.UpdateUserEmailWithResponse(t.Context(), api.UpdateUserEmailJSONRequestBody{
			NewEmail: openapi_types.Email(next),
			OtpCode:  newCode,
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "changing the email: %s", apierr.Body(res.Body))
		require.Equal(t, strings.ToLower(next), *res.JSON200.User.Email)
		requireSessionGone(t, alice.API)
		renamed, _ := login(t, tn, next, harness.UserPassword)
		require.Equal(t, http.StatusOK, renamed.StatusCode())
		old, _ := login(t, tn, alice.Email, harness.UserPassword)
		require.Equal(t, http.StatusBadRequest, old.StatusCode())
	})

	t.Run("should refuse a taken address and mail its owner rather than revealing it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		bob := tn.NewUser(t)

		// Action
		res := confirmCurrentEmail(t, tn, alice, bob.Email)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "confirming: %s", apierr.Body(res.Body))
		require.True(t, res.JSON200.Success)
		require.Equal(t, strings.ToLower(bob.Email), res.JSON200.NewEmail)
		tn.Mail(t).Expect(t, bob.Email, smtp.Subject("Email Change Request for Your Infisical Account"))
		tn.Mail(t).ExpectNoEvent[smtp.MessageReceived](t, func(e smtp.MessageReceived) bool {
			return e.Recipient == strings.ToLower(bob.Email) && strings.Contains(e.Message.Subject, "email change verification")
		})
		me, err := alice.API.GetCurrentUserWithResponse(t.Context())
		require.NoError(t, err)
		require.Equal(t, strings.ToLower(alice.Email), *me.JSON200.User.Email)
	})
}

// confirmCurrentEmail asks to move p to next and proves control of the current address
// with the code mailed there.
func confirmCurrentEmail(t *testing.T, tn *harness.Tenant, p *harness.Principal, next string) *api.VerifyCurrentEmailOtpResponse {
	t.Helper()
	requested, err := p.API.RequestEmailChangeOtpWithResponse(t.Context(), api.RequestEmailChangeOtpJSONRequestBody{NewEmail: openapi_types.Email(next)})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, requested.StatusCode(), "requesting the change: %s", apierr.Body(requested.Body))
	current := code(t, tn.Mail(t).Expect(t, p.Email, smtp.Subject("Confirm your Infisical email change")))
	res, err := p.API.VerifyCurrentEmailOtpWithResponse(t.Context(), api.VerifyCurrentEmailOtpJSONRequestBody{OtpCode: current})
	require.NoError(t, err)
	return res
}
