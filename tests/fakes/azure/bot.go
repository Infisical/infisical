package azure

import (
	"encoding/json"
	"net/http"
	"sync"
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// BotConnector answers as smba.trafficmanager.net, the Bot Framework service a bot posts
// channel messages through. It is scoped by the client id the bearer bot token names, so
// a test reads what the bot posted by opening it with the Teams app's client id. The
// token is a Bot Framework token from the botframework.com tenant's token endpoint.
//
// Activities are recorded for the app whatever the channel: Infisical's app credentials
// are instance-wide, so there is one app per stack. The activities of every tenant that
// posts through it land together, told apart by their conversation (channel) ids, which
// a test generates per tenant.
var BotConnector = botService{}

type botService struct{}

func (botService) Host() string { return "smba.trafficmanager.net" }

func (botService) Scope(r *http.Request) (string, bool) {
	if aud, _ := jwtClaim(r, "aud"); aud != "https://api.botframework.com" {
		return "", false
	}
	return jwtClaim(r, "appid")
}

func (botService) New(events fakenet.Emitter) fakenet.Fake {
	b := &Bot{events: events}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /{region}/v3/conversations/{conversation}/activities", b.post)
	b.mux = mux
	return b
}

// Bot is every activity one Teams app posted.
type Bot struct {
	Activities []Activity `json:"activities"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
}

// Activity is a message posted to a conversation. Attachments hold the adaptive cards.
type Activity struct {
	ID             string            `json:"id"`
	ConversationID string            `json:"conversationId"`
	Type           string            `json:"type"`
	Attachments    []ActivityContent `json:"attachments"`
	ChannelData    json.RawMessage   `json:"channelData,omitempty"`
}

type ActivityContent struct {
	ContentType string          `json:"contentType"`
	Content     json.RawMessage `json:"content"`
}

type ActivityPosted struct {
	ConversationID string `json:"conversationId"`
	ActivityID     string `json:"activityId"`
}

func (ActivityPosted) EventName() string { return "azure.activity-posted" }

func (b *Bot) ServeHTTP(w http.ResponseWriter, r *http.Request) { b.mux.ServeHTTP(w, r) }

func (b *Bot) post(w http.ResponseWriter, r *http.Request) {
	var in Activity
	var raw struct {
		Type        string            `json:"type"`
		Attachments []ActivityContent `json:"attachments"`
		ChannelData json.RawMessage   `json:"channelData"`
	}
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil || raw.Type == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": map[string]string{"code": "BadArgument", "message": "Invalid activity."}})
		return
	}
	in.Type, in.Attachments, in.ChannelData = raw.Type, raw.Attachments, raw.ChannelData
	in.ConversationID = r.PathValue("conversation")
	in.ID = "1:" + id.Hex(8)

	b.mu.Lock()
	b.Activities = append(b.Activities, in)
	b.mu.Unlock()
	b.events.Publish(ActivityPosted{ConversationID: in.ConversationID, ActivityID: in.ID})
	writeJSON(w, http.StatusOK, map[string]string{"id": in.ID})
}

func (b *Bot) Snapshot() ([]byte, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return json.Marshal(b)
}

func (b *Bot) Seed([]byte) error { return nil }

// BotControlPlane is a test's view of the activities one Teams app posted.
type BotControlPlane struct {
	*fakenet.Scope[Bot]
	ClientID string
}

func OpenBot(tt *testing.T, adminURL, clientID string) *BotControlPlane {
	tt.Helper()
	return &BotControlPlane{Scope: fakenet.Open[Bot](tt, adminURL, BotConnector.Host(), clientID), ClientID: clientID}
}

// ActivitiesIn is what the app posted to a conversation, oldest first.
func (cp *BotControlPlane) ActivitiesIn(tt *testing.T, conversationID string) []Activity {
	tt.Helper()
	var out []Activity
	for _, a := range cp.State(tt).Activities {
		if a.ConversationID == conversationID {
			out = append(out, a)
		}
	}
	return out
}
