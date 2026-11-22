package webhooks_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestWebhook_Access(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse another tenant's hook on get, list, update, delete and test, and change nothing", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Refusal, not a status: get answers 404 and the other routes 403 today, and
			making them agree must not break this claim.`)

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		id := newHook(t, proj, sink.URL)
		outsider := h.NewTenant(t).Admin

		// Action
		got, err := outsider.API.GetWebhookByIdWithResponse(t.Context(), id)
		require.NoError(t, err)
		listed, err := outsider.API.ListWebhooksWithResponse(t.Context(), &api.ListWebhooksParams{ProjectId: proj.ID})
		require.NoError(t, err)
		updated := updateHook(t, outsider, id, api.UpdateWebhookJSONRequestBody{IsDisabled: new(true)})
		deleted, err := outsider.API.DeleteWebhookWithResponse(t.Context(), id)
		require.NoError(t, err)
		tested := testHook(t, outsider, id)

		// Assert
		for name, res := range map[string]struct {
			status int
			body   []byte
		}{
			"get":    {got.StatusCode(), got.Body},
			"list":   {listed.StatusCode(), listed.Body},
			"update": {updated.StatusCode(), updated.Body},
			"delete": {deleted.StatusCode(), deleted.Body},
			"test":   {tested.StatusCode(), tested.Body},
		} {
			require.GreaterOrEqualf(t, res.status, 400, "%s was accepted: %s", name, apierr.Body(res.body))
			require.NotContainsf(t, string(res.body), sink.URL, "%s revealed the hook's URL", name)
		}
		after := getHook(t, proj, id)
		require.False(t, after.IsDisabled)
		require.Nil(t, after.LastStatus)
		sink.ExpectNoEvent[webhook.DeliveryReceived](t, nil)
	})

	t.Run("should let a viewer list and read hooks but refuse create, update and delete", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		viewer := proj.NewUser(t, fixture.WithPrincipalName("viewer"), fixture.WithRoles("viewer"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		id := newHook(t, proj, sink.URL)
		other := fixture.NewWebhookSink(t, tn, webhook.Service)

		// Action
		listed := listHooks(t, viewer, proj)
		got, err := viewer.API.GetWebhookByIdWithResponse(t.Context(), id)
		require.NoError(t, err)
		created := createHook(t, proj, other.URL, createdBy(viewer))
		updated := updateHook(t, viewer, id, api.UpdateWebhookJSONRequestBody{IsDisabled: new(true)})
		deleted, err := viewer.API.DeleteWebhookWithResponse(t.Context(), id)
		require.NoError(t, err)

		// Assert
		require.Len(t, listed, 1)
		require.Equal(t, sink.URL, listed[0].URL)
		require.Equalf(t, http.StatusOK, got.StatusCode(), "%s", apierr.Body(got.Body))
		require.Equalf(t, http.StatusForbidden, created.StatusCode(), "%s", apierr.Body(created.Body))
		require.Equalf(t, http.StatusForbidden, updated.StatusCode(), "%s", apierr.Body(updated.Body))
		require.Equalf(t, http.StatusForbidden, deleted.StatusCode(), "%s", apierr.Body(deleted.Body))
		after := listHooks(t, tn.Admin, proj)
		require.Len(t, after, 1)
		require.False(t, after[0].IsDisabled)
	})
}
