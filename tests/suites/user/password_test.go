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
	"github.com/Infisical/infisical/tests/internal/mail"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

const (
	newPassword     = "ChangedHarnessPassword9#"
	recoverySubject = "Infisical account recovery"
)

func TestPassword_Change(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should change the password, revoke all sessions, and refuse the old password", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		phone := signIn(t, tn, alice.Email)

		// Action
		res, err := alice.API.ResetUserPasswordWithResponse(t.Context(), api.ResetUserPasswordJSONRequestBody{
			OldPassword: harness.UserPassword,
			NewPassword: newPassword,
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "changing the password: %s", apierr.Body(res.Body))
		requireSessionGone(t, alice.API)
		requireSessionGone(t, phone.API)
		old, _ := login(t, tn, alice.Email, harness.UserPassword)
		require.Equal(t, http.StatusBadRequest, old.StatusCode())
		changed, _ := login(t, tn, alice.Email, newPassword)
		require.Equal(t, http.StatusOK, changed.StatusCode())
	})

	t.Run("should refuse a wrong old password and keep the current one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)

		// Action
		res, err := alice.API.ResetUserPasswordWithResponse(t.Context(), api.ResetUserPasswordJSONRequestBody{
			OldPassword: "NotTheOldPassword7!x",
			NewPassword: newPassword,
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Incorrect current password.", apierr.Message(res.Body))
		require.Equal(t, http.StatusOK, meStatus(t, alice.API))
		current, _ := login(t, tn, alice.Email, harness.UserPassword)
		require.Equal(t, http.StatusOK, current.StatusCode())
	})
}

func TestAccountRecovery(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should answer the same for unknown and known emails, mailing only the known one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		nobody := tn.Email("nobody-" + id.Short())

		// Action
		unknown := sendRecovery(t, tn, nobody)
		known := sendRecovery(t, tn, alice.Email)

		// Assert
		require.Equal(t, http.StatusOK, unknown.StatusCode())
		require.Equal(t, http.StatusOK, known.StatusCode())
		require.Equal(t, unknown.JSON200.Message, known.JSON200.Message)
		tn.Mail(t).Expect(t, alice.Email, smtp.Subject(recoverySubject))
		tn.Mail(t).ExpectNoEvent[smtp.MessageReceived](t, func(e smtp.MessageReceived) bool {
			return e.Recipient == strings.ToLower(nobody)
		})
	})

	t.Run("should reset the password through the mailed code and revoke all sessions", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		phone := signIn(t, tn, alice.Email)
		token := recoveryToken(t, tn, alice.Email)

		// Action
		res, err := tn.Client(t, token).ResetPasswordWithResponse(t.Context(), api.ResetPasswordJSONRequestBody{NewPassword: newPassword})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "resetting: %s", apierr.Body(res.Body))
		requireSessionGone(t, alice.API)
		requireSessionGone(t, phone.API)
		old, _ := login(t, tn, alice.Email, harness.UserPassword)
		require.Equal(t, http.StatusBadRequest, old.StatusCode())
		reset, _ := login(t, tn, alice.Email, newPassword)
		require.Equal(t, http.StatusOK, reset.StatusCode())
	})

	t.Run("should refuse a replayed recovery token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		token := recoveryToken(t, tn, alice.Email)
		first, err := tn.Client(t, token).ResetPasswordWithResponse(t.Context(), api.ResetPasswordJSONRequestBody{NewPassword: newPassword})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, first.StatusCode(), "resetting: %s", apierr.Body(first.Body))

		// Action
		res, err := tn.Client(t, token).ResetPasswordWithResponse(t.Context(), api.ResetPasswordJSONRequestBody{NewPassword: "ReplayedHarnessPassword9#"})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusUnauthorized, res.StatusCode())
		require.Equal(t, "Invalid recovery token", apierr.Message(res.Body))
		kept, _ := login(t, tn, alice.Email, newPassword)
		require.Equal(t, http.StatusOK, kept.StatusCode())
	})
}

func TestAccountRecovery_WrongCode(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a wrong recovery code without issuing a recovery token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		sendRecovery(t, tn, alice.Email)
		tn.Mail(t).Expect(t, alice.Email, smtp.Subject(recoverySubject))

		// Action
		res, err := tn.Anonymous(t).VerifyAccountRecoveryEmailWithResponse(t.Context(), api.VerifyAccountRecoveryEmailJSONRequestBody{
			Email: openapi_types.Email(alice.Email),
			Code:  "not-the-code",
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "body: %s", apierr.Body(res.Body))
		require.Equal(t, "Invalid or expired verification request", apierr.Message(res.Body))
		require.Nil(t, res.JSON200)
	})
}

func sendRecovery(t *testing.T, tn *harness.Tenant, email string) *api.SendAccountRecoveryEmailResponse {
	t.Helper()
	res, err := tn.Anonymous(t).SendAccountRecoveryEmailWithResponse(t.Context(), api.SendAccountRecoveryEmailJSONRequestBody{
		Email: openapi_types.Email(email),
	})
	require.NoError(t, err)
	return res
}

// recoveryToken runs the recovery mail round trip and returns the token that may reset
// the password.
func recoveryToken(t *testing.T, tn *harness.Tenant, email string) string {
	t.Helper()
	sent := sendRecovery(t, tn, email)
	require.Equalf(t, http.StatusOK, sent.StatusCode(), "sending the recovery mail: %s", apierr.Body(sent.Body))
	code, err := mail.Param(tn.Mail(t).Expect(t, email, smtp.Subject(recoverySubject)), "token")
	require.NoError(t, err)
	res, err := tn.Anonymous(t).VerifyAccountRecoveryEmailWithResponse(t.Context(), api.VerifyAccountRecoveryEmailJSONRequestBody{
		Email: openapi_types.Email(email),
		Code:  code,
	})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "verifying the recovery code: %s", apierr.Body(res.Body))
	return res.JSON200.Token
}
