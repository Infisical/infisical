package reminders_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSecretReminder(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the schedule, note and recipients once a reminder is set", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		member := proj.NewUser(t, fixture.WithPrincipalName("member"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

		// Action
		setReminder(t, proj, secret.ID, api.CreateSecretReminderJSONRequestBody{
			RepeatDays: new(float32(30)), Message: new("rotate it"), Recipients: recipients(member.ID),
		})

		// Assert
		require.Equal(t, &reminder{RepeatDays: 30, Message: "rotate it", Recipients: []string{member.ID.String()}},
			getReminder(t, proj, secret.ID))
	})

	t.Run("should keep the note and fall back to every project member when a reminder is updated without recipients", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		member := proj.NewUser(t, fixture.WithPrincipalName("member"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")
		setReminder(t, proj, secret.ID, api.CreateSecretReminderJSONRequestBody{
			RepeatDays: new(float32(30)), Message: new("rotate it"), Recipients: recipients(member.ID),
		})

		// Action
		setReminder(t, proj, secret.ID, api.CreateSecretReminderJSONRequestBody{RepeatDays: new(float32(14))})

		// Assert
		require.Equal(t, &reminder{RepeatDays: 14, Message: "rotate it", Recipients: []string{}},
			getReminder(t, proj, secret.ID))
	})

	t.Run("should report the reminder and its recipients in the dashboard listing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		member := proj.NewUser(t, fixture.WithPrincipalName("member"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "LISTING", "value")
		setReminder(t, proj, secret.ID, api.CreateSecretReminderJSONRequestBody{
			RepeatDays: new(float32(30)), Recipients: recipients(member.ID),
		})

		// Action
		res, err := tn.Admin.API.ListProjectSecretsDetailsWithResponse(t.Context(), &api.ListProjectSecretsDetailsParams{
			ProjectId: proj.ID, Environment: "dev", Search: new("LISTING"),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "dashboard listing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.NotNil(t, res.JSON200.Secrets)
		require.Len(t, *res.JSON200.Secrets, 1)
		listed := (*res.JSON200.Secrets)[0]
		require.NotNil(t, listed.SecretReminderRepeatDays)
		require.Equal(t, float32(30), *listed.SecretReminderRepeatDays)
		require.NotNil(t, listed.Reminder)
		require.Equal(t, float32(30), *listed.Reminder.RepeatDays)
		require.Equal(t, []string{member.ID.String()}, *listed.Reminder.Recipients)
	})

	t.Run("should carry the reminder and its recipients to a moved secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		member := proj.NewUser(t, fixture.WithPrincipalName("member"))
		secretmanager.CreateFolder(t, proj, "dev", "/dest")
		secret := secretmanager.CreateSecret(t, proj, "dev", "MOVE", "value")
		setReminder(t, proj, secret.ID, api.CreateSecretReminderJSONRequestBody{
			RepeatDays: new(float32(30)), Recipients: recipients(member.ID),
		})

		// Action
		res, err := tn.Admin.API.MoveSecretsV4WithResponse(t.Context(), api.MoveSecretsV4JSONRequestBody{
			ProjectId:              proj.ID,
			SourceEnvironment:      "dev",
			SourceSecretPath:       new("/"),
			DestinationEnvironment: "dev",
			DestinationSecretPath:  new("/dest"),
			SecretIds:              []string{secret.ID},
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "moving: %s", apierr.Body(res.Body))
		moved := secretmanager.GetSecret(t, proj, "dev", "MOVE", secretmanager.WithPath("/dest"))
		require.NotEqual(t, secret.ID, moved.ID)
		require.Equal(t, &reminder{RepeatDays: 30, Recipients: []string{member.ID.String()}}, getReminder(t, proj, moved.ID))
	})

	t.Run("should no longer return a reminder once it is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "DELETE_ME", "value")
		setReminder(t, proj, secret.ID, api.CreateSecretReminderJSONRequestBody{RepeatDays: new(float32(30))})

		// Action
		res, err := tn.Admin.API.DeleteSecretReminderWithResponse(t.Context(), uuid.MustParse(secret.ID))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the reminder: %s", apierr.Body(res.Body))
		require.Nil(t, getReminder(t, proj, secret.ID))
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "dev", "DELETE_ME").Value)
	})
}

func TestSecretReminder_SecretUpdate(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should set the reminder and its recipients when a secret update carries one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		member := proj.NewUser(t, fixture.WithPrincipalName("member"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "WITH_UPDATE", "value")

		// Action
		res, err := tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), "WITH_UPDATE", api.UpdateSecretV4JSONRequestBody{
			ProjectId:                proj.ID,
			Environment:              "dev",
			SecretValue:              new("rotated"),
			SecretReminderRepeatDays: new(float32(14)),
			SecretReminderNote:       new("rotate it"),
			SecretReminderRecipients: recipients(member.ID),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "updating: %s", apierr.Body(res.Body))
		require.Equal(t, &reminder{RepeatDays: 14, Message: "rotate it", Recipients: []string{member.ID.String()}},
			getReminder(t, proj, secret.ID))
	})

	t.Run("should refuse recipients outside the project and keep the secret unchanged", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		outsider := tn.NewUser(t, harness.WithName("outsider"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "REFUSED", "value")

		// Action
		res, err := tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), "REFUSED", api.UpdateSecretV4JSONRequestBody{
			ProjectId:                proj.ID,
			Environment:              "dev",
			SecretValue:              new("rotated"),
			SecretReminderRepeatDays: new(float32(14)),
			SecretReminderRecipients: recipients(outsider.ID),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "None of the selected reminder recipients are members of this project. Choose recipients again.",
			res.JSON400.Message)
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "dev", "REFUSED").Value)
		require.Nil(t, getReminder(t, proj, secret.ID))
	})

	t.Run("should refuse a reminder on a personal secret and keep the personal value", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "PERSONAL_REMINDER", "shared")
		secretmanager.CreateSecret(t, proj, "dev", "PERSONAL_REMINDER", "personal", secretmanager.WithPersonal())

		// Action
		res, err := tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), "PERSONAL_REMINDER", api.UpdateSecretV4JSONRequestBody{
			ProjectId:                proj.ID,
			Environment:              "dev",
			Type:                     new(api.UpdateSecretV4JSONBodyTypePersonal),
			SecretValue:              new("changed"),
			SecretReminderRepeatDays: new(float32(14)),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Reminders can only be set on shared secrets", res.JSON400.Message)
		require.Equal(t, "personal", secretmanager.GetSecret(t, proj, "dev", "PERSONAL_REMINDER", secretmanager.WithPersonal()).Value)
	})
}
