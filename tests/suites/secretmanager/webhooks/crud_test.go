package webhooks_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestWebhook_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should store the path, environment and event filter and hide the secret key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)

		// Action
		res := createHook(t, proj, sink.URL, inEnv("staging"), atPath("/app/"), signedWith("signing-key"),
			onlyEvents(api.CreateWebhookJSONBodyEventsFilterEventNameSecretsModified))

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.NotContains(t, string(res.Body), "signing-key")
		got := getHook(t, proj, res.JSON200.Webhook.Id.String())
		require.Equal(t, "staging", got.Environment.Slug)
		require.Equal(t, "/app", got.SecretPath)
		require.Equal(t, sink.URL, got.URL)
		require.Equal(t, "general", got.Type)
		require.False(t, got.IsDisabled)
		require.Equal(t, []string{secretModified}, got.events())
	})

	t.Run("should refuse an unknown environment and create nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)

		// Action
		res := createHook(t, proj, sink.URL, inEnv("nope"))

		// Assert
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Equal(t, fmt.Sprintf("Environment with slug 'nope' in project with ID '%s' not found", proj.ID),
			errorMessage(t, res.Body))
		require.Empty(t, listHooks(t, tn.Admin, proj))
	})

	t.Run("should refuse a Slack hook whose host is not hooks.slack.com and create nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)

		// Action
		res := createHook(t, proj, sink.URL, slackType())

		// Assert
		require.Equalf(t, http.StatusUnprocessableEntity, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "Incoming Webhook URL is invalid.")
		require.Empty(t, listHooks(t, tn.Admin, proj))
	})

	t.Run("should accept a Slack hook on hooks.slack.com", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Slack)

		// Action
		res := createHook(t, proj, sink.URL, slackType())

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Equal(t, "slack", getHook(t, proj, res.JSON200.Webhook.Id.String()).Type)
	})
}

func TestWebhook_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should toggle disabled and replace the event filter", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		id := newHook(t, proj, sink.URL)
		filter := []struct {
			EventName api.UpdateWebhookJSONBodyEventsFilterEventName `json:"eventName"`
		}{{EventName: api.UpdateWebhookJSONBodyEventsFilterEventName("secrets.rotation-failed")}}

		// Action
		off := updateHook(t, tn.Admin, id, api.UpdateWebhookJSONRequestBody{IsDisabled: new(true), EventsFilter: &filter})
		offRead := getHook(t, proj, id)
		on := updateHook(t, tn.Admin, id, api.UpdateWebhookJSONRequestBody{IsDisabled: new(false), EventsFilter: new(filter[:0])})

		// Assert
		require.Equalf(t, http.StatusOK, off.StatusCode(), "%s", apierr.Body(off.Body))
		require.True(t, offRead.IsDisabled)
		require.Equal(t, []string{"secrets.rotation-failed"}, offRead.events())
		require.Equalf(t, http.StatusOK, on.StatusCode(), "%s", apierr.Body(on.Body))
		onRead := getHook(t, proj, id)
		require.False(t, onRead.IsDisabled)
		require.Empty(t, onRead.events())
	})

	t.Run("should refuse an update with no fields and change nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		id := newHook(t, proj, sink.URL)

		// Action
		res := updateHook(t, tn.Admin, id, api.UpdateWebhookJSONRequestBody{})

		// Assert
		require.Equalf(t, http.StatusUnprocessableEntity, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "At least one field is required")
		require.False(t, getHook(t, proj, id).IsDisabled)
	})
}

func TestWebhook_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return only the sanitized fields and remove the hook", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		id := newHook(t, proj, sink.URL, signedWith("signing-key"))

		// Action
		res, err := tn.Admin.API.DeleteWebhookWithResponse(t.Context(), id)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		var body struct {
			Webhook map[string]json.RawMessage `json:"webhook"`
		}
		require.NoError(t, json.Unmarshal(res.Body, &body))
		keys := make([]string, 0, len(body.Webhook))
		for k := range body.Webhook {
			keys = append(keys, k)
		}
		slices.Sort(keys)
		require.Equal(t, []string{
			"createdAt", "envId", "environment", "eventsFilter", "id", "isDisabled",
			"lastRunErrorMessage", "lastStatus", "projectId", "secretPath", "type", "updatedAt",
		}, keys, "an exact key set, so a new encrypted column cannot leak through this route unnoticed")
		require.Equal(t, `"`+id+`"`, string(body.Webhook["id"]))
		require.Empty(t, listHooks(t, tn.Admin, proj))
	})
}

func errorMessage(t *testing.T, body []byte) string {
	t.Helper()
	var out struct {
		Message string `json:"message"`
	}
	require.NoErrorf(t, json.Unmarshal(body, &out), "reading the error message: %s", apierr.Body(body))
	return out.Message
}
