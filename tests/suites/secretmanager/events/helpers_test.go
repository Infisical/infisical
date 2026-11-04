package events_test

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// eventBudget covers the slowest event here: an import mutation for an importing
// folder, which the source folder's sync job publishes after its debounce.
const eventBudget = 30 * time.Second

type registration struct {
	Event      string      `json:"event"`
	Conditions *conditions `json:"conditions,omitempty"`
}

type conditions struct {
	EnvironmentSlug string `json:"environmentSlug,omitempty"`
	SecretPath      string `json:"secretPath,omitempty"`
}

func on(event string) registration { return registration{Event: event} }

// in narrows a registration to one environment and a path, which may be a glob.
func (r registration) in(env, secretPath string) registration {
	r.Conditions = &conditions{EnvironmentSlug: env, SecretPath: secretPath}
	return r
}

// secretRef is one entry in the payload of a create, update or delete.
type secretRef struct {
	Environment string `json:"environment"`
	SecretPath  string `json:"secretPath"`
	SecretKey   string `json:"secretKey"`
}

// folderRef is the payload of an import mutation.
type folderRef struct {
	Environment string `json:"environment"`
	SecretPath  string `json:"secretPath"`
}

type event struct {
	Name        string // the frame's event field
	Type        string // the body's eventType
	ProjectType string
	payload     json.RawMessage
}

func (e event) secrets(t *testing.T) []secretRef {
	t.Helper()
	var refs []secretRef
	require.NoErrorf(t, json.Unmarshal(e.payload, &refs), "decoding the payload of %s: %s", e.Name, e.payload)
	return refs
}

func (e event) folder(t *testing.T) folderRef {
	t.Helper()
	var ref folderRef
	require.NoErrorf(t, json.Unmarshal(e.payload, &ref), "decoding the payload of %s: %s", e.Name, e.payload)
	return ref
}

type frame struct{ name, data string }

type stream struct {
	frames chan frame
	err    error
}

// watch subscribes as a viewer machine identity, the access a subscriber such as the
// Kubernetes operator is usually given.
func watch(t *testing.T, proj *fixture.Project, regs ...registration) *stream {
	t.Helper()
	return subscribe(t, proj.NewMachineIdentity(t, fixture.WithRoles("viewer")), proj, regs...)
}

// subscribe opens a stream that stays open until the test ends. The method without
// WithResponse hands back the unread body, so frames are read as they arrive.
func subscribe(t *testing.T, p *harness.Principal, proj *fixture.Project, regs ...registration) *stream {
	t.Helper()
	res, err := p.API.SubscribeToProjectEventsWithBody(t.Context(), "application/json", subscription(t, proj, regs))
	require.NoError(t, err, "subscribing to project events")
	t.Cleanup(func() { _ = res.Body.Close() })
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		t.Fatalf("subscribing to project events returned %d: %s", res.StatusCode, apierr.Body(body))
	}
	require.Equal(t, "text/event-stream", res.Header.Get("Content-Type"))

	s := &stream{frames: make(chan frame, 64)}
	go s.read(t.Context(), res.Body)
	return s
}

// trySubscribe is the subscribe call for a test that expects a refusal. An accepted
// stream never ends, so the deadline turns one into a failure instead of a hang.
func trySubscribe(t *testing.T, p *harness.Principal, proj *fixture.Project, regs ...registration) *api.SubscribeToProjectEventsResponse {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	res, err := p.API.SubscribeToProjectEventsWithBodyWithResponse(ctx, "application/json", subscription(t, proj, regs))
	require.NoError(t, err, "subscribing to project events; a timeout means the stream was accepted")
	return res
}

func subscription(t *testing.T, proj *fixture.Project, regs []registration) io.Reader {
	t.Helper()
	body, err := json.Marshal(map[string]any{"projectId": proj.ID, "register": regs})
	require.NoError(t, err)
	return bytes.NewReader(body)
}

func (s *stream) read(ctx context.Context, body io.Reader) {
	defer close(s.frames)
	sc := bufio.NewScanner(body)
	var f frame
	for sc.Scan() {
		field, value, _ := strings.Cut(sc.Text(), ": ")
		switch field {
		case "event":
			f.name = value
		case "data":
			f.data = value
		case "":
			if f.name != "" && f.name != "ping" {
				select {
				case s.frames <- f:
				case <-ctx.Done():
					return
				}
			}
			f = frame{}
		}
	}
	s.err = sc.Err()
}

// next returns the next event. Events arrive in the order they were published, so a
// test shows a change was left out by making it first and receiving the one after.
func (s *stream) next(t *testing.T) event {
	t.Helper()
	select {
	case f, ok := <-s.frames:
		if !ok {
			t.Fatalf("the stream ended before the next event: %v", s.err)
		}
		if f.name == "error" {
			t.Fatalf("the server sent an error instead of the next event: %s", f.data)
		}
		var body struct {
			ProjectType string `json:"projectType"`
			Data        struct {
				EventType string          `json:"eventType"`
				Payload   json.RawMessage `json:"payload"`
			} `json:"data"`
		}
		require.NoErrorf(t, json.Unmarshal([]byte(f.data), &body), "decoding %s: %s", f.name, f.data)
		return event{Name: f.name, Type: body.Data.EventType, ProjectType: body.ProjectType, payload: body.Data.Payload}
	case <-time.After(eventBudget):
		t.Fatalf("no event arrived within %s", eventBudget)
	}
	return event{}
}
