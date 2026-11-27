package azure_test

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/azure"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

const (
	appID     = "11111111-1111-1111-1111-111111111111"
	loginHost = "login.microsoftonline.com"
)

func teamsServer(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	return fakenet.ServeInProcess(t, azure.Service, azure.Graph, azure.BotConnector)
}

func send(t *testing.T, fakes *httptest.Server, method, host, path, bearer string, body io.Reader, contentType string) (int, []byte) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, body)
	require.NoError(t, err)
	req.Host = host
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	return res.StatusCode, raw
}

func requestToken(t *testing.T, fakes *httptest.Server, tenant string, form url.Values) (int, map[string]any) {
	t.Helper()
	form.Set("client_id", appID)
	form.Set("client_secret", "secret")
	status, raw := send(t, fakes, http.MethodPost, loginHost, "/"+tenant+"/oauth2/v2.0/token", "",
		strings.NewReader(form.Encode()), "application/x-www-form-urlencoded")
	var out map[string]any
	require.NoError(t, json.Unmarshal(raw, &out))
	return status, out
}

func graphToken(t *testing.T, fakes *httptest.Server, tenant, grant string, extra ...string) string {
	t.Helper()
	form := url.Values{"scope": {"https://graph.microsoft.com/.default"}, "grant_type": {grant}}
	for i := 0; i+1 < len(extra); i += 2 {
		form.Set(extra[i], extra[i+1])
	}
	status, out := requestToken(t, fakes, tenant, form)
	require.Equal(t, http.StatusOK, status, "%v", out)
	return out["access_token"].(string)
}

func claims(t *testing.T, token string) map[string]any {
	t.Helper()
	parts := strings.Split(token, ".")
	require.Len(t, parts, 3)
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	require.NoError(t, err)
	var out map[string]any
	require.NoError(t, json.Unmarshal(raw, &out))
	return out
}

func TestTeamsFake_Tokens(t *testing.T) {
	t.Run("should name the tenant in the Graph token for both grants", func(t *testing.T) {
		// Setup
		fakes, admin := teamsServer(t)
		tenant := "tenant-" + strings.ToLower(t.Name()[len(t.Name())-4:])
		azure.Open(t, admin, tenant)

		// Action
		app := graphToken(t, fakes, tenant, "client_credentials")
		user := graphToken(t, fakes, tenant, "authorization_code", "code", "c1", "redirect_uri", "https://infisical.test/cb")

		// Assert
		require.Equal(t, tenant, claims(t, app)["tid"])
		require.Equal(t, tenant, claims(t, user)["tid"])
	})

	t.Run("should issue a code's token for another tenant when the test says so", func(t *testing.T) {
		// Setup
		fakes, admin := teamsServer(t)
		cp := azure.Open(t, admin, "tenant-a")
		cp.Seed(t, azure.WithCode("wrong-tenant-code", "tenant-b"))

		// Action
		app := graphToken(t, fakes, "tenant-a", "client_credentials")
		user := graphToken(t, fakes, "tenant-a", "authorization_code", "code", "wrong-tenant-code")
		other := graphToken(t, fakes, "tenant-a", "authorization_code", "code", "fine")

		// Assert
		require.Equal(t, "tenant-a", claims(t, app)["tid"])
		require.Equal(t, "tenant-b", claims(t, user)["tid"])
		require.Equal(t, "tenant-a", claims(t, other)["tid"])
	})

	t.Run("should issue the application's token for another tenant when the test says so", func(t *testing.T) {
		// Setup
		fakes, admin := teamsServer(t)
		azure.Open(t, admin, "tenant-a").Seed(t, azure.WithAppTenant("tenant-b"))

		// Action
		app := graphToken(t, fakes, "tenant-a", "client_credentials")

		// Assert
		require.Equal(t, "tenant-b", claims(t, app)["tid"])
	})

	t.Run("should answer AADSTS65001 until consent is given", func(t *testing.T) {
		// Setup
		fakes, admin := teamsServer(t)
		cp := azure.Open(t, admin, "tenant-a")
		cp.Seed(t, azure.WithConsentRequired(true))
		form := func() url.Values {
			return url.Values{"scope": {"https://graph.microsoft.com/.default"}, "grant_type": {"client_credentials"}}
		}

		// Action
		status, out := requestToken(t, fakes, "tenant-a", form())
		cp.Seed(t, azure.WithConsentRequired(false))
		consented, _ := requestToken(t, fakes, "tenant-a", form())

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "invalid_grant", out["error"])
		require.Contains(t, out["error_description"], "AADSTS65001")
		require.Equal(t, http.StatusOK, consented)
	})

	t.Run("should refuse a token request that carries no client secret", func(t *testing.T) {
		// Setup
		fakes, _ := teamsServer(t)
		form := url.Values{"scope": {"https://graph.microsoft.com/.default"}, "grant_type": {"client_credentials"}, "client_id": {appID}}

		// Action
		status, raw := send(t, fakes, http.MethodPost, loginHost, "/tenant-a/oauth2/v2.0/token", "",
			strings.NewReader(form.Encode()), "application/x-www-form-urlencoded")

		// Assert
		require.Equal(t, http.StatusUnauthorized, status)
		require.Contains(t, string(raw), "invalid_client")
	})

	t.Run("should record what the token requests carried", func(t *testing.T) {
		// Setup
		fakes, admin := teamsServer(t)
		cp := azure.Open(t, admin, "tenant-a")

		// Action
		graphToken(t, fakes, "tenant-a", "authorization_code", "code", "c1", "redirect_uri", "https://infisical.test/cb")

		// Assert
		require.Equal(t, []azure.TokenGrant{{
			ClientID: appID, GrantType: "authorization_code", Scope: "https://graph.microsoft.com/.default",
			Code: "c1", RedirectURI: "https://infisical.test/cb", IssuedTid: "tenant-a",
		}}, cp.State(t).Grants)
	})
}

func graphGet(t *testing.T, fakes *httptest.Server, token, path string) (int, map[string]any) {
	t.Helper()
	status, raw := send(t, fakes, http.MethodGet, "graph.microsoft.com", path, token, nil, "")
	var out map[string]any
	require.NoError(t, json.Unmarshal(raw, &out))
	return status, out
}

func TestTeamsFake_Graph(t *testing.T) {
	const botID = "22222222-2222-2222-2222-222222222222"

	t.Run("should list the catalog app a bot id names", func(t *testing.T) {
		// Setup
		fakes, admin := teamsServer(t)
		azure.OpenGraph(t, admin, "tenant-a").Seed(t, azure.WithApp("catalog-1", botID))
		token := graphToken(t, fakes, "tenant-a", "client_credentials")

		// Action
		status, out := graphGet(t, fakes, token, "/v1.0/appCatalogs/teamsApps")

		// Assert
		require.Equal(t, http.StatusOK, status)
		apps := out["value"].([]any)
		require.Len(t, apps, 1)
		require.Equal(t, "catalog-1", apps[0].(map[string]any)["id"])
		require.Equal(t, botID, apps[0].(map[string]any)["externalId"])
	})

	t.Run("should keep tenants apart when two hold different catalogs", func(t *testing.T) {
		// Setup
		fakes, admin := teamsServer(t)
		azure.OpenGraph(t, admin, "tenant-a").Seed(t, azure.WithApp("catalog-a", botID))
		azure.OpenGraph(t, admin, "tenant-b")
		token := graphToken(t, fakes, "tenant-b", "client_credentials")

		// Action
		_, out := graphGet(t, fakes, token, "/v1.0/appCatalogs/teamsApps")

		// Assert
		require.Empty(t, out["value"])
	})

	t.Run("should page teams and channels through nextLink and report installed apps", func(t *testing.T) {
		// Setup
		fakes, admin := teamsServer(t)
		cp := azure.OpenGraph(t, admin, "tenant-a")
		cp.Seed(t,
			azure.WithPageSize(2),
			azure.WithTeam(azure.Team{ID: "t1", DisplayName: "Eng", InstalledApps: []string{"catalog-1"}, Channels: []azure.Channel{
				{ID: "c1", DisplayName: "General"}, {ID: "c2", DisplayName: "Alerts"}, {ID: "c3", DisplayName: "Ops"},
			}}),
			azure.WithTeam(azure.Team{ID: "t2", DisplayName: "Sales"}),
			azure.WithTeam(azure.Team{ID: "t3", DisplayName: "Legal"}),
		)
		token := graphToken(t, fakes, "tenant-a", "client_credentials")

		// Action
		collect := func(path string) (ids []string, pages int) {
			for path != "" {
				status, out := graphGet(t, fakes, token, path)
				require.Equal(t, http.StatusOK, status, "%v", out)
				for _, v := range out["value"].([]any) {
					ids = append(ids, v.(map[string]any)["id"].(string))
				}
				pages++
				next, _ := out["@odata.nextLink"].(string)
				if next != "" {
					u, err := url.Parse(next)
					require.NoError(t, err)
					require.Equal(t, "graph.microsoft.com", u.Host)
					next = u.RequestURI()
				}
				path = next
			}
			return ids, pages
		}
		teams, teamPages := collect("/v1.0/teams")
		channels, channelPages := collect("/v1.0/teams/t1/channels")
		_, installed := graphGet(t, fakes, token, "/v1.0/teams/t1/installedApps?$expand=teamsAppDefinition")
		_, bare := graphGet(t, fakes, token, "/v1.0/teams/t2/installedApps?$expand=teamsAppDefinition")
		missing, _ := graphGet(t, fakes, token, "/v1.0/teams/nope/channels")

		// Assert
		require.Equal(t, []string{"t1", "t2", "t3"}, teams)
		require.Equal(t, 2, teamPages)
		require.Equal(t, []string{"c1", "c2", "c3"}, channels)
		require.Equal(t, 2, channelPages)
		def := installed["value"].([]any)[0].(map[string]any)["teamsAppDefinition"].(map[string]any)
		require.Equal(t, "catalog-1", def["teamsAppId"])
		require.Empty(t, bare["value"])
		require.Equal(t, http.StatusNotFound, missing)
	})

	t.Run("should refuse a token that names no tenant it knows", func(t *testing.T) {
		// Setup
		fakes, _ := teamsServer(t)

		// Action
		status, _ := send(t, fakes, http.MethodGet, "graph.microsoft.com", "/v1.0/teams", "not-a-jwt", nil, "")

		// Assert
		require.Equal(t, http.StatusNotImplemented, status)
	})
}

func botToken(t *testing.T, fakes *httptest.Server) string {
	t.Helper()
	status, out := requestToken(t, fakes, "botframework.com", url.Values{
		"scope": {"https://api.botframework.com/.default"}, "grant_type": {"client_credentials"},
	})
	require.Equal(t, http.StatusOK, status, "%v", out)
	return out["access_token"].(string)
}

func TestTeamsFake_BotConnector(t *testing.T) {
	post := func(t *testing.T, fakes *httptest.Server, token, channel, body string) int {
		t.Helper()
		status, _ := send(t, fakes, http.MethodPost, "smba.trafficmanager.net", "/amer/v3/conversations/"+channel+"/activities",
			token, strings.NewReader(body), "application/json")
		return status
	}
	card := `{"type":"message","attachments":[{"contentType":"application/vnd.microsoft.card.adaptive","content":{"type":"AdaptiveCard","body":[{"type":"TextBlock","text":"Secret approval request"}]}}],
		"conversation":{"id":"19:chan@thread.tacv2","isGroup":true},"channelData":{"channel":{"id":"19:chan@thread.tacv2"},"team":{"id":"t1"}}}`

	t.Run("should issue a bot token that names the app", func(t *testing.T) {
		// Setup
		fakes, _ := teamsServer(t)

		// Action
		token := botToken(t, fakes)

		// Assert
		require.Equal(t, appID, claims(t, token)["appid"])
		require.Equal(t, "https://api.botframework.com", claims(t, token)["aud"])
	})

	t.Run("should record the card and publish an event when the bot posts to a channel", func(t *testing.T) {
		// Setup
		fakes, admin := teamsServer(t)
		fakenet.Track(t, admin, azure.BotConnector.Host(), appID)
		cp := azure.OpenBot(t, admin, appID)
		token := botToken(t, fakes)

		// Action
		status := post(t, fakes, token, "19:chan@thread.tacv2", card)

		// Assert
		require.Equal(t, http.StatusOK, status)
		got := cp.ActivitiesIn(t, "19:chan@thread.tacv2")
		require.Len(t, got, 1)
		require.Equal(t, "message", got[0].Type)
		require.Equal(t, "application/vnd.microsoft.card.adaptive", got[0].Attachments[0].ContentType)
		require.Contains(t, string(got[0].Attachments[0].Content), "Secret approval request")
		require.Contains(t, string(got[0].ChannelData), `"team":{"id":"t1"}`)
		cp.ExpectEvent[azure.ActivityPosted](t, func(e azure.ActivityPosted) bool {
			return e.ConversationID == "19:chan@thread.tacv2" && e.ActivityID == got[0].ID
		})
	})

	t.Run("should refuse an activity with no type and record nothing", func(t *testing.T) {
		// Setup
		fakes, admin := teamsServer(t)
		cp := azure.OpenBot(t, admin, appID)
		token := botToken(t, fakes)

		// Action
		status := post(t, fakes, token, "c1", `{"text":"hi"}`)

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Empty(t, cp.State(t).Activities)
	})

	t.Run("should refuse a Graph token on the connector", func(t *testing.T) {
		// Setup
		fakes, admin := teamsServer(t)
		fakenet.Track(t, admin, azure.BotConnector.Host(), appID)
		cp := azure.OpenBot(t, admin, appID)
		graph := graphToken(t, fakes, "tenant-a", "client_credentials")

		// Action
		status := post(t, fakes, graph, "c1", card)

		// Assert
		require.Equal(t, http.StatusNotImplemented, status)
		require.Empty(t, cp.State(t).Activities)
		cp.ExpectNoEvent[azure.ActivityPosted](t, nil, fakenet.Within(200*time.Millisecond))
	})
}
