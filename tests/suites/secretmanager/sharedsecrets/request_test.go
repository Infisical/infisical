package sharedsecrets_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSecretRequest_SetValue(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse setting a value twice and keep the first", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		id := requestSecret(t, tn.Admin, "anyone")
		anon := tn.Anonymous(t)
		first := setRequestValue(t, anon, id, "first")
		require.Equalf(t, http.StatusOK, first.StatusCode(), "setting the value returned %s", apierr.Body(first.Body))

		// Action
		second := setRequestValue(t, anon, id, "second")

		// Assert
		require.Equal(t, http.StatusBadRequest, second.StatusCode())
		require.Equal(t, "Secret request already has a value set", second.JSON400.Message)
		got := reveal(t, tn.Admin, id)
		require.NotNilf(t, got.JSON200, "revealing returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		require.Equal(t, "first", got.JSON200.SecretRequest.SecretValue)
	})

	t.Run("should mail the requester when a value is set", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		id := requestSecret(t, tn.Admin, "anyone")

		// Action
		res := setRequestValue(t, tn.Anonymous(t), id, "answered")
		require.Equalf(t, http.StatusOK, res.StatusCode(), "setting the value returned %s", apierr.Body(res.Body))

		// Assert
		msg := tn.Mail(t).Expect(t, tn.Admin.Email, smtp.Subject("Secret Request Completed"))
		require.Contains(t, msg.Body, "secret-sharing?selectedTab=request-secret",
			"the mail does not link to the requester's secret requests")
	})
}

func TestSecretRequest_Reveal(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a reveal by an organization member who is not the requester", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		other := tn.NewUser(t, harness.WithName("other"))
		id := requestSecret(t, tn.Admin, "organization")
		set := setRequestValue(t, other.API, id, "for-requester")
		require.Equalf(t, http.StatusOK, set.StatusCode(), "setting the value returned %s", apierr.Body(set.Body))

		// Action
		res := reveal(t, other, id)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.NotContains(t, string(res.Body), "for-requester")
		got := reveal(t, tn.Admin, id)
		require.NotNilf(t, got.JSON200, "revealing returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		require.Equal(t, "for-requester", got.JSON200.SecretRequest.SecretValue)
	})

	t.Run("should refuse a reveal before a value is set", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		id := requestSecret(t, tn.Admin, "organization")

		// Action
		res := reveal(t, tn.Admin, id)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Secret request has no value set", res.JSON400.Message)
	})
}
