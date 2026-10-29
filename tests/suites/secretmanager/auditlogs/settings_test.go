package auditlogs_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAuditLog_EventClasses(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse turning off the data-access class and keep recording secret reads", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "TOKEN", "v")

		// Action
		res, err := tn.Admin.API.UpdateProjectAuditLogSettingsWithResponse(t.Context(), uuid.MustParse(proj.ID),
			api.UpdateProjectAuditLogSettingsJSONRequestBody{EventClasses: []eventClassSetting{
				{EventClass: api.UpdateProjectAuditLogSettingsJSONBodyEventClassesEventClassDataAccess, IsEnabled: false},
				{EventClass: api.UpdateProjectAuditLogSettingsJSONBodyEventClassesEventClassAuthentication, IsEnabled: true},
				{EventClass: api.UpdateProjectAuditLogSettingsJSONBodyEventClassesEventClassAuthorization, IsEnabled: false},
			}})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Event class 'data-access' is always recorded and cannot be changed", res.JSON400.Message)
		secretmanager.GetSecret(t, proj, "dev", "TOKEN")
		got := waitForEvents(t, proj, filter{EventType: new("get-secret")}, 1)
		require.Equal(t, "data-access", got[0].Class)
	})

	t.Run("should record one permission-denied event for repeated denials when the authorization class is on", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))
		setEventClasses(t, proj, true)
		secretmanager.CreateSecret(t, proj, "dev", "MARKER", "v")

		// Action
		for range 2 {
			res, err := viewer.API.CreateSecretV4WithResponse(t.Context(), "DENIED",
				api.CreateSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", SecretValue: "v"})
			require.NoError(t, err)
			require.Equal(t, http.StatusForbidden, res.StatusCode())
		}

		// Assert
		denied := waitForEvents(t, proj, filter{EventType: new("permission-denied")}, 1)
		secretmanager.GetSecret(t, proj, "dev", "MARKER")
		waitForEvents(t, proj, filter{EventType: new("get-secret")}, 1)
		require.Len(t, events(t, proj, filter{EventType: new("permission-denied")}), 1, "the repeat is collapsed into the first")
		require.Equal(t, "authorization", denied[0].Class)
		require.Equal(t, viewer.ID.String(), denied[0].Actor["identityId"])
		require.Equal(t, "create", denied[0].Metadata["permissionAction"])
		require.Equal(t, "secrets", denied[0].Metadata["permissionSubject"])
	})

	t.Run("should not record a permission denial when the authorization class is off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))
		secretmanager.CreateSecret(t, proj, "dev", "MARKER", "v")

		// Action
		res, err := viewer.API.CreateSecretV4WithResponse(t.Context(), "DENIED",
			api.CreateSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", SecretValue: "v"})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		secretmanager.GetSecret(t, proj, "dev", "MARKER")
		waitForEvents(t, proj, filter{EventType: new("get-secret")}, 1)
		require.Empty(t, events(t, proj, filter{EventType: new("permission-denied")}))
	})
}

func TestAuditLog_Retention(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should drop events written while the plan keeps no audit logs", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.AuditRetentionDays, 0)))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "DROPPED", "v")

		// Assert
		tn.SetPlan(t, license.Enterprise())
		secretmanager.CreateSecret(t, proj, "dev", "KEPT", "v")
		waitForEvents(t, proj, filter{EventType: new("create-secret"), SecretKey: new("KEPT")}, 1)
		require.Equal(t, []string{"KEPT"}, keysOf(events(t, proj, filter{EventType: new("create-secret")})))
	})

	t.Run("should refuse a retention the plan does not allow and keep the current one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.AuditRetentionDays, 7)))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.UpdateProjectAuditLogsRetentionWithResponse(t.Context(), proj.ID,
			api.UpdateProjectAuditLogsRetentionJSONRequestBody{AuditLogsRetentionDays: 30})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Failed to update audit logs retention due to plan limit reached. Upgrade plan to increase.",
			res.JSON400.Message)
		got, err := tn.Admin.API.GetProjectByIdWithResponse(t.Context(), proj.ID)
		require.NoError(t, err)
		require.NotNil(t, got.JSON200)
		require.Nil(t, got.JSON200.Project.AuditLogsRetentionDays)
	})

	t.Run("should keep a retention within the plan", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.AuditRetentionDays, 7)))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.UpdateProjectAuditLogsRetentionWithResponse(t.Context(), proj.ID,
			api.UpdateProjectAuditLogsRetentionJSONRequestBody{AuditLogsRetentionDays: 7})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode())
		got, err := tn.Admin.API.GetProjectByIdWithResponse(t.Context(), proj.ID)
		require.NoError(t, err)
		require.NotNil(t, got.JSON200)
		require.NotNil(t, got.JSON200.Project.AuditLogsRetentionDays)
		require.Equal(t, float32(7), *got.JSON200.Project.AuditLogsRetentionDays)
	})
}
