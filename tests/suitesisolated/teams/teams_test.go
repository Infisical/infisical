package teams_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/azure"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const (
	teamsBase     = "/api/v1/workflow-integrations/microsoft-teams"
	teamsAppID    = "6f0e9a4c-2b7d-4c3e-8a51-0d9c1b2e3f40"
	teamsBotID    = "a3c1f7d2-5e84-4b69-9f10-7c2d8e4b6a11"
	catalogAppID  = "b8d2e6f1-3a47-4d95-8c20-1e5f9a7b3c62"
	teamsRedirect = "https://app.example.test/organizations/teams-callback"
)

func TestMicrosoftTeamsIntegration_Create(t *testing.T) {
	h := harness.From(t)
	configureTeams(t, h)

	t.Run("should serve the configured app's client id", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.GetMicrosoftTeamsClientIdWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, teamsAppID, res.JSON200.ClientId)
	})

	t.Run("should create an installed Teams integration when the bot is already in the tenant", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		tenant := newTeamsTenant(t, tn)
		tenant.graph.Seed(t, azure.WithApp(catalogAppID, teamsBotID))
		slug := "teams-" + id.Short()

		// Action
		res := completeTeams(t, tn, tenant.id, slug, "code-"+id.Short())

		// Assert
		require.Equal(t, http.StatusOK, res.Status, apierr.Body(res.Body))
		listed, err := tn.Admin.API.ListMicrosoftTeamsIntegrationsWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, listed.StatusCode(), listed.Body)
		require.Len(t, *listed.JSON200, 1)
		require.Equal(t, slug, (*listed.JSON200)[0].Slug)
		require.Equal(t, tenant.id, (*listed.JSON200)[0].TenantId)
		require.Equal(t, "installed", string((*listed.JSON200)[0].Status))
	})

	t.Run("should create a pending Teams integration, and install it once the bot is in the tenant", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		tenant := newTeamsTenant(t, tn)
		slug := "teams-" + id.Short()
		require.Equal(t, http.StatusOK, completeTeams(t, tn, tenant.id, slug, "code-"+id.Short()).Status)
		created := fixture.WorkflowIntegrationBySlug(t, tn, slug)
		require.NotNil(t, created)
		require.Equal(t, "pending", created.Status)
		before := fixture.RawCall(t, tn.Admin.API, http.MethodPost, teamsBase+"/"+created.ID+"/installation-status", nil)
		tenant.graph.Seed(t, azure.WithApp(catalogAppID, teamsBotID))

		// Action
		after := fixture.RawCall(t, tn.Admin.API, http.MethodPost, teamsBase+"/"+created.ID+"/installation-status", nil)

		// Assert
		require.Equal(t, http.StatusBadRequest, before.Status, apierr.Body(before.Body))
		require.Contains(t, string(before.Body), "Microsoft Teams bot is not installed in the configured Microsoft Teams Tenant")
		require.Equal(t, http.StatusOK, after.Status, apierr.Body(after.Body))
		require.Equal(t, "installed", fixture.WorkflowIntegrationBySlug(t, tn, slug).Status)
		listed, err := tn.Admin.API.ListMicrosoftTeamsIntegrationsWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, listed.StatusCode(), listed.Body)
		require.Len(t, *listed.JSON200, 1)
	})

	t.Run("should list only installed Teams integrations when another is still pending", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		installed := newTeamsTenant(t, tn)
		installed.graph.Seed(t, azure.WithApp(catalogAppID, teamsBotID))
		waiting := newTeamsTenant(t, tn)
		installedSlug, pendingSlug := "teams-a-"+id.Short(), "teams-b-"+id.Short()
		require.Equal(t, http.StatusOK, completeTeams(t, tn, installed.id, installedSlug, "code-"+id.Short()).Status)
		require.Equal(t, http.StatusOK, completeTeams(t, tn, waiting.id, pendingSlug, "code-"+id.Short()).Status)

		// Action
		listed, err := tn.Admin.API.ListMicrosoftTeamsIntegrationsWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, listed.StatusCode(), listed.Body)
		require.Len(t, *listed.JSON200, 1)
		require.Equal(t, installedSlug, (*listed.JSON200)[0].Slug)
		require.Len(t, fixture.WorkflowIntegrations(t, tn), 2)
	})

	t.Run("should refuse and create nothing when the tenant has not granted consent", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		tenant := newTeamsTenant(t, tn)
		tenant.login.Seed(t, azure.WithConsentRequired(true))

		// Action
		res := completeTeams(t, tn, tenant.id, "teams-"+id.Short(), "code-"+id.Short())

		// Assert
		require.Equal(t, http.StatusBadRequest, res.Status, apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "Unable to verify tenant, please ensure that you have granted admin consent.")
		require.Empty(t, fixture.WorkflowIntegrations(t, tn))
	})

	t.Run("should refuse and create nothing when the consent code was issued by another tenant", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		tenant := newTeamsTenant(t, tn)
		foreign := uuid.NewString()
		code := "code-" + id.Short()
		tenant.login.Seed(t, azure.WithCode(code, foreign))

		// Action
		res := completeTeams(t, tn, tenant.id, "teams-"+id.Short(), code)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.Status, apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "Invalid authorization token tenant ID. Expected "+tenant.id+", got "+foreign)
		require.Empty(t, fixture.WorkflowIntegrations(t, tn))
	})

	t.Run("should refuse and create nothing when the application's own token belongs to another tenant", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		tenant := newTeamsTenant(t, tn)
		foreign := uuid.NewString()
		tenant.login.Seed(t, azure.WithAppTenant(foreign))

		// Action
		res := completeTeams(t, tn, tenant.id, "teams-"+id.Short(), "code-"+id.Short())

		// Assert
		require.Equal(t, http.StatusBadRequest, res.Status, apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "Invalid application token tenant ID. Expected "+tenant.id+", got "+foreign)
		require.Empty(t, fixture.WorkflowIntegrations(t, tn))
	})
}

func TestMicrosoftTeamsIntegration_ListTeams(t *testing.T) {
	h := harness.From(t)
	configureTeams(t, h)

	t.Run("should list the teams the app is installed in with their channels", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		tenant := newTeamsTenant(t, tn)
		tenant.graph.Seed(t,
			azure.WithApp(catalogAppID, teamsBotID),
			azure.WithTeam(azure.Team{
				ID: "team-eng", DisplayName: "Engineering", InstalledApps: []string{catalogAppID},
				Channels: []azure.Channel{
					{ID: "19:general@thread.tacv2", DisplayName: "General"},
					{ID: "19:alerts@thread.tacv2", DisplayName: "Alerts"},
				},
			}),
			azure.WithTeam(azure.Team{
				ID: "team-sales", DisplayName: "Sales",
				Channels: []azure.Channel{{ID: "19:deals@thread.tacv2", DisplayName: "Deals"}},
			}),
		)
		slug := "teams-" + id.Short()
		require.Equal(t, http.StatusOK, completeTeams(t, tn, tenant.id, slug, "code-"+id.Short()).Status)
		integrationID := fixture.WorkflowIntegrationBySlug(t, tn, slug).ID

		// Action
		res := fixture.RawCall(t, tn.Admin.API, http.MethodGet, teamsBase+"/"+integrationID+"/teams", nil)

		// Assert
		require.Equal(t, http.StatusOK, res.Status, apierr.Body(res.Body))
		type channel struct {
			ChannelName string `json:"channelName"`
			ChannelID   string `json:"channelId"`
		}
		type team struct {
			TeamID   string    `json:"teamId"`
			TeamName string    `json:"teamName"`
			Channels []channel `json:"channels"`
		}
		var teams []team
		require.NoError(t, json.Unmarshal(res.Body, &teams))
		require.Equal(t, []team{{
			TeamID: "team-eng", TeamName: "Engineering",
			Channels: []channel{
				{ChannelName: "General", ChannelID: "19:general@thread.tacv2"},
				{ChannelName: "Alerts", ChannelID: "19:alerts@thread.tacv2"},
			},
		}}, teams)
	})
}

type teamsTenant struct {
	id    string
	login *azure.ControlPlane
	graph *azure.GraphControlPlane
}

// newTeamsTenant is a Microsoft tenant of its own: its token endpoint and its Graph
// directory.
func newTeamsTenant(t *testing.T, tn *harness.Tenant) teamsTenant {
	t.Helper()
	admin := fixture.FakenetAdmin(t, tn)
	tenantID := uuid.NewString()
	return teamsTenant{id: tenantID, login: azure.Open(t, admin, tenantID), graph: azure.OpenGraph(t, admin, tenantID)}
}

// configureTeams gives the instance a Teams app and bot.
func configureTeams(t *testing.T, h *harness.Stack) {
	t.Helper()
	res, err := h.InstanceAdmin(t).API.UpdateAdminConfigWithResponse(t.Context(), api.UpdateAdminConfigJSONRequestBody{
		MicrosoftTeamsAppId:        new(teamsAppID),
		MicrosoftTeamsClientSecret: new("harness-teams-secret"),
		MicrosoftTeamsBotId:        new(teamsBotID),
	})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
}

// completeTeams is the admin finishing the consent flow for the tenant.
func completeTeams(t *testing.T, tn *harness.Tenant, tenantID, slug, code string) fixture.RawResponse {
	t.Helper()
	return fixture.RawCall(t, tn.Admin.API, http.MethodPost, teamsBase, map[string]any{
		"redirectUri": teamsRedirect,
		"tenantId":    tenantID,
		"slug":        slug,
		"code":        code,
	})
}

func requireStatus(t *testing.T, want, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "answered %d: %s", got, apierr.Body(body))
}
