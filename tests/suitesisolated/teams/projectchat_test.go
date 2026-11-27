package teams_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/azure"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

type teamsChannels struct {
	TeamID     string   `json:"teamId"`
	ChannelIDs []string `json:"channelIds"`
}

type teamsSettings struct {
	Integration                        string         `json:"integration"`
	IntegrationID                      string         `json:"integrationId"`
	ID                                 string         `json:"id,omitempty"`
	IsAccessRequestNotificationEnabled bool           `json:"isAccessRequestNotificationEnabled"`
	AccessRequestChannels              *teamsChannels `json:"accessRequestChannels,omitempty"`
	IsSecretRequestNotificationEnabled bool           `json:"isSecretRequestNotificationEnabled"`
	SecretRequestChannels              *teamsChannels `json:"secretRequestChannels,omitempty"`
}

func projectTeamsPath(proj *fixture.Project) string {
	return "/api/v1/projects/" + proj.ID + "/workflow-integration"
}

func saveTeamsSettings(t *testing.T, tn *harness.Tenant, proj *fixture.Project, in teamsSettings) fixture.RawResponse {
	t.Helper()
	in.Integration = "microsoft-teams"
	return fixture.RawCall(t, tn.Admin.API, http.MethodPut, projectTeamsPath(proj), in)
}

// installedTeams is a Teams integration in the tenant that is installed in a Microsoft tenant
// holding one team with one channel.
func installedTeams(t *testing.T, tn *harness.Tenant, channelID string) (integrationID string) {
	t.Helper()
	tenant := newTeamsTenant(t, tn)
	tenant.graph.Seed(t,
		azure.WithApp(catalogAppID, teamsBotID),
		azure.WithTeam(azure.Team{
			ID: "team-eng", DisplayName: "Engineering", InstalledApps: []string{catalogAppID},
			Channels: []azure.Channel{{ID: channelID, DisplayName: "Alerts"}},
		}),
	)
	slug := "teams-" + id.Short()
	require.Equal(t, http.StatusOK, completeTeams(t, tn, tenant.id, slug, "code-"+id.Short()).Status)
	return fixture.WorkflowIntegrationBySlug(t, tn, slug).ID
}

func TestProjectTeamsSettings(t *testing.T) {
	h := harness.From(t)
	configureTeams(t, h)

	t.Run("should save Teams settings with an installed integration and read them back", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		channel := "19:" + id.Short() + "@thread.tacv2"
		integrationID := installedTeams(t, tn, channel)
		want := teamsSettings{
			IntegrationID:                      integrationID,
			IsAccessRequestNotificationEnabled: true,
			AccessRequestChannels:              &teamsChannels{TeamID: "team-eng", ChannelIDs: []string{channel}},
		}

		// Action
		saved := saveTeamsSettings(t, tn, proj, want)

		// Assert
		require.Equal(t, http.StatusOK, saved.Status, apierr.Body(saved.Body))
		got := fixture.RawCall(t, tn.Admin.API, http.MethodGet, projectTeamsPath(proj)+"-config/microsoft-teams", nil)
		require.Equal(t, http.StatusOK, got.Status, apierr.Body(got.Body))
		var read teamsSettings
		require.NoError(t, json.Unmarshal(got.Body, &read))
		require.NotEmpty(t, read.ID)
		want.Integration, want.ID = "microsoft-teams", read.ID
		want.SecretRequestChannels = &teamsChannels{}
		require.Equal(t, want, read)
	})

	t.Run("should refuse a Teams integration that is not installed and save nothing", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		tenant := newTeamsTenant(t, tn)
		slug := "teams-" + id.Short()
		require.Equal(t, http.StatusOK, completeTeams(t, tn, tenant.id, slug, "code-"+id.Short()).Status)
		pending := fixture.WorkflowIntegrationBySlug(t, tn, slug)
		require.Equal(t, "pending", pending.Status)

		// Action
		res := saveTeamsSettings(t, tn, proj, teamsSettings{
			IntegrationID:                      pending.ID,
			IsAccessRequestNotificationEnabled: true,
			AccessRequestChannels:              &teamsChannels{TeamID: "team-eng", ChannelIDs: []string{"19:x@thread.tacv2"}},
		})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.Status, apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "Microsoft Teams integration is not properly installed in your tenant.")
		got := fixture.RawCall(t, tn.Admin.API, http.MethodGet, projectTeamsPath(proj)+"-config/microsoft-teams", nil)
		require.Equal(t, http.StatusNotFound, got.Status, apierr.Body(got.Body))
	})
}

func TestProjectTeamsNotification(t *testing.T) {
	h := harness.From(t)
	configureTeams(t, h)

	t.Run("should post an adaptive card to the configured channel when a secret access request opens", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		proj.NewRole(t, "requester", fixture.Permission{Subject: "secret-folders", Action: []string{"read"}})
		requester := proj.NewUser(t, fixture.WithPrincipalName("requester"), fixture.WithRoles("requester"))
		approver := proj.NewUser(t, fixture.WithPrincipalName("approver"))
		policy, err := tn.Admin.API.CreateAccessApprovalPolicyWithBodyWithResponse(t.Context(), "application/json",
			jsonBody(t, map[string]any{
				"projectSlug": proj.Slug, "environment": "dev", "secretPath": "/app", "approvals": 1,
				"approvers": []map[string]any{{"type": "user", "id": approver.ID.String()}},
			}))
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, policy.StatusCode(), policy.Body)
		channel := "19:" + id.Short() + "@thread.tacv2"
		saved := saveTeamsSettings(t, tn, proj, teamsSettings{
			IntegrationID:                      installedTeams(t, tn, channel),
			IsAccessRequestNotificationEnabled: true,
			AccessRequestChannels:              &teamsChannels{TeamID: "team-eng", ChannelIDs: []string{channel}},
		})
		require.Equal(t, http.StatusOK, saved.Status, apierr.Body(saved.Body))
		admin := fixture.FakenetAdmin(t, tn)
		fakenet.Track(t, admin, azure.BotConnector.Host(), teamsAppID)
		bot := azure.OpenBot(t, admin, teamsAppID)

		// Action
		opened, err := requester.API.CreateAccessApprovalRequestWithBodyWithResponse(t.Context(),
			&api.CreateAccessApprovalRequestParams{ProjectSlug: proj.Slug}, "application/json", jsonBody(t, map[string]any{
				"isTemporary": false,
				"permissions": []any{[]any{"read", "secrets", map[string]any{
					"environment": "dev", "secretPath": map[string]any{"$glob": "/app"},
				}}},
			}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, opened.StatusCode(), opened.Body)
		bot.ExpectEvent[azure.ActivityPosted](t, func(e azure.ActivityPosted) bool { return e.ConversationID == channel })
		activities := bot.ActivitiesIn(t, channel)
		require.Len(t, activities, 1)
		require.Equal(t, "message", activities[0].Type)
		require.Len(t, activities[0].Attachments, 1)
		require.Equal(t, "application/vnd.microsoft.card.adaptive", activities[0].Attachments[0].ContentType)
	})
}

func jsonBody(t *testing.T, v any) *bytes.Reader {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return bytes.NewReader(raw)
}
