package alerts_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// certManagerAlerts lists the alerts covering the whole of Certificate Manager.
func certManagerAlerts(t *testing.T, tn *harness.Tenant) []uuid.UUID {
	t.Helper()
	res, err := tn.Admin.API.ListAlertsWithResponse(t.Context(), &api.ListAlertsParams{ResourceType: certManagerResource})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing alerts returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	out := []uuid.UUID{}
	for _, a := range res.JSON200.Alerts {
		out = append(out, a.Id)
	}
	return out
}

func TestCertificateAlert_Manage(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should read back every edited field", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		first, second := pki.NewApplication(t, proj), pki.NewApplication(t, proj)
		before := fixture.NewWebhookSink(t, tn, webhook.Service)
		after := fixture.NewWebhookSink(t, tn, webhook.Service)
		alertID := fixture.NewCertificateExpiryAlert(t, tn.Admin, first.ID, "14d", before.URL)
		channelID := requireAlert(t, tn.Admin, alertID).JSON200.Alert.Channels[0].Id
		raw, err := json.Marshal(map[string]any{
			"name":        "renamed",
			"description": "edited",
			"enabled":     false,
			"condition":   map[string]any{"alertBefore": "30d", "applicationIds": []string{second.ID.String()}},
			"channels": []map[string]any{{
				"id": channelID, "name": "renamed-hook", "channelType": "webhook", "config": map[string]any{"url": after.URL},
			}},
		})
		require.NoError(t, err)

		// Action
		res, err := tn.Admin.API.UpdateAlertWithBodyWithResponse(t.Context(), alertID, "application/json", bytes.NewReader(raw))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "updating the alert: %s", apierr.Body(res.Body))
		got := requireAlert(t, tn.Admin, alertID).JSON200.Alert
		require.Equal(t, "renamed", got.Name)
		require.Equal(t, new("edited"), got.Description)
		require.False(t, got.Enabled)
		require.Equal(t, map[string]any{"alertBefore": "30d", "applicationIds": []any{second.ID.String()}}, got.Condition)
		require.Len(t, got.Channels, 1)
		require.Equal(t, "renamed-hook", got.Channels[0].Name)
		require.Equal(t, after.URL, got.Channels[0].Config["url"])
	})

	t.Run("should read back a Slack channel without its webhook URL", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		app := pki.NewApplication(t, pki.CertManager(t, tn))
		slack := fixture.NewWebhookSink(t, tn, webhook.Slack)
		alertID := fixture.NewAlert(t, tn.Admin, map[string]any{
			"name": "issued", "resourceType": certManagerResource, "eventType": certManagerIssuance,
			"condition": map[string]any{"applicationIds": []string{app.ID.String()}},
			"channels":  []map[string]any{{"name": "slack", "channelType": "slack", "config": map[string]any{"webhookUrl": slack.URL}}},
		})

		// Action
		res := requireAlert(t, tn.Admin, alertID)

		// Assert
		require.NotContains(t, string(res.Body), slack.URL)
		require.Len(t, res.JSON200.Alert.Channels, 1)
		config := res.JSON200.Alert.Channels[0].Config
		require.NotContains(t, config, "webhookUrl")
		require.Equal(t, true, config["hasWebhookUrl"])
	})

	t.Run("should remove a deleted alert from reads and lists", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		app := pki.NewApplication(t, pki.CertManager(t, tn))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		deleted := fixture.NewCertificateExpiryAlert(t, tn.Admin, app.ID, "14d", sink.URL)
		kept := fixture.NewAlert(t, tn.Admin, map[string]any{
			"name": "issued", "resourceType": certManagerResource, "eventType": certManagerIssuance,
			"channels": []map[string]any{fixture.WebhookChannel(sink.URL)},
		})

		// Action
		res, err := tn.Admin.API.DeleteAlertWithResponse(t.Context(), deleted)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the alert: %s", apierr.Body(res.Body))
		requireNoAlert(t, tn.Admin, deleted)
		require.Equal(t, []uuid.UUID{kept}, certManagerAlerts(t, tn))
	})

	t.Run("should refuse another organization's read without the alert's details", func(t *testing.T) {
		t.Parallel()

		// Setup
		owner, other := h.NewTenant(t), h.NewTenant(t)
		app := pki.NewApplication(t, pki.CertManager(t, owner))
		sink := fixture.NewWebhookSink(t, owner, webhook.Service)
		alertID := fixture.NewCertificateExpiryAlert(t, owner.Admin, app.ID, "14d", sink.URL)
		name := requireAlert(t, owner.Admin, alertID).JSON200.Alert.Name

		// Action
		res := readAlert(t, other.Admin, alertID)

		// Assert
		require.Containsf(t, []int{http.StatusForbidden, http.StatusNotFound}, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.NotContains(t, string(res.Body), name)
	})

	t.Run("should refuse another organization's delete and keep the alert", func(t *testing.T) {
		t.Parallel()

		// Setup
		owner, other := h.NewTenant(t), h.NewTenant(t)
		app := pki.NewApplication(t, pki.CertManager(t, owner))
		sink := fixture.NewWebhookSink(t, owner, webhook.Service)
		alertID := fixture.NewCertificateExpiryAlert(t, owner.Admin, app.ID, "14d", sink.URL)

		// Action
		res, err := other.Admin.API.DeleteAlertWithResponse(t.Context(), alertID)

		// Assert
		require.NoError(t, err)
		require.Containsf(t, []int{http.StatusForbidden, http.StatusNotFound}, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		requireAlert(t, owner.Admin, alertID)
	})

	t.Run("should refuse another organization's update and keep the alert's name", func(t *testing.T) {
		t.Parallel()

		// Setup
		owner, other := h.NewTenant(t), h.NewTenant(t)
		app := pki.NewApplication(t, pki.CertManager(t, owner))
		sink := fixture.NewWebhookSink(t, owner, webhook.Service)
		alertID := fixture.NewCertificateExpiryAlert(t, owner.Admin, app.ID, "14d", sink.URL)
		name := requireAlert(t, owner.Admin, alertID).JSON200.Alert.Name

		// Action
		res, err := other.Admin.API.UpdateAlertWithBodyWithResponse(t.Context(), alertID, "application/json", strings.NewReader(`{"name": "renamed"}`))

		// Assert
		require.NoError(t, err)
		require.Containsf(t, []int{http.StatusForbidden, http.StatusNotFound}, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, name, requireAlert(t, owner.Admin, alertID).JSON200.Alert.Name)
	})

	t.Run("should refuse an application auditor's update and keep the alert's name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		app := pki.NewApplication(t, pki.CertManager(t, tn))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		alertID := applicationIssuanceAlert(t, tn.Admin, app, sink.URL)
		auditor := pki.NewMember(t, app, "auditor", "auditor")
		name := requireAlert(t, auditor, alertID).JSON200.Alert.Name

		// Action
		res, err := auditor.API.UpdateAlertWithBodyWithResponse(t.Context(), alertID, "application/json", strings.NewReader(`{"name": "renamed"}`))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, name, requireAlert(t, tn.Admin, alertID).JSON200.Alert.Name)
	})

	t.Run("should refuse an application auditor's delete and keep the alert", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		app := pki.NewApplication(t, pki.CertManager(t, tn))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		alertID := applicationIssuanceAlert(t, tn.Admin, app, sink.URL)
		auditor := pki.NewMember(t, app, "auditor", "auditor")
		requireAlert(t, auditor, alertID)

		// Action
		res, err := auditor.API.DeleteAlertWithResponse(t.Context(), alertID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		requireAlert(t, tn.Admin, alertID)
	})
}

func TestCertificateAlert_KnownIssues(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should answer another organization's alert id with the same 404 as an unknown id", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] Another organization's alert id answers 403 naming the project, while an
			unknown id answers 404, which tells a caller the id exists.`)

		operations := []struct {
			name string
			call func(t *testing.T, caller *harness.Principal, id uuid.UUID) (int, []byte)
		}{
			{"read", func(t *testing.T, caller *harness.Principal, id uuid.UUID) (int, []byte) {
				res := readAlert(t, caller, id)
				return res.StatusCode(), res.Body
			}},
			{"update", func(t *testing.T, caller *harness.Principal, id uuid.UUID) (int, []byte) {
				res, err := caller.API.UpdateAlertWithBodyWithResponse(t.Context(), id, "application/json", strings.NewReader(`{"name": "renamed"}`))
				require.NoError(t, err)
				return res.StatusCode(), res.Body
			}},
			{"delete", func(t *testing.T, caller *harness.Principal, id uuid.UUID) (int, []byte) {
				res, err := caller.API.DeleteAlertWithResponse(t.Context(), id)
				require.NoError(t, err)
				return res.StatusCode(), res.Body
			}},
		}

		for _, op := range operations {
			t.Run(op.name, func(t *testing.T) {
				t.Parallel()

				// Setup
				owner, other := h.NewTenant(t), h.NewTenant(t)
				app := pki.NewApplication(t, pki.CertManager(t, owner))
				sink := fixture.NewWebhookSink(t, owner, webhook.Service)
				alertID := fixture.NewCertificateExpiryAlert(t, owner.Admin, app.ID, "14d", sink.URL)
				name := requireAlert(t, owner.Admin, alertID).JSON200.Alert.Name
				unknownID := uuid.New()

				// Action
				crossStatus, crossBody := op.call(t, other.Admin, alertID)
				unknownStatus, unknownBody := op.call(t, other.Admin, unknownID)

				// Assert
				require.Equalf(t, http.StatusNotFound, crossStatus, "answered: %s", apierr.Body(crossBody))
				require.Equalf(t, http.StatusNotFound, unknownStatus, "answered: %s", apierr.Body(unknownBody))
				require.Equal(t, apierr.Public(t, bytes.ReplaceAll(unknownBody, []byte(unknownID.String()), []byte(alertID.String()))),
					apierr.Public(t, crossBody))
				require.Equal(t, name, requireAlert(t, owner.Admin, alertID).JSON200.Alert.Name)
			})
		}
	})
}
