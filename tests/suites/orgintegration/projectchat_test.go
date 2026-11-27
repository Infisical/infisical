package orgintegration_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/slack"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

// slackSettings is a project's Slack settings as the settings form sends and reads them.
type slackSettings struct {
	Integration                          string `json:"integration"`
	IntegrationID                        string `json:"integrationId"`
	ID                                   string `json:"id,omitempty"`
	IsAccessRequestNotificationEnabled   bool   `json:"isAccessRequestNotificationEnabled"`
	AccessRequestChannels                string `json:"accessRequestChannels"`
	IsSecretRequestNotificationEnabled   bool   `json:"isSecretRequestNotificationEnabled"`
	SecretRequestChannels                string `json:"secretRequestChannels"`
	IsSecretSyncErrorNotificationEnabled bool   `json:"isSecretSyncErrorNotificationEnabled"`
	SecretSyncErrorChannels              string `json:"secretSyncErrorChannels"`
}

func slackSettingsFor(integrationID, accessChannels string) slackSettings {
	return slackSettings{
		Integration:                        "slack",
		IntegrationID:                      integrationID,
		IsAccessRequestNotificationEnabled: true,
		AccessRequestChannels:              accessChannels,
		SecretRequestChannels:              "C0SECRETS1",
		SecretSyncErrorChannels:            "C0SYNCERR1",
	}
}

func projectSettingsPath(proj *fixture.Project) string {
	return "/api/v1/projects/" + proj.ID + "/workflow-integration"
}

func saveSlackSettings(t *testing.T, tn *harness.Tenant, proj *fixture.Project, in slackSettings) fixture.RawResponse {
	t.Helper()
	return fixture.RawCall(t, tn.Admin.API, http.MethodPut, projectSettingsPath(proj), in)
}

func readSlackSettings(t *testing.T, tn *harness.Tenant, proj *fixture.Project) fixture.RawResponse {
	t.Helper()
	return fixture.RawCall(t, tn.Admin.API, http.MethodGet, projectSettingsPath(proj)+"-config/slack", nil)
}

func decodeSlackSettings(t *testing.T, res fixture.RawResponse) slackSettings {
	t.Helper()
	var out slackSettings
	require.NoError(t, json.Unmarshal(res.Body, &out), string(res.Body))
	return out
}

func requireNoSlackSettings(t *testing.T, tn *harness.Tenant, proj *fixture.Project) {
	t.Helper()
	got := readSlackSettings(t, tn, proj)
	require.Equal(t, http.StatusNotFound, got.Status, string(got.Body))
	require.Contains(t, string(got.Body), "Workflow integration config for project '"+proj.ID+"' and integration 'slack' not found")
}

func TestProjectSlackSettings(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should save a project's Slack settings and read them back", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		integrationID, _ := installSlack(t, tn, "alerts-"+id.Short(), "Acme "+id.Short())
		want := slackSettingsFor(integrationID, "C0ACCESS1,  C0ACCESS2")
		want.IsSecretSyncErrorNotificationEnabled = true

		// Action
		saved := saveSlackSettings(t, tn, proj, want)

		// Assert
		require.Equal(t, http.StatusOK, saved.Status, string(saved.Body))
		got := readSlackSettings(t, tn, proj)
		require.Equal(t, http.StatusOK, got.Status, string(got.Body))
		read := decodeSlackSettings(t, got)
		require.NotEmpty(t, read.ID)
		want.ID = read.ID
		want.AccessRequestChannels = "C0ACCESS1, C0ACCESS2"
		require.Equal(t, want, read)
		require.Equal(t, want, decodeSlackSettings(t, saved))
	})

	t.Run("should replace the settings on a second save", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		first, _ := installSlack(t, tn, "alerts-"+id.Short(), "Acme "+id.Short())
		second, _ := installSlack(t, tn, "paging-"+id.Short(), "Beta "+id.Short())
		firstSaved := saveSlackSettings(t, tn, proj, slackSettingsFor(first, "C0ACCESS1"))
		require.Equal(t, http.StatusOK, firstSaved.Status, string(firstSaved.Body))
		replacement := slackSettingsFor(second, "C0OTHER001")
		replacement.IsAccessRequestNotificationEnabled = false

		// Action
		saved := saveSlackSettings(t, tn, proj, replacement)

		// Assert
		require.Equal(t, http.StatusOK, saved.Status, string(saved.Body))
		read := decodeSlackSettings(t, readSlackSettings(t, tn, proj))
		require.Equal(t, second, read.IntegrationID)
		require.Equal(t, "C0OTHER001", read.AccessRequestChannels)
		require.False(t, read.IsAccessRequestNotificationEnabled)
		require.Equal(t, decodeSlackSettings(t, firstSaved).ID, read.ID, "a project holds one config, updated in place")
	})

	t.Run("should refuse a Slack integration of another organization and save nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		other := h.NewTenant(t)
		foreign, _ := installSlack(t, other, "alerts-"+id.Short(), "Acme "+id.Short())

		// Action
		res := saveSlackSettings(t, tn, proj, slackSettingsFor(foreign, "C0ACCESS1"))

		// Assert
		require.Equal(t, http.StatusForbidden, res.Status, string(res.Body))
		require.Contains(t, string(res.Body), "Selected slack integration is not in the same organization")
		requireNoSlackSettings(t, tn, proj)
	})

	t.Run("should refuse more than 20 channels and save nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		integrationID, _ := installSlack(t, tn, "alerts-"+id.Short(), "Acme "+id.Short())
		channels := make([]string, 21)
		for i := range channels {
			channels[i] = "C0CHAN" + strings.Repeat("0", 2) + string(rune('A'+i))
		}

		// Action
		res := saveSlackSettings(t, tn, proj, slackSettingsFor(integrationID, strings.Join(channels, ",")))

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, res.Status, string(res.Body))
		require.Contains(t, string(res.Body), "You can only select up to 20 slack channels")
		requireNoSlackSettings(t, tn, proj)
	})

	t.Run("should delete the project's Slack settings", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		integrationID, _ := installSlack(t, tn, "alerts-"+id.Short(), "Acme "+id.Short())
		saved := saveSlackSettings(t, tn, proj, slackSettingsFor(integrationID, "C0ACCESS1"))
		require.Equal(t, http.StatusOK, saved.Status, string(saved.Body))

		// Action
		res := fixture.RawCall(t, tn.Admin.API, http.MethodDelete, projectSettingsPath(proj)+"/slack/"+integrationID, nil)

		// Assert
		require.Equal(t, http.StatusOK, res.Status, string(res.Body))
		var out struct {
			IntegrationConfig struct {
				ID string `json:"id"`
			} `json:"integrationConfig"`
		}
		require.NoError(t, json.Unmarshal(res.Body, &out))
		require.Equal(t, decodeSlackSettings(t, saved).ID, out.IntegrationConfig.ID)
		requireNoSlackSettings(t, tn, proj)
	})
}

type testSendResult struct {
	Success     bool   `json:"success"`
	DeliveredTo int    `json:"deliveredTo"`
	Error       string `json:"error"`
}

func TestAlertChannel_SlackTest(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	testSend := func(t *testing.T, tn *harness.Tenant, integrationID string, channel map[string]string) (int, testSendResult) {
		t.Helper()
		bot := tn.NewMachineIdentity(t)
		res := fixture.RawCall(t, tn.Admin.API, http.MethodPost, "/api/v1/alerts/channels/test", map[string]any{
			"resourceType": "identity.authentication",
			"resourceId":   bot.ID.String(),
			"channelType":  "slack-app",
			"config": map[string]any{
				"workflowIntegrationId": integrationID,
				"channels":              []map[string]string{channel},
			},
		})
		var out testSendResult
		require.NoError(t, json.Unmarshal(res.Body, &out), string(res.Body))
		return res.Status, out
	}

	t.Run("should post the test message to the workspace's channel", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		integrationID, ws := installSlack(t, tn, "alerts-"+id.Short(), "Acme "+id.Short(),
			slack.WithChannels(slack.Channel{ID: "C0ALERTS1", Name: "alerts"}))

		// Action
		status, out := testSend(t, tn, integrationID, map[string]string{"id": "C0ALERTS1", "name": "alerts"})

		// Assert
		require.Equal(t, http.StatusOK, status)
		require.True(t, out.Success, out.Error)
		require.Equal(t, 1, out.DeliveredTo)
		require.Len(t, ws.MessagesIn(t, "C0ALERTS1"), 1)
	})

	t.Run("should report that the app is not in the channel and post nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		integrationID, ws := installSlack(t, tn, "alerts-"+id.Short(), "Acme "+id.Short(),
			slack.WithChannels(slack.Channel{ID: "G0PRIVATE1", Name: "leadership", IsPrivate: true}))

		// Action
		status, out := testSend(t, tn, integrationID, map[string]string{"id": "G0PRIVATE1", "name": "leadership"})

		// Assert
		require.Equal(t, http.StatusOK, status)
		require.False(t, out.Success)
		require.Contains(t, out.Error, "The Infisical app isn't in #leadership. Add it to the channel in Slack, then try again.")
		ws.ExpectNoEvent[slack.MessagePosted](t, nil)
		require.Empty(t, ws.MessagesIn(t, "G0PRIVATE1"))
	})
}
