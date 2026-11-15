package webhooks_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

const secretModified = "secrets.modified"

type hookConfig struct {
	env       string
	path      string
	secretKey string
	kind      api.CreateWebhookJSONBodyType
	events    []api.CreateWebhookJSONBodyEventsFilterEventName
	as        *harness.Principal
}

type hookOption func(*hookConfig)

func inEnv(env string) hookOption    { return func(c *hookConfig) { c.env = env } }
func atPath(p string) hookOption     { return func(c *hookConfig) { c.path = p } }
func signedWith(k string) hookOption { return func(c *hookConfig) { c.secretKey = k } }
func slackType() hookOption {
	return func(c *hookConfig) { c.kind = api.CreateWebhookJSONBodyTypeSlack }
}
func onlyEvents(events ...api.CreateWebhookJSONBodyEventsFilterEventName) hookOption {
	return func(c *hookConfig) { c.events = events }
}
func createdBy(p *harness.Principal) hookOption { return func(c *hookConfig) { c.as = p } }

// createHook is the create call, for a test about whether it is accepted.
func createHook(t *testing.T, proj *fixture.Project, url string, opts ...hookOption) *api.CreateWebhookResponse {
	t.Helper()
	cfg := hookConfig{env: "dev", path: "/", kind: api.CreateWebhookJSONBodyTypeGeneral, as: proj.Tenant().Admin}
	for _, o := range opts {
		o(&cfg)
	}
	body := api.CreateWebhookJSONRequestBody{
		ProjectId:   proj.ID,
		Environment: cfg.env,
		SecretPath:  &cfg.path,
		WebhookUrl:  url,
		Type:        &cfg.kind,
	}
	if cfg.secretKey != "" {
		body.WebhookSecretKey = &cfg.secretKey
	}
	if len(cfg.events) > 0 {
		filter := make([]struct {
			EventName api.CreateWebhookJSONBodyEventsFilterEventName `json:"eventName"`
		}, len(cfg.events))
		for i, e := range cfg.events {
			filter[i].EventName = e
		}
		body.EventsFilter = &filter
	}
	res, err := cfg.as.API.CreateWebhookWithResponse(t.Context(), body)
	require.NoError(t, err, "creating a webhook")
	return res
}

func newHook(t *testing.T, proj *fixture.Project, url string, opts ...hookOption) string {
	t.Helper()
	res := createHook(t, proj, url, opts...)
	require.NotNilf(t, res.JSON200, "creating a webhook returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Webhook.Id.String()
}

// hook is a webhook as the routes return it. Decoded from the body because each
// route's generated response is its own anonymous struct.
type hook struct {
	ID                  string  `json:"id"`
	ProjectID           string  `json:"projectId"`
	SecretPath          string  `json:"secretPath"`
	URL                 string  `json:"url"`
	Type                string  `json:"type"`
	IsDisabled          bool    `json:"isDisabled"`
	LastStatus          *string `json:"lastStatus"`
	LastRunErrorMessage *string `json:"lastRunErrorMessage"`
	Environment         struct {
		Slug string `json:"slug"`
	} `json:"environment"`
	EventsFilter []struct {
		EventName string `json:"eventName"`
	} `json:"eventsFilter"`
}

func (h hook) events() []string {
	out := []string{}
	for _, e := range h.EventsFilter {
		out = append(out, e.EventName)
	}
	return out
}

func decodeHook(t *testing.T, body []byte) hook {
	t.Helper()
	var out struct {
		Webhook hook `json:"webhook"`
	}
	require.NoErrorf(t, json.Unmarshal(body, &out), "decoding a webhook: %s", apierr.Body(body))
	return out.Webhook
}

func getHook(t *testing.T, proj *fixture.Project, id string) hook {
	t.Helper()
	res, err := proj.Tenant().Admin.API.GetWebhookByIdWithResponse(t.Context(), id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "reading webhook %s: %s", id, apierr.Body(res.Body))
	return decodeHook(t, res.Body)
}

func listHooks(t *testing.T, actor *harness.Principal, proj *fixture.Project) []hook {
	t.Helper()
	res, err := actor.API.ListWebhooksWithResponse(t.Context(), &api.ListWebhooksParams{ProjectId: proj.ID})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "listing webhooks: %s", apierr.Body(res.Body))
	var out struct {
		Webhooks []hook `json:"webhooks"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &out))
	return out.Webhooks
}

func updateHook(t *testing.T, actor *harness.Principal, id string, body api.UpdateWebhookJSONRequestBody) *api.UpdateWebhookResponse {
	t.Helper()
	res, err := actor.API.UpdateWebhookWithResponse(t.Context(), id, body)
	require.NoError(t, err, "updating a webhook")
	return res
}

func disable(t *testing.T, proj *fixture.Project, id string) {
	t.Helper()
	res := updateHook(t, proj.Tenant().Admin, id, api.UpdateWebhookJSONRequestBody{IsDisabled: new(true)})
	require.Equalf(t, http.StatusOK, res.StatusCode(), "disabling webhook %s: %s", id, apierr.Body(res.Body))
}

func testHook(t *testing.T, actor *harness.Principal, id string) *api.TestWebhookResponse {
	t.Helper()
	res, err := actor.API.TestWebhookWithResponse(t.Context(), id)
	require.NoError(t, err, "testing a webhook")
	return res
}

// awaitRun waits for the delivery job to record an outcome. lastStatus is written
// only after every hook in the job was called.
func awaitRun(t *testing.T, proj *fixture.Project, id string) hook {
	t.Helper()
	got, err := wait.For(t.Context(), func(ctx context.Context) (hook, bool, error) {
		res, err := proj.Tenant().Admin.API.GetWebhookByIdWithResponse(ctx, id)
		if err != nil || res.StatusCode() != http.StatusOK {
			return hook{}, false, err
		}
		h := decodeHook(t, res.Body)
		return h, h.LastStatus != nil, nil
	})
	require.NoError(t, err, "waiting for the webhook to record a run")
	return got
}

// generalPayload is the body of a general webhook.
type generalPayload struct {
	Event     string `json:"event"`
	Timestamp int64  `json:"timestamp"`
	Project   struct {
		WorkspaceID        string `json:"workspaceId"`
		ProjectID          string `json:"projectId"`
		ProjectName        string `json:"projectName"`
		Environment        string `json:"environment"`
		EnvironmentName    string `json:"environmentName"`
		SecretPath         string `json:"secretPath"`
		ChangedBy          string `json:"changedBy"`
		ChangedByActorType string `json:"changedByActorType"`
	} `json:"project"`
}

func decodeGeneral(t *testing.T, d webhook.Delivery) generalPayload {
	t.Helper()
	var p generalPayload
	require.NoErrorf(t, d.Decode(&p), "decoding a delivery: %s", d.Body)
	return p
}

// event matches a delivery of one event type.
func event(name string) func(webhook.DeliveryReceived) bool {
	return func(e webhook.DeliveryReceived) bool {
		var p struct {
			Event string `json:"event"`
		}
		return e.Decode(&p) == nil && p.Event == name
	}
}
