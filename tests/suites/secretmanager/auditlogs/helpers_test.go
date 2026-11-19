package auditlogs_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type event struct {
	Type      string
	Class     string
	ActorType string
	Actor     map[string]any
	Metadata  map[string]any
}

type filter = api.ListOrganizationAuditLogsParams

// The generated settings body declares its items as an anonymous struct; an identical
// alias is assignable to it.
type eventClassSetting = struct {
	EventClass api.UpdateProjectAuditLogSettingsJSONBodyEventClassesEventClass `json:"eventClass"`
	IsEnabled  bool                                                            `json:"isEnabled"`
}

func listEvents(ctx context.Context, proj *fixture.Project, f filter) ([]event, error) {
	f.ProjectId = &proj.ID
	if f.Limit == nil {
		f.Limit = new(float32(100))
	}
	res, err := proj.Tenant().Admin.API.ListOrganizationAuditLogsWithResponse(ctx, &f)
	if err != nil {
		return nil, err
	}
	if res.JSON200 == nil {
		return nil, fmt.Errorf("listing audit logs returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	}
	out := make([]event, 0, len(res.JSON200.AuditLogs))
	for _, l := range res.JSON200.AuditLogs {
		actor, _ := l.Actor.Metadata.(map[string]any)
		metadata, _ := l.Event.Metadata.(map[string]any)
		out = append(out, event{
			Type:      l.Event.Type,
			Class:     string(l.Event.Class),
			ActorType: l.Actor.Type,
			Actor:     actor,
			Metadata:  metadata,
		})
	}
	return out, nil
}

// events reads the project's audit log once. Every read is scoped to the project, so a
// test only sees what its own tenant wrote.
func events(t *testing.T, proj *fixture.Project, f filter) []event {
	t.Helper()
	got, err := listEvents(t.Context(), proj, f)
	require.NoError(t, err)
	return got
}

// waitForEvents polls until at least n events match. Writes reach the log through a
// queue that is drained every few seconds, so a read right after the action is empty.
func waitForEvents(t *testing.T, proj *fixture.Project, f filter, n int) []event {
	t.Helper()
	got, err := wait.For(t.Context(), func(ctx context.Context) ([]event, bool, error) {
		evs, err := listEvents(ctx, proj, f)
		return evs, len(evs) >= n, err
	})
	require.NoErrorf(t, err, "waiting for %d audit events matching %+v", n, f)
	return got
}

func byType(evs []event) map[string]event {
	out := make(map[string]event, len(evs))
	for _, e := range evs {
		out[e.Type] = e
	}
	return out
}

func keysOf(evs []event) []string {
	keys := make([]string, 0, len(evs))
	for _, e := range evs {
		key, _ := e.Metadata["secretKey"].(string)
		keys = append(keys, key)
	}
	return keys
}

func setEventClasses(t *testing.T, proj *fixture.Project, authorization bool) {
	t.Helper()
	res, err := proj.Tenant().Admin.API.UpdateProjectAuditLogSettingsWithResponse(t.Context(), uuid.MustParse(proj.ID),
		api.UpdateProjectAuditLogSettingsJSONRequestBody{EventClasses: []eventClassSetting{
			{EventClass: api.UpdateProjectAuditLogSettingsJSONBodyEventClassesEventClassAuthentication, IsEnabled: true},
			{EventClass: api.UpdateProjectAuditLogSettingsJSONBodyEventClassesEventClassAuthorization, IsEnabled: authorization},
		}})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "saving audit log settings returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}
