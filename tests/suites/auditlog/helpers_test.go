package auditlog_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

type entry struct {
	ID            string
	Type          string
	Class         string
	ActorType     string
	Actor         map[string]any
	Metadata      map[string]any
	IP            string
	UserAgent     string
	UserAgentType string
	ProjectID     string
	CreatedAt     time.Time
}

type filter = api.ListOrganizationAuditLogsParams

// withDefaults bounds a read to the last hour. The API otherwise starts at the last
// midnight UTC, which a run crossing midnight would fall on the wrong side of.
func withDefaults(f filter) filter {
	if f.StartDate == nil {
		f.StartDate = new(time.Now().UTC().Add(-time.Hour).Truncate(time.Second))
	}
	if f.Limit == nil {
		f.Limit = new(float32(100))
	}
	return f
}

func listLogs(ctx context.Context, actor *api.ClientWithResponses, f filter) (*api.ListOrganizationAuditLogsResponse, []entry, error) {
	f = withDefaults(f)
	res, err := actor.ListOrganizationAuditLogsWithResponse(ctx, &f)
	if err != nil {
		return nil, nil, err
	}
	if res.JSON200 == nil {
		return res, nil, fmt.Errorf("listing audit logs returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	}
	out := make([]entry, 0, len(res.JSON200.AuditLogs))
	for _, l := range res.JSON200.AuditLogs {
		actorMeta, _ := l.Actor.Metadata.(map[string]any)
		metadata, _ := l.Event.Metadata.(map[string]any)
		out = append(out, entry{
			ID:            l.Id.String(),
			Type:          l.Event.Type,
			Class:         string(l.Event.Class),
			ActorType:     l.Actor.Type,
			Actor:         actorMeta,
			Metadata:      metadata,
			IP:            deref(l.IpAddress),
			UserAgent:     deref(l.UserAgent),
			UserAgentType: deref(l.UserAgentType),
			ProjectID:     deref(l.ProjectId),
			CreatedAt:     l.CreatedAt,
		})
	}
	return res, out, nil
}

// events reads the log once, as the given principal.
func events(t *testing.T, actor *harness.Principal, f filter) []entry {
	t.Helper()
	_, got, err := listLogs(t.Context(), actor.API, f)
	require.NoError(t, err)
	return got
}

// waitForEvents polls until at least n events match. Audit logs are written from a
// queue drained every few seconds, so a read right after the action is empty.
func waitForEvents(t *testing.T, actor *harness.Principal, f filter, n int) []entry {
	t.Helper()
	got, err := wait.For(t.Context(), func(ctx context.Context) ([]entry, bool, error) {
		_, evs, err := listLogs(ctx, actor.API, f)
		return evs, len(evs) >= n, err
	})
	require.NoErrorf(t, err, "waiting for %d audit events of type %v", n, deref(f.EventType))
	return got
}

// waitForEvent polls until an event of the type, or of any type when it is empty,
// passes match.
func waitForEvent(t *testing.T, actor *harness.Principal, eventType string, match func(entry) bool) entry {
	t.Helper()
	f := filter{}
	if eventType != "" {
		f.EventType = &eventType
	}
	got, err := wait.For(t.Context(), func(ctx context.Context) (entry, bool, error) {
		_, evs, err := listLogs(ctx, actor.API, f)
		for _, e := range evs {
			if match(e) {
				return e, true, nil
			}
		}
		return entry{}, false, err
	})
	require.NoErrorf(t, err, "waiting for a %s audit event", eventType)
	return got
}

func ids(evs []entry) []string {
	out := make([]string, 0, len(evs))
	for _, e := range evs {
		out = append(out, e.ID)
	}
	return out
}

func metadataValues(evs []entry, key string) []any {
	out := make([]any, 0, len(evs))
	for _, e := range evs {
		out = append(out, e.Metadata[key])
	}
	return out
}

func deref[T any](p *T) T {
	var zero T
	if p == nil {
		return zero
	}
	return *p
}

func jsonString(t *testing.T, v any) string {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return string(raw)
}

func jsonBody(t *testing.T, v any) io.Reader {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return bytes.NewReader(raw)
}

// from sends one call as if from another address and client, for claims about what
// the log records of the caller.
func from(ip, userAgent string) api.RequestEditorFn {
	return func(_ context.Context, req *http.Request) error {
		req.Header.Set("X-Forwarded-For", ip)
		req.Header.Set("User-Agent", userAgent)
		return nil
	}
}

func userAgent(ua string) api.RequestEditorFn {
	return func(_ context.Context, req *http.Request) error {
		req.Header.Set("User-Agent", ua)
		return nil
	}
}

func sourceIP() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return fmt.Sprintf("10.%d.%d.%d", b[0], b[1], b[2])
}

func createGroup(t *testing.T, actor *harness.Principal, name string, editors ...api.RequestEditorFn) string {
	t.Helper()
	res, err := actor.API.CreateGroupWithResponse(t.Context(), api.CreateGroupJSONRequestBody{Name: name}, editors...)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating group %s returned %d: %s", name, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Id.String()
}
