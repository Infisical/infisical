package user_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestUser_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should delete the account, mail a confirmation, and refuse its sessions", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		phone := signIn(t, tn, alice.Email)

		// Action
		res, err := alice.API.DeleteUserWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting: %s", apierr.Body(res.Body))
		tn.Mail(t).Expect(t, alice.Email, smtp.Subject("Your Infisical account has been deleted"))
		requireSessionGone(t, alice.API)
		requireSessionGone(t, phone.API)
		again, _ := login(t, tn, alice.Email, harness.UserPassword)
		require.Equal(t, http.StatusBadRequest, again.StatusCode())
		require.Nil(t, fixture.MembershipOf(t, tn, alice.Email))
	})
}
