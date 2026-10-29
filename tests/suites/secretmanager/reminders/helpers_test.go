package reminders_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

type reminder struct {
	RepeatDays float32
	Message    string
	Recipients []string
}

func recipients(ids ...uuid.UUID) *[]openapi_types.UUID { return &ids }

func setReminder(t *testing.T, proj *fixture.Project, secretID string, body api.CreateSecretReminderJSONRequestBody) {
	t.Helper()
	res, err := proj.Tenant().Admin.API.CreateSecretReminderWithResponse(t.Context(), uuid.MustParse(secretID), body)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "setting a reminder returned %s", apierr.Body(res.Body))
}

// getReminder returns nil when the secret has no reminder.
func getReminder(t *testing.T, proj *fixture.Project, secretID string) *reminder {
	t.Helper()
	res, err := proj.Tenant().Admin.API.GetSecretReminderWithResponse(t.Context(), uuid.MustParse(secretID))
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the reminder returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	r := res.JSON200.Reminder
	if r == nil {
		return nil
	}
	out := &reminder{Recipients: []string{}}
	if r.RepeatDays != nil {
		out.RepeatDays = *r.RepeatDays
	}
	if r.Message != nil {
		out.Message = *r.Message
	}
	if r.Recipients != nil {
		out.Recipients = *r.Recipients
	}
	return out
}
