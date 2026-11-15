package user_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

const signupCodeSubject = "confirmation code"

func TestSignup_Email(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create an account through the mailed code and refuse a wrong code", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		email := tn.Email("s-" + id.Short())
		b := device(t, tn, newIP())
		require.Equal(t, http.StatusOK, beginSignup(t, b, email).StatusCode())
		mailed := code(t, tn.Mail(t).Expect(t, email, smtp.Subject(signupCodeSubject)))

		// Action
		wrong := verifySignup(t, b, email, otherCode(mailed))
		right := verifySignup(t, b, email, mailed)

		// Assert
		require.Equal(t, http.StatusUnauthorized, wrong.StatusCode())
		require.Equal(t, "Invalid token", apierr.Message(wrong.Body))
		require.Equalf(t, http.StatusOK, right.StatusCode(), "verifying: %s", apierr.Body(right.Body))
		completed := completeEmailSignup(t, tn, right.JSON200.Token, email, harness.UserPassword)
		require.Equalf(t, http.StatusOK, completed.StatusCode(), "completing: %s", apierr.Body(completed.Body))
		res, _ := login(t, tn, email, harness.UserPassword)
		require.Equal(t, http.StatusOK, res.StatusCode())
	})

	t.Run("should answer the same for an existing account and mail it a notice instead of a code", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		fresh := tn.Email("s-" + id.Short())
		b := device(t, tn, newIP())

		// Action
		existing := beginSignup(t, b, alice.Email)
		unknown := beginSignup(t, b, fresh)

		// Assert
		require.Equal(t, http.StatusOK, existing.StatusCode())
		require.Equal(t, http.StatusOK, unknown.StatusCode())
		require.Equal(t, "Sent an email verification code to "+alice.Email, existing.JSON200.Message)
		require.Equal(t, "Sent an email verification code to "+fresh, unknown.JSON200.Message)
		require.Equal(t, unknown.JSON200.CooldownSeconds, existing.JSON200.CooldownSeconds)
		tn.Mail(t).Expect(t, alice.Email, smtp.Subject("Sign-up Request for Your Infisical Account"))
		tn.Mail(t).ExpectNoEvent[smtp.MessageReceived](t, func(e smtp.MessageReceived) bool {
			return e.Recipient == strings.ToLower(alice.Email) && strings.Contains(e.Message.Subject, signupCodeSubject)
		})
	})

	t.Run("should refuse a second request within the cooldown", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		email := tn.Email("s-" + id.Short())
		b := device(t, tn, newIP())
		require.Equal(t, http.StatusOK, beginSignup(t, b, email).StatusCode())
		tn.Mail(t).Expect(t, email, smtp.Subject(signupCodeSubject))

		// Action
		res := beginSignup(t, b, email)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Please wait before requesting another email", apierr.Message(res.Body))
		tn.Mail(t).ExpectNoEvent[smtp.MessageReceived](t, func(e smtp.MessageReceived) bool {
			return e.Recipient == strings.ToLower(email)
		})
	})

	t.Run("should refuse a password that breaks the policy and create no account", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		email := tn.Email("s-" + id.Short())
		b := device(t, tn, newIP())
		require.Equal(t, http.StatusOK, beginSignup(t, b, email).StatusCode())
		verified := verifySignup(t, b, email, code(t, tn.Mail(t).Expect(t, email, smtp.Subject(signupCodeSubject))))
		require.Equalf(t, http.StatusOK, verified.StatusCode(), "verifying: %s", apierr.Body(verified.Body))

		// Action
		res := completeEmailSignup(t, tn, verified.JSON200.Token, email, "short")

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
		weak, _ := login(t, tn, email, "short")
		require.Equal(t, http.StatusBadRequest, weak.StatusCode())
		strong, _ := login(t, tn, email, harness.UserPassword)
		require.Equal(t, http.StatusBadRequest, strong.StatusCode())
	})

	t.Run("should refuse signup for a domain owned by an SSO-enforced org", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sso.NewSAML(t, tn, sso.Okta).Enforce(t)
		email := tn.Email("s-" + id.Short())

		// Action
		res := beginSignup(t, device(t, tn, newIP()), email)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, apierr.Message(res.Body), "Your organization requires single sign-on")
		tn.Mail(t).ExpectNoEvent[smtp.MessageReceived](t, func(e smtp.MessageReceived) bool {
			return e.Recipient == strings.ToLower(email)
		})
	})
}

func beginSignup(t *testing.T, c *api.ClientWithResponses, email string) *api.BeginEmailSignupV3Response {
	t.Helper()
	res, err := c.BeginEmailSignupV3WithResponse(t.Context(), api.BeginEmailSignupV3JSONRequestBody{Email: openapi_types.Email(email)})
	require.NoError(t, err)
	return res
}

func verifySignup(t *testing.T, c *api.ClientWithResponses, email, code string) *api.VerifyEmailSignupV3Response {
	t.Helper()
	res, err := c.VerifyEmailSignupV3WithResponse(t.Context(), api.VerifyEmailSignupV3JSONRequestBody{
		Email: openapi_types.Email(email),
		Code:  code,
	})
	require.NoError(t, err)
	return res
}

func completeEmailSignup(t *testing.T, tn *harness.Tenant, signupToken, email, password string) *api.CompleteAccountSignupV3Response {
	t.Helper()
	var union api.CompleteAccountSignupV3JSONBody
	require.NoError(t, union.FromCompleteAccountSignupV3JSONBody0(api.CompleteAccountSignupV3JSONBody0{
		Type:      api.CompleteAccountSignupV3JSONBody0TypeEmail,
		Email:     email,
		FirstName: "ada",
		Password:  password,
	}))
	res, err := tn.Client(t, signupToken).CompleteAccountSignupV3WithBodyWithResponse(t.Context(), "application/json", postJSON(t, union))
	require.NoError(t, err)
	return res
}
