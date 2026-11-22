package reminders_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSecretReminder_Validation(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	refusals := []struct {
		name string
		body api.CreateSecretReminderJSONRequestBody
	}{
		{"should refuse a reminder with neither repeat days nor a next date", api.CreateSecretReminderJSONRequestBody{Message: new("note")}},
		{"should refuse repeat days under 1", api.CreateSecretReminderJSONRequestBody{RepeatDays: new(float32(0.5))}},
		{"should refuse a note over 1024 characters", api.CreateSecretReminderJSONRequestBody{
			RepeatDays: new(float32(30)), Message: new(strings.Repeat("n", 1025)),
		}},
	}
	for _, tc := range refusals {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
			secret := secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

			// Action
			res, err := tn.Admin.API.CreateSecretReminderWithResponse(t.Context(), uuid.MustParse(secret.ID), tc.body)

			// Assert
			require.NoError(t, err)
			require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
			require.Nil(t, getReminder(t, proj, secret.ID))
		})
	}

	t.Run("should refuse a project viewer and set no reminder", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		viewer := proj.NewUser(t, fixture.WithPrincipalName("viewer"), fixture.WithRoles("viewer"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

		// Action
		res, err := viewer.API.CreateSecretReminderWithResponse(t.Context(), uuid.MustParse(secret.ID),
			api.CreateSecretReminderJSONRequestBody{RepeatDays: new(float32(30))})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to edit on secrets", res.JSON403.Message)
		require.Nil(t, getReminder(t, proj, secret.ID))
	})

	// [BUG?] An unknown secret answers 400, not 404.
	t.Run("should refuse with 400 naming the id when the secret does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		missing := uuid.New()

		// Action
		res, err := tn.Admin.API.CreateSecretReminderWithResponse(t.Context(), missing,
			api.CreateSecretReminderJSONRequestBody{RepeatDays: new(float32(30))})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Secret "+missing.String()+" not found", res.JSON400.Message)
	})
}
