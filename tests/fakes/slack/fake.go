// Package slack fakes Slack's Web API and OAuth on slack.com: the workspace an
// organization installs the Infisical app into, its channels, and the messages posted.
//
// The OAuth code is the scope. A test mints a workspace (NewWorkspace), hands its Code to
// Infisical's oauth_redirect callback, and the fake redeems it into a bot token that
// carries the same scope, so every web API call finds its workspace by that token. A code
// or token no test seeded is answered the way Slack answers a stranger (invalid_code,
// invalid_auth). Every answer is HTTP 200 with ok:false, as Slack's are.
package slack

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// The Slack app credentials the instance boots with (WORKFLOW_SLACK_CLIENT_ID and
// WORKFLOW_SLACK_CLIENT_SECRET). oauth.v2.access refuses any other pair.
const (
	ClientID     = "harness-slack-client"
	ClientSecret = "harness-slack-secret"
)

// Scopes is what the fake grants, which is what Infisical asks for on its install URL.
const Scopes = "chat:write.public,chat:write,channels:read,groups:read"

const (
	botTokenPrefix = "xoxb-"
	defaultLimit   = 100
	maxLimit       = 1000
)

// Service answers for slack.com.
var Service = service{}

type service struct{}

func (service) Host() string { return "slack.com" }

// Scope is the authorization code on oauth.v2.access and the bot token everywhere else.
func (service) Scope(r *http.Request) (string, bool) {
	if r.URL.Path == "/api/oauth.v2.access" {
		if err := r.ParseForm(); err != nil {
			return "", false
		}
		code := r.PostForm.Get("code")
		if code == "" {
			// Slack answers a request with no code as invalid_code; any key reaches
			// a workspace that was never seeded, which says so.
			code = "no-code"
		}
		return code, true
	}
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || token == "" {
		return "", false
	}
	return strings.TrimPrefix(token, botTokenPrefix), true
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	w := &Workspace{events: events}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/{method}", w.api)
	w.mux = mux
	return w
}

// Workspace is one Slack workspace and the app installed in it. It exists once a test
// seeds a team, and the app is installed once its code has been redeemed.
type Workspace struct {
	Team        Team      `json:"team"`
	AppID       string    `json:"appId"`
	BotID       string    `json:"botId"`
	BotUserID   string    `json:"botUserId"`
	InstallerID string    `json:"installerId"`
	Channels    []Channel `json:"channels"`
	Messages    []Message `json:"messages"`

	// PageSize caps how many channels one conversations.list page holds, whatever limit
	// is asked for. Slack documents that a page may hold fewer than limit. Zero means no
	// cap beyond limit's own maximum.
	PageSize int `json:"pageSize,omitempty"`

	// Installed is set when the code is redeemed. A code works once.
	Installed bool `json:"installed"`

	// RedirectURI is the redirect_uri oauth.v2.access was called with.
	RedirectURI string `json:"redirectUri,omitempty"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
	seq    int
}

type Team struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Channel is a conversation the app's bot can see. The bot may post to a public channel
// it has not joined, because the app holds chat:write.public, but not to a private one.
type Channel struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	IsArchived bool   `json:"isArchived,omitempty"`
	IsPrivate  bool   `json:"isPrivate,omitempty"`
	IsMember   bool   `json:"isMember,omitempty"`
}

// Message is a chat.postMessage the workspace accepted. Blocks and Attachments are the
// JSON the app sent.
type Message struct {
	Channel     string          `json:"channel"`
	Ts          string          `json:"ts"`
	Text        string          `json:"text,omitempty"`
	Blocks      json.RawMessage `json:"blocks,omitempty"`
	Attachments json.RawMessage `json:"attachments,omitempty"`
}

func (w *Workspace) ServeHTTP(rw http.ResponseWriter, r *http.Request) { w.mux.ServeHTTP(rw, r) }

func (w *Workspace) seeded() bool { return w.Team.ID != "" }

func (w *Workspace) api(rw http.ResponseWriter, r *http.Request) {
	p, err := params(r)
	if err != nil {
		reply(rw, fail("invalid_arguments"))
		return
	}
	w.mu.Lock()
	defer w.mu.Unlock()

	method := r.PathValue("method")
	if method == "oauth.v2.access" {
		reply(rw, w.oauthAccess(r, p))
		return
	}
	if !w.seeded() || !w.Installed {
		reply(rw, fail("invalid_auth"))
		return
	}
	switch method {
	case "auth.test":
		reply(rw, w.authTest())
	case "conversations.list":
		reply(rw, w.conversationsList(p))
	case "chat.postMessage":
		reply(rw, w.postMessage(p))
	default:
		reply(rw, fail("unknown_method"))
	}
}

type body = map[string]any

func fail(code string) body { return body{"ok": false, "error": code} }

func (w *Workspace) oauthAccess(r *http.Request, p url.Values) body {
	clientID, secret, ok := r.BasicAuth()
	if !ok {
		clientID, secret = p.Get("client_id"), p.Get("client_secret")
	}
	if clientID != ClientID {
		return fail("invalid_client_id")
	}
	if secret != ClientSecret {
		return fail("bad_client_secret")
	}
	if !w.seeded() || w.Installed {
		return fail("invalid_code")
	}
	w.Installed = true
	w.RedirectURI = p.Get("redirect_uri")
	w.events.Publish(AppInstalled{TeamID: w.Team.ID})
	return body{
		"ok":                    true,
		"app_id":                w.AppID,
		"authed_user":           body{"id": w.InstallerID},
		"scope":                 Scopes,
		"token_type":            "bot",
		"access_token":          botTokenPrefix + w.events.Scope(),
		"bot_user_id":           w.BotUserID,
		"team":                  body{"id": w.Team.ID, "name": w.Team.Name},
		"enterprise":            nil,
		"is_enterprise_install": false,
	}
}

func (w *Workspace) authTest() body {
	return body{
		"ok":                    true,
		"url":                   "https://" + strings.ToLower(strings.ReplaceAll(w.Team.Name, " ", "-")) + ".slack.com/",
		"team":                  w.Team.Name,
		"team_id":               w.Team.ID,
		"user":                  "infisical",
		"user_id":               w.BotUserID,
		"bot_id":                w.BotID,
		"is_enterprise_install": false,
	}
}

func (w *Workspace) conversationsList(p url.Values) body {
	wanted := map[string]bool{}
	types := p.Get("types")
	if types == "" {
		types = "public_channel"
	}
	for _, t := range strings.Split(types, ",") {
		wanted[strings.TrimSpace(t)] = true
	}
	excludeArchived := p.Get("exclude_archived") == "true"

	matching := make([]Channel, 0, len(w.Channels))
	for _, c := range w.Channels {
		kind := "public_channel"
		if c.IsPrivate {
			kind = "private_channel"
		}
		if wanted[kind] && !(excludeArchived && c.IsArchived) {
			matching = append(matching, c)
		}
	}

	start := 0
	if cursor := p.Get("cursor"); cursor != "" {
		raw, err := base64.StdEncoding.DecodeString(cursor)
		next, ok := strings.CutPrefix(string(raw), "channel:")
		if err != nil || !ok {
			return fail("invalid_cursor")
		}
		start = -1
		for i, c := range matching {
			if c.ID == next {
				start = i
			}
		}
		if start < 0 {
			return fail("invalid_cursor")
		}
	}

	limit, _ := strconv.Atoi(p.Get("limit"))
	if limit <= 0 {
		limit = defaultLimit
	}
	limit = min(limit, maxLimit)
	if w.PageSize > 0 {
		limit = min(limit, w.PageSize)
	}

	end := min(start+limit, len(matching))
	nextCursor := ""
	if end < len(matching) {
		nextCursor = base64.StdEncoding.EncodeToString([]byte("channel:" + matching[end].ID))
	}

	channels := make([]body, 0, end-start)
	for _, c := range matching[start:end] {
		channels = append(channels, body{
			"id":              c.ID,
			"name":            c.Name,
			"name_normalized": c.Name,
			"is_channel":      !c.IsPrivate,
			"is_group":        c.IsPrivate,
			"is_private":      c.IsPrivate,
			"is_archived":     c.IsArchived,
			"is_member":       c.IsMember,
		})
	}
	return body{"ok": true, "channels": channels, "response_metadata": body{"next_cursor": nextCursor}}
}

func (w *Workspace) postMessage(p url.Values) body {
	var channel *Channel
	for i := range w.Channels {
		if w.Channels[i].ID == p.Get("channel") {
			channel = &w.Channels[i]
		}
	}
	if channel == nil {
		return fail("channel_not_found")
	}
	text, blocks, attachments := p.Get("text"), p.Get("blocks"), p.Get("attachments")
	if text == "" && blocks == "" && attachments == "" {
		return fail("no_text")
	}
	if blocks != "" && !jsonArray(blocks) {
		return fail("invalid_blocks")
	}
	if attachments != "" && !jsonArray(attachments) {
		return fail("invalid_attachments")
	}
	if channel.IsArchived {
		return fail("is_archived")
	}
	if channel.IsPrivate && !channel.IsMember {
		return fail("not_in_channel")
	}

	w.seq++
	ts := fmt.Sprintf("%d.%06d", time.Now().Unix(), w.seq)
	msg := Message{Channel: channel.ID, Ts: ts, Text: text}
	if blocks != "" {
		msg.Blocks = json.RawMessage(blocks)
	}
	if attachments != "" {
		msg.Attachments = json.RawMessage(attachments)
	}
	w.Messages = append(w.Messages, msg)
	w.events.Publish(MessagePosted{Channel: channel.ID, Ts: ts, Text: text})
	return body{
		"ok":      true,
		"channel": channel.ID,
		"ts":      ts,
		"message": body{"type": "message", "text": text, "ts": ts, "bot_id": w.BotID},
	}
}

func jsonArray(s string) bool {
	return json.Valid([]byte(s)) && strings.HasPrefix(strings.TrimSpace(s), "[")
}

// params reads a call's arguments from a form or, as Slack also accepts, a JSON body.
// JSON values that are not strings are kept as their JSON text, the form Slack's SDK
// sends blocks and attachments in.
func params(r *http.Request) (url.Values, error) {
	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		raw, err := io.ReadAll(r.Body)
		if err != nil {
			return nil, err
		}
		out := url.Values{}
		for k, v := range r.URL.Query() {
			out[k] = v
		}
		if len(strings.TrimSpace(string(raw))) == 0 {
			return out, nil
		}
		var in map[string]json.RawMessage
		if err := json.Unmarshal(raw, &in); err != nil {
			return nil, err
		}
		for k, v := range in {
			var s string
			if json.Unmarshal(v, &s) == nil {
				out.Set(k, s)
			} else {
				out.Set(k, string(v))
			}
		}
		return out, nil
	}
	if err := r.ParseForm(); err != nil {
		return nil, err
	}
	return r.Form, nil
}

func reply(rw http.ResponseWriter, b body) {
	rw.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(rw).Encode(b)
}

func (w *Workspace) Snapshot() ([]byte, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return json.Marshal(w)
}

// Seed merges a fragment: a team (which gives the workspace its bot and app ids when it
// has none), channels to append, and a page size.
func (w *Workspace) Seed(raw []byte) error {
	var in Workspace
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if in.Team.ID != "" {
		w.Team = in.Team
		fill(&w.AppID, "A")
		fill(&w.BotID, "B")
		fill(&w.BotUserID, "U")
		fill(&w.InstallerID, "U")
	}
	w.Channels = append(w.Channels, in.Channels...)
	if in.PageSize > 0 {
		w.PageSize = in.PageSize
	}
	return nil
}

func fill(field *string, prefix string) {
	if *field == "" {
		*field = prefix + strings.ToUpper(id.Hex(5))
	}
}
