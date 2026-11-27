package slack

import (
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// ControlPlane is a test's view of one Slack workspace.
type ControlPlane struct {
	*fakenet.Scope[Workspace]

	// Code is the authorization code Slack would put on the redirect back to Infisical.
	Code string
}

// BotToken is the token the code is redeemed into.
func (cp *ControlPlane) BotToken() string { return botTokenPrefix + cp.Code }

func Open(tt *testing.T, adminURL, code string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{Scope: fakenet.Open[Workspace](tt, adminURL, Service.Host(), code), Code: code}
}

// NewWorkspace is an admin finishing Slack's consent page for a workspace of its own: it
// returns the workspace with the code to hand to Infisical's callback. The code carries
// the test binary's prefix so the workspace's events reach this binary.
func NewWorkspace(tt *testing.T, adminURL string, fragments ...any) *ControlPlane {
	tt.Helper()
	code := id.Nonce()
	fakenet.Track(tt, adminURL, Service.Host(), code)
	cp := Open(tt, adminURL, code)
	cp.Seed(tt, WithTeam("T"+strings.ToUpper(id.Hex(5)), "Acme"))
	cp.Seed(tt, fragments...)
	return cp
}

// MessagesIn is what the workspace accepted for a channel, oldest first.
func (cp *ControlPlane) MessagesIn(tt *testing.T, channelID string) []Message {
	tt.Helper()
	var out []Message
	for _, m := range cp.State(tt).Messages {
		if m.Channel == channelID {
			out = append(out, m)
		}
	}
	return out
}

// WithTeam is a seed fragment naming the workspace's team.
func WithTeam(teamID, name string) any { return Workspace{Team: Team{ID: teamID, Name: name}} }

// WithChannels is a seed fragment adding channels.
func WithChannels(channels ...Channel) any { return Workspace{Channels: channels} }

// WithPageSize is a seed fragment capping conversations.list pages.
func WithPageSize(n int) any { return Workspace{PageSize: n} }

type AppInstalled struct {
	TeamID string `json:"teamId"`
}

type MessagePosted struct {
	Channel string `json:"channel"`
	Ts      string `json:"ts"`
	Text    string `json:"text"`
}

func (AppInstalled) EventName() string  { return "slack.app-installed" }
func (MessagePosted) EventName() string { return "slack.message-posted" }
