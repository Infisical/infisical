package clickhouseaudit_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

type auditLog struct {
	Type      string
	ActorType string
	Metadata  map[string]any
	CreatedAt time.Time
	ExpiresAt *time.Time
}

// With ClickHouse configured the list endpoint reads ClickHouse, so an event that was not stored there never shows.
func waitForSecretEvent(t *testing.T, proj *fixture.Project, eventType, secretKey string) auditLog {
	t.Helper()
	got, err := wait.For(t.Context(), func(ctx context.Context) (auditLog, bool, error) {
		res, err := proj.Tenant().Admin.API.ListOrganizationAuditLogsWithResponse(ctx, &api.ListOrganizationAuditLogsParams{
			ProjectId: &proj.ID,
			EventType: new(eventType),
			SecretKey: new(secretKey),
			Limit:     new(float32(10)),
		})
		if err != nil {
			return auditLog{}, false, err
		}
		if res.JSON200 == nil {
			return auditLog{}, false, fmt.Errorf("listing audit logs returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		}
		if len(res.JSON200.AuditLogs) == 0 {
			return auditLog{}, false, nil
		}
		l := res.JSON200.AuditLogs[0]
		metadata, _ := l.Event.Metadata.(map[string]any)
		return auditLog{Type: l.Event.Type, ActorType: l.Actor.Type, Metadata: metadata, CreatedAt: l.CreatedAt, ExpiresAt: l.ExpiresAt}, true, nil
	})
	require.NoErrorf(t, err, "waiting for a %s audit log for %s", eventType, secretKey)
	return got
}

func TestAuditLog_ClickHouse(t *testing.T) {
	h := harness.From(t)

	t.Run("should store a recorded event in ClickHouse with the plan's retention and list it", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.AuditRetentionDays, 30)))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "CLICKHOUSE_KEY", "v")

		// Assert
		got := waitForSecretEvent(t, proj, "create-secret", "CLICKHOUSE_KEY")
		require.Equal(t, "user", got.ActorType)
		require.Equal(t, "CLICKHOUSE_KEY", got.Metadata["secretKey"])
		require.NotNil(t, got.ExpiresAt)
		require.WithinDuration(t, got.CreatedAt.Add(30*24*time.Hour), *got.ExpiresAt, time.Minute)
	})

	t.Run("should expire events after the project's retention when it is within the plan", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.AuditRetentionDays, 30)))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		res, err := tn.Admin.API.UpdateProjectAuditLogsRetentionWithResponse(t.Context(), proj.ID,
			api.UpdateProjectAuditLogsRetentionJSONRequestBody{AuditLogsRetentionDays: 7})
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode())

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "RETAINED_IN_CLICKHOUSE", "v")

		// Assert
		got := waitForSecretEvent(t, proj, "create-secret", "RETAINED_IN_CLICKHOUSE")
		require.NotNil(t, got.ExpiresAt)
		require.WithinDuration(t, got.CreatedAt.Add(7*24*time.Hour), *got.ExpiresAt, time.Minute)
	})

	t.Run("should store nothing while the plan keeps no audit logs", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.AuditRetentionDays, 0)))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "DROPPED_IN_CLICKHOUSE", "v")

		// Action
		tn.SetPlan(t, license.Enterprise())
		secretmanager.CreateSecret(t, proj, "dev", "KEPT_IN_CLICKHOUSE", "v")

		// Assert
		waitForSecretEvent(t, proj, "create-secret", "KEPT_IN_CLICKHOUSE")
		res, err := tn.Admin.API.ListOrganizationAuditLogsWithResponse(t.Context(), &api.ListOrganizationAuditLogsParams{
			ProjectId: &proj.ID,
			EventType: new("create-secret"),
			SecretKey: new("DROPPED_IN_CLICKHOUSE"),
			Limit:     new(float32(10)),
		})
		require.NoError(t, err)
		require.NotNil(t, res.JSON200)
		require.Empty(t, res.JSON200.AuditLogs)
	})
}
