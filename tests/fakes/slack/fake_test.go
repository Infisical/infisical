package slack_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/slack"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

type reply map[string]any

func (r reply) str(key string) string { s, _ := r[key].(string); return s }

func call(t *testing.T, fakes *httptest.Server, method, token string, form url.Values) reply {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, fakes.URL+"/api/"+method, strings.NewReader(form.Encode()))
	require.NoError(t, err)
	req.Host = "slack.com"
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	require.Equal(t, http.StatusOK, res.StatusCode, "Slack answers errors with HTTP 200")
	var out reply
	require.NoError(t, json.NewDecoder(res.Body).Decode(&out))
	return out
}

func exchange(t *testing.T, fakes *httptest.Server, code, secret string) reply {
	t.Helper()
	return call(t, fakes, "oauth.v2.access", "", url.Values{
		"code": {code}, "client_id": {slack.ClientID}, "client_secret": {secret}, "redirect_uri": {"https://infisical.test/cb"},
	})
}

func newWorkspace(t *testing.T, fragments ...any) (*httptest.Server, *slack.ControlPlane) {
	t.Helper()
	fakes, admin := fakenet.ServeInProcess(t, slack.Service)
	return fakes, slack.NewWorkspace(t, admin, fragments...)
}

func installed(t *testing.T, fakes *httptest.Server, cp *slack.ControlPlane) string {
	t.Helper()
	res := exchange(t, fakes, cp.Code, slack.ClientSecret)
	require.Equal(t, true, res["ok"], "%v", res)
	return res.str("access_token")
}

func TestSlackFake_OAuth(t *testing.T) {
	t.Run("should issue a bot token that identifies the workspace when its code is redeemed", func(t *testing.T) {
		// Setup
		fakes, cp := newWorkspace(t, slack.WithTeam("T123", "Acme Corp"))

		// Action
		res := exchange(t, fakes, cp.Code, slack.ClientSecret)

		// Assert
		require.Equal(t, true, res["ok"])
		require.Equal(t, cp.BotToken(), res.str("access_token"))
		require.Equal(t, "bot", res.str("token_type"))
		require.Equal(t, "T123", res["team"].(map[string]any)["id"])
		require.NotEmpty(t, res.str("bot_user_id"))
		whoami := call(t, fakes, "auth.test", res.str("access_token"), nil)
		require.Equal(t, true, whoami["ok"])
		require.Equal(t, "T123", whoami.str("team_id"))
		require.NotEmpty(t, whoami.str("bot_id"))
		state := cp.State(t)
		require.True(t, state.Installed)
		require.Equal(t, "https://infisical.test/cb", state.RedirectURI)
	})

	t.Run("should refuse a code that was already redeemed", func(t *testing.T) {
		// Setup
		fakes, cp := newWorkspace(t)
		installed(t, fakes, cp)

		// Action
		res := exchange(t, fakes, cp.Code, slack.ClientSecret)

		// Assert
		require.Equal(t, false, res["ok"])
		require.Equal(t, "invalid_code", res.str("error"))
	})

	t.Run("should refuse a code no test seeded", func(t *testing.T) {
		// Setup
		fakes, _ := newWorkspace(t)

		// Action
		res := exchange(t, fakes, "stranger", slack.ClientSecret)

		// Assert
		require.Equal(t, "invalid_code", res.str("error"))
	})

	t.Run("should refuse the app when the client secret is wrong, leaving the code unredeemed", func(t *testing.T) {
		// Setup
		fakes, cp := newWorkspace(t)

		// Action
		res := exchange(t, fakes, cp.Code, "wrong")

		// Assert
		require.Equal(t, "bad_client_secret", res.str("error"))
		require.False(t, cp.State(t).Installed)
	})

	t.Run("should answer invalid_auth when the token is not one the workspace issued", func(t *testing.T) {
		// Setup
		fakes, cp := newWorkspace(t)

		// Action
		beforeInstall := call(t, fakes, "conversations.list", cp.BotToken(), nil)
		stranger := call(t, fakes, "conversations.list", "xoxb-stranger", nil)

		// Assert
		require.Equal(t, "invalid_auth", beforeInstall.str("error"))
		require.Equal(t, "invalid_auth", stranger.str("error"))
	})
}

func channelNames(t *testing.T, res reply) []string {
	t.Helper()
	var names []string
	for _, c := range res["channels"].([]any) {
		names = append(names, c.(map[string]any)["name_normalized"].(string))
	}
	return names
}

func TestSlackFake_ConversationsList(t *testing.T) {
	channels := slack.WithChannels(
		slack.Channel{ID: "C1", Name: "general"},
		slack.Channel{ID: "C2", Name: "ops", IsArchived: true},
		slack.Channel{ID: "C3", Name: "secrets", IsPrivate: true, IsMember: true},
		slack.Channel{ID: "C4", Name: "alerts"},
		slack.Channel{ID: "C5", Name: "random"},
	)

	t.Run("should return every channel across pages when the workspace caps a page", func(t *testing.T) {
		// Setup
		fakes, cp := newWorkspace(t, channels, slack.WithPageSize(2))
		token := installed(t, fakes, cp)

		// Action
		var names []string
		cursor, pages := "", 0
		for {
			res := call(t, fakes, "conversations.list", token, url.Values{
				"limit": {"1000"}, "types": {"public_channel,private_channel"}, "cursor": {cursor},
			})
			require.Equal(t, true, res["ok"], "%v", res)
			names = append(names, channelNames(t, res)...)
			pages++
			cursor = res["response_metadata"].(map[string]any)["next_cursor"].(string)
			if cursor == "" {
				break
			}
		}

		// Assert
		require.Equal(t, []string{"general", "ops", "secrets", "alerts", "random"}, names)
		require.Equal(t, 3, pages)
	})

	t.Run("should list only public channels when no type is asked for", func(t *testing.T) {
		// Setup
		fakes, cp := newWorkspace(t, channels)
		token := installed(t, fakes, cp)

		// Action
		res := call(t, fakes, "conversations.list", token, nil)

		// Assert
		require.NotContains(t, channelNames(t, res), "secrets")
		require.Contains(t, channelNames(t, res), "general")
	})

	t.Run("should report archived channels as archived", func(t *testing.T) {
		// Setup
		fakes, cp := newWorkspace(t, channels)
		token := installed(t, fakes, cp)

		// Action
		res := call(t, fakes, "conversations.list", token, nil)

		// Assert
		archived := map[string]bool{}
		for _, c := range res["channels"].([]any) {
			ch := c.(map[string]any)
			archived[ch["id"].(string)] = ch["is_archived"].(bool)
		}
		require.True(t, archived["C2"])
		require.False(t, archived["C1"])
	})

	t.Run("should refuse a cursor it did not issue", func(t *testing.T) {
		// Setup
		fakes, cp := newWorkspace(t, channels)
		token := installed(t, fakes, cp)

		// Action
		res := call(t, fakes, "conversations.list", token, url.Values{"cursor": {"bm9wZQ=="}})

		// Assert
		require.Equal(t, "invalid_cursor", res.str("error"))
	})
}

func TestSlackFake_PostMessage(t *testing.T) {
	channels := slack.WithChannels(
		slack.Channel{ID: "C1", Name: "general"},
		slack.Channel{ID: "C2", Name: "old", IsArchived: true},
		slack.Channel{ID: "C3", Name: "joined", IsPrivate: true, IsMember: true},
		slack.Channel{ID: "C4", Name: "closed", IsPrivate: true},
	)
	post := func(t *testing.T, fakes *httptest.Server, token, channel string) reply {
		t.Helper()
		return call(t, fakes, "chat.postMessage", token, url.Values{
			"channel":     {channel},
			"text":        {"approval needed"},
			"blocks":      {`[{"type":"section","text":{"type":"mrkdwn","text":"hi"}}]`},
			"attachments": {`[{"color":"#ffcc00","blocks":[]}]`},
		})
	}

	t.Run("should record the message and publish an event when the channel accepts it", func(t *testing.T) {
		// Setup
		fakes, cp := newWorkspace(t, channels)
		token := installed(t, fakes, cp)

		// Action
		res := post(t, fakes, token, "C1")

		// Assert
		require.Equal(t, true, res["ok"], "%v", res)
		require.Equal(t, "C1", res.str("channel"))
		msgs := cp.MessagesIn(t, "C1")
		require.Len(t, msgs, 1)
		require.Equal(t, res.str("ts"), msgs[0].Ts)
		require.Equal(t, "approval needed", msgs[0].Text)
		require.Contains(t, string(msgs[0].Blocks), "mrkdwn")
		require.Contains(t, string(msgs[0].Attachments), "#ffcc00")
		cp.ExpectEvent[slack.MessagePosted](t, func(e slack.MessagePosted) bool { return e.Channel == "C1" && e.Ts == res.str("ts") })
	})

	t.Run("should post to a private channel the bot joined", func(t *testing.T) {
		// Setup
		fakes, cp := newWorkspace(t, channels)
		token := installed(t, fakes, cp)

		// Action
		res := post(t, fakes, token, "C3")

		// Assert
		require.Equal(t, true, res["ok"])
		require.Len(t, cp.MessagesIn(t, "C3"), 1)
	})

	for name, tc := range map[string]struct{ channel, want string }{
		"an unknown channel":                  {"C9", "channel_not_found"},
		"an archived channel":                 {"C2", "is_archived"},
		"a private channel it has not joined": {"C4", "not_in_channel"},
	} {
		t.Run("should refuse and record nothing for "+name, func(t *testing.T) {
			// Setup
			fakes, cp := newWorkspace(t, channels)
			token := installed(t, fakes, cp)

			// Action
			res := post(t, fakes, token, tc.channel)

			// Assert
			require.Equal(t, false, res["ok"])
			require.Equal(t, tc.want, res.str("error"))
			require.Empty(t, cp.State(t).Messages)
			cp.ExpectNoEvent[slack.MessagePosted](t, nil, fakenet.Within(200*time.Millisecond))
		})
	}

	t.Run("should refuse a message with no content", func(t *testing.T) {
		// Setup
		fakes, cp := newWorkspace(t, channels)
		token := installed(t, fakes, cp)

		// Action
		res := call(t, fakes, "chat.postMessage", token, url.Values{"channel": {"C1"}})

		// Assert
		require.Equal(t, "no_text", res.str("error"))
	})

	t.Run("should keep two workspaces apart when they post to the same channel id", func(t *testing.T) {
		// Setup
		fakes, admin := fakenet.ServeInProcess(t, slack.Service)
		a, b := slack.NewWorkspace(t, admin, channels), slack.NewWorkspace(t, admin, channels)
		tokenA, tokenB := installed(t, fakes, a), installed(t, fakes, b)

		// Action
		post(t, fakes, tokenA, "C1")
		post(t, fakes, tokenA, "C1")
		post(t, fakes, tokenB, "C1")

		// Assert
		require.Len(t, a.MessagesIn(t, "C1"), 2)
		require.Len(t, b.MessagesIn(t, "C1"), 1)
	})
}
