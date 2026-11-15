package auditlog_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

type classSetting struct {
	EventClass string `json:"eventClass"`
	IsEnabled  bool   `json:"isEnabled"`
}

func TestAuditLog_OrgEventClasses(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	refusals := []struct {
		name    string
		classes []classSetting
		message string
	}{
		{
			name: "should refuse the management class and keep the current settings",
			classes: []classSetting{
				{"management", false}, {"authentication", true}, {"authorization", false},
			},
			message: "Event class 'management' is always recorded and cannot be changed",
		},
		{
			name: "should refuse the data-access class and keep the current settings",
			classes: []classSetting{
				{"data-access", false}, {"authentication", true}, {"authorization", false},
			},
			message: "Event class 'data-access' is always recorded and cannot be changed",
		},
		{
			name: "should refuse a class sent twice and keep the current settings",
			classes: []classSetting{
				{"authentication", true}, {"authentication", false}, {"authorization", false},
			},
			message: "Event class 'authentication' appears more than once",
		},
		{
			name:    "should refuse settings missing a configurable class and keep the current settings",
			classes: []classSetting{{"authentication", true}},
			message: "Every event class except management and data-access must be included. Missing: authorization",
		},
	}
	for _, tc := range refusals {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			saveOrgClasses(t, tn, classSetting{"authentication", false}, classSetting{"authorization", false})

			// Action
			res, err := tn.Admin.API.UpdateOrganizationAuditLogSettingsWithBodyWithResponse(t.Context(),
				"application/json", jsonBody(t, map[string]any{"eventClasses": tc.classes}))

			// Assert
			require.NoError(t, err)
			require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "%s", apierr.Body(res.Body))
			require.Equal(t, tc.message, res.JSON400.Message)
			require.Equal(t, map[string]bool{
				"management": true, "authentication": false, "data-access": true, "authorization": false,
			}, orgClasses(t, tn))
		})
	}
}

func saveOrgClasses(t *testing.T, tn *harness.Tenant, classes ...classSetting) {
	t.Helper()
	res, err := tn.Admin.API.UpdateOrganizationAuditLogSettingsWithBodyWithResponse(t.Context(),
		"application/json", jsonBody(t, map[string]any{"eventClasses": classes}))
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "saving org audit log settings: %s", apierr.Body(res.Body))
}

func orgClasses(t *testing.T, tn *harness.Tenant) map[string]bool {
	t.Helper()
	res, err := tn.Admin.API.GetOrganizationAuditLogSettingsWithResponse(t.Context())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading org audit log settings returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	out := map[string]bool{}
	for _, c := range res.JSON200.AuditLogSettings.EventClasses {
		out[string(c.EventClass)] = c.IsEnabled
	}
	return out
}
