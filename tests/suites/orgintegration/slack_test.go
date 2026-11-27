package orgintegration_test

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/slack"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const slackBase = "/api/v1/workflow-integrations/slack"

func TestSlackIntegration_Install(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should point the install URL at Slack's authorize page for the instance's app and Infisical's callback", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		raw := installURL(t, tn, "alerts-"+id.Short())

		// Assert
		u, err := url.Parse(raw)
		require.NoError(t, err)
		require.Equal(t, "slack.com", u.Host)
		require.Equal(t, "/oauth/v2/authorize", u.Path)
		require.Equal(t, slack.ClientID, u.Query().Get("client_id"))
		require.Equal(t, h.App().SiteURL()+slackBase+"/oauth_redirect", u.Query().Get("redirect_uri"))
		require.NotEmpty(t, u.Query().Get("state"))
	})

	t.Run("should create an installed Slack integration in the org when Slack redirects back with the install's code", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		slug := "alerts-" + id.Short()
		teamName := "Acme " + id.Short()
		ws := newWorkspace(t, tn, teamName)
		install := installURL(t, tn, slug)

		// Action
		res := redirectBack(t, tn, install, ws.Code)

		// Assert
		require.Equal(t, http.StatusFound, res.Status, string(res.Body))
		require.Equal(t, h.App().SiteURL()+"/organizations/"+tn.OrgID.String()+"/settings?selectedTab=workflow-integrations",
			res.Header.Get("Location"))
		slackList, err := tn.Admin.API.ListSlackIntegrationsWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, slackList.StatusCode(), slackList.Body)
		require.Len(t, *slackList.JSON200, 1)
		require.Equal(t, slug, (*slackList.JSON200)[0].Slug)
		require.Equal(t, teamName, (*slackList.JSON200)[0].TeamName)
		listed := fixture.WorkflowIntegrationBySlug(t, tn, slug)
		require.NotNil(t, listed)
		require.Equal(t, "slack", listed.Integration)
		require.Equal(t, "installed", listed.Status)
	})

	t.Run("should redirect to the site root and create nothing when Slack's code is invalid", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		install := installURL(t, tn, "alerts-"+id.Short())

		// Action
		res := redirectBack(t, tn, install, id.Nonce())

		// Assert
		require.Equal(t, http.StatusFound, res.Status, string(res.Body))
		require.Equal(t, h.App().SiteURL(), strings.TrimSuffix(res.Header.Get("Location"), "/"))
		require.Empty(t, fixture.WorkflowIntegrations(t, tn))
	})

	t.Run("should keep the integration's id and slug when it is reinstalled", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		slug := "alerts-" + id.Short()
		first, _ := installSlack(t, tn, slug, "Acme "+id.Short())
		newTeam := "Beta " + id.Short()
		second := newWorkspace(t, tn, newTeam)
		reinstall := fixture.RawCall(t, tn.Admin.API, http.MethodGet, slackBase+"/reinstall?id="+first, nil)
		require.Equal(t, http.StatusOK, reinstall.Status, string(reinstall.Body))

		// Action
		res := redirectBack(t, tn, urlFromBody(t, reinstall.Body), second.Code)

		// Assert
		require.Equal(t, http.StatusFound, res.Status, string(res.Body))
		got, err := tn.Admin.API.GetSlackIntegrationWithResponse(t.Context(), first)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, got.StatusCode(), got.Body)
		require.Equal(t, slug, got.JSON200.Slug)
		require.Equal(t, newTeam, got.JSON200.TeamName)
		require.Len(t, fixture.WorkflowIntegrations(t, tn), 1)
	})

	t.Run("should refuse a reinstall URL for an unknown integration, naming its id", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		unknown := uuid.NewString()

		// Action
		res := fixture.RawCall(t, tn.Admin.API, http.MethodGet, slackBase+"/reinstall?id="+unknown, nil)

		// Assert
		require.Equal(t, http.StatusNotFound, res.Status, string(res.Body))
		require.Contains(t, string(res.Body), "Slack integration with ID "+unknown+" not found")
	})
}

func TestSlackIntegration_Manage(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list the workspace's channels through the integration", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		integrationID, _ := installSlack(t, tn, "alerts-"+id.Short(), "Acme "+id.Short(),
			slack.WithChannels(
				slack.Channel{ID: "C0ALERTS1", Name: "alerts"},
				slack.Channel{ID: "C0OLDCHAN1", Name: "old-news", IsArchived: true},
				slack.Channel{ID: "G0PRIVATE1", Name: "leadership", IsPrivate: true, IsMember: true},
			))

		// Action
		res := fixture.RawCall(t, tn.Admin.API, http.MethodGet, slackBase+"/"+integrationID+"/channels", nil)

		// Assert
		require.Equal(t, http.StatusOK, res.Status, string(res.Body))
		var channels []struct {
			Name       string `json:"name"`
			ID         string `json:"id"`
			IsArchived bool   `json:"isArchived"`
		}
		require.NoError(t, json.Unmarshal(res.Body, &channels))
		require.ElementsMatch(t, []struct {
			Name       string `json:"name"`
			ID         string `json:"id"`
			IsArchived bool   `json:"isArchived"`
		}{
			{Name: "alerts", ID: "C0ALERTS1"},
			{Name: "old-news", ID: "C0OLDCHAN1", IsArchived: true},
			{Name: "leadership", ID: "G0PRIVATE1"},
		}, channels)
	})

	t.Run("should rename the integration and keep its other fields when a new slug and description are sent", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		teamName := "Acme " + id.Short()
		integrationID, _ := installSlack(t, tn, "alerts-"+id.Short(), teamName)
		renamed := "paging-" + id.Short()

		// Action
		res := fixture.RawCall(t, tn.Admin.API, http.MethodPatch, slackBase+"/"+integrationID,
			map[string]any{"slug": renamed, "description": "on-call pages"})

		// Assert
		require.Equal(t, http.StatusOK, res.Status, string(res.Body))
		got, err := tn.Admin.API.GetSlackIntegrationWithResponse(t.Context(), integrationID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, got.StatusCode(), got.Body)
		require.Equal(t, renamed, got.JSON200.Slug)
		require.Equal(t, "on-call pages", *got.JSON200.Description)
		require.Equal(t, teamName, got.JSON200.TeamName)
	})

	t.Run("should refuse renaming to a slug another integration of the org has, and keep the name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		taken := "alerts-" + id.Short()
		mine := "paging-" + id.Short()
		installSlack(t, tn, taken, "Acme "+id.Short())
		integrationID, _ := installSlack(t, tn, mine, "Beta "+id.Short())

		// Action
		res := fixture.RawCall(t, tn.Admin.API, http.MethodPatch, slackBase+"/"+integrationID, map[string]any{"slug": taken})

		// Assert
		require.Equal(t, http.StatusConflict, res.Status, string(res.Body))
		require.Contains(t, string(res.Body), "A workflow integration with the slug '"+taken+"' already exists in this organization.")
		got, err := tn.Admin.API.GetSlackIntegrationWithResponse(t.Context(), integrationID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, got.StatusCode(), got.Body)
		require.Equal(t, mine, got.JSON200.Slug)
	})

	t.Run("should refuse another organization's admin reading the integration", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		integrationID, _ := installSlack(t, tn, "alerts-"+id.Short(), "Acme "+id.Short())
		other := h.NewTenant(t)

		// Action
		res, err := other.Admin.API.GetSlackIntegrationWithResponse(t.Context(), integrationID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		owner, err := tn.Admin.API.GetSlackIntegrationWithResponse(t.Context(), integrationID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, owner.StatusCode(), owner.Body)
	})

	t.Run("should refuse a malformed integration id as invalid input, not a server error", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.GetSlackIntegrationWithResponse(t.Context(), "not-an-id")

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
	})

	t.Run("should refuse another organization's admin deleting the integration, and keep it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		slug := "alerts-" + id.Short()
		integrationID, _ := installSlack(t, tn, slug, "Acme "+id.Short())
		other := h.NewTenant(t)

		// Action
		res, err := other.Admin.API.DeleteSlackIntegrationWithResponse(t.Context(), integrationID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.NotNil(t, fixture.WorkflowIntegrationBySlug(t, tn, slug))
	})

	t.Run("should delete the integration and report it gone", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		integrationID, _ := installSlack(t, tn, "alerts-"+id.Short(), "Acme "+id.Short())

		// Action
		deleted, err := tn.Admin.API.DeleteSlackIntegrationWithResponse(t.Context(), integrationID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, deleted.StatusCode(), deleted.Body)
		require.Equal(t, integrationID, deleted.JSON200.Id.String())
		got, err := tn.Admin.API.GetSlackIntegrationWithResponse(t.Context(), integrationID)
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, got.StatusCode(), got.Body)
		require.Contains(t, string(got.Body), "Slack integration not found.")
		require.Empty(t, fixture.WorkflowIntegrations(t, tn))
	})
}

func TestSlackIntegration_AlertCount(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should report no alerts for a new integration", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		integrationID, _ := installSlack(t, tn, "alerts-"+id.Short(), "Acme "+id.Short())

		// Action
		res := fixture.RawCall(t, tn.Admin.API, http.MethodGet, slackBase+"/"+integrationID+"/alert-count", nil)

		// Assert
		require.Equal(t, http.StatusOK, res.Status, string(res.Body))
		require.Equal(t, 0, alertCountOf(t, res))
	})

	t.Run("should count the alerts that post through the integration and not another's", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		used, _ := installSlack(t, tn, "alerts-"+id.Short(), "Acme "+id.Short())
		unused, _ := installSlack(t, tn, "paging-"+id.Short(), "Beta "+id.Short())
		bot := tn.NewMachineIdentity(t)
		createSlackAlert(t, tn, used, bot)

		// Action
		count := fixture.RawCall(t, tn.Admin.API, http.MethodGet, slackBase+"/"+used+"/alert-count", nil)
		other := fixture.RawCall(t, tn.Admin.API, http.MethodGet, slackBase+"/"+unused+"/alert-count", nil)

		// Assert
		require.Equal(t, http.StatusOK, count.Status, string(count.Body))
		require.Equal(t, 1, alertCountOf(t, count))
		require.Equal(t, http.StatusOK, other.Status, string(other.Body))
		require.Equal(t, 0, alertCountOf(t, other))
	})

	t.Run("should refuse an unknown integration, naming its id", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		unknown := uuid.NewString()

		// Action
		res := fixture.RawCall(t, tn.Admin.API, http.MethodGet, slackBase+"/"+unknown+"/alert-count", nil)

		// Assert
		require.Equal(t, http.StatusNotFound, res.Status, string(res.Body))
		require.Contains(t, string(res.Body), "Slack integration with ID "+unknown+" not found")
	})
}

// newWorkspace is a Slack workspace with a team of its own, ready to be installed.
func newWorkspace(t *testing.T, tn *harness.Tenant, teamName string, fragments ...any) *slack.ControlPlane {
	t.Helper()
	return slack.NewWorkspace(t, fixture.FakenetAdmin(t, tn),
		append([]any{slack.WithTeam("T"+strings.ToUpper(id.Hex(5)), teamName)}, fragments...)...)
}

// installURL asks, as the tenant's admin, for the URL that sends the browser to Slack.
func installURL(t *testing.T, tn *harness.Tenant, slug string) string {
	t.Helper()
	res := fixture.RawCall(t, tn.Admin.API, http.MethodGet, slackBase+"/install?slug="+url.QueryEscape(slug), nil)
	require.Equalf(t, http.StatusOK, res.Status, "starting the Slack install returned %d: %s", res.Status, apierr.Body(res.Body))
	return urlFromBody(t, res.Body)
}

// urlFromBody reads a URL the API returned as a bare string, quoted or not.
func urlFromBody(t *testing.T, body []byte) string {
	t.Helper()
	var quoted string
	if err := json.Unmarshal(body, &quoted); err == nil {
		return quoted
	}
	return strings.TrimSpace(string(body))
}

// redirectBack is Slack sending the browser back to Infisical with a code, on the state
// the install URL carried. The redirect is returned, not followed.
func redirectBack(t *testing.T, tn *harness.Tenant, install, code string) fixture.RawResponse {
	t.Helper()
	u, err := url.Parse(install)
	require.NoError(t, err)
	state := u.Query().Get("state")
	require.NotEmpty(t, state, "the install URL carried no state: %s", install)
	browser := tn.Anonymous(t, infisical.NoRedirects())
	return fixture.RawCall(t, browser, http.MethodGet,
		slackBase+"/oauth_redirect?code="+url.QueryEscape(code)+"&state="+url.QueryEscape(state), nil)
}

// installSlack installs a workspace of its own into the tenant under slug and returns the
// new integration's id.
func installSlack(t *testing.T, tn *harness.Tenant, slug, teamName string, fragments ...any) (string, *slack.ControlPlane) {
	t.Helper()
	ws := newWorkspace(t, tn, teamName, fragments...)
	res := redirectBack(t, tn, installURL(t, tn, slug), ws.Code)
	require.Equalf(t, http.StatusFound, res.Status, "installing Slack returned %d: %s", res.Status, apierr.Body(res.Body))
	created := fixture.WorkflowIntegrationBySlug(t, tn, slug)
	require.NotNilf(t, created, "no integration named %s after the install", slug)
	return created.ID, ws
}

func alertCountOf(t *testing.T, res fixture.RawResponse) int {
	t.Helper()
	var out struct {
		AlertCount int `json:"alertCount"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &out), string(res.Body))
	return out.AlertCount
}

// createSlackAlert makes an alert on the identity that posts to a channel through the
// integration.
func createSlackAlert(t *testing.T, tn *harness.Tenant, integrationID string, identity *harness.Principal) {
	t.Helper()
	res := fixture.RawCall(t, tn.Admin.API, http.MethodPost, "/api/v1/alerts", map[string]any{
		"name":         "auth changes " + id.Short(),
		"resourceType": "identity.authentication",
		"resourceId":   identity.ID.String(),
		"eventType":    "identity.authentication.auth-method-changed",
		"channels": []map[string]any{{
			"name":        "slack",
			"channelType": "slack-app",
			"config": map[string]any{
				"workflowIntegrationId": integrationID,
				"channels":              []map[string]any{{"id": "C0ALERTS1", "name": "alerts"}},
			},
		}},
	})
	require.Equalf(t, http.StatusOK, res.Status, "creating the Slack alert returned %d: %s", res.Status, apierr.Body(res.Body))
}
