package fixture

import (
	"testing"

	"github.com/google/uuid"

	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// WebhookSink is a receiving URL of the test's own and the fake behind it.
type WebhookSink struct {
	*webhook.ControlPlane
	URL string

	// Token is the Splunk HEC token a Splunk sink is scoped by; empty for the others.
	Token string
}

// NewWebhookSink mints a URL on sink. Each one is a separate endpoint, so a test that
// needs to tell two webhooks apart gives each its own sink.
func NewWebhookSink(tt *testing.T, tn *harness.Tenant, sink webhook.Sink) *WebhookSink {
	tt.Helper()
	nonce := id.Nonce()
	admin := FakenetAdmin(tt, tn)

	// Before the URL reaches Infisical, so no delivery can arrive before its buffer
	// exists.
	fakenet.Track(tt, admin, sink.Host(), nonce)
	return &WebhookSink{ControlPlane: webhook.Open(tt, admin, sink, nonce), URL: sink.URL(nonce)}
}

// NewSplunkSink mints a Splunk HEC token on webhook.Splunk. Splunk takes a UUID, so the
// token's first group is the binary's prefix, which keeps the sink's events in this
// binary's stream.
func NewSplunkSink(tt *testing.T, tn *harness.Tenant) *WebhookSink {
	tt.Helper()
	token := id.Binary() + uuid.NewString()[8:]
	admin := FakenetAdmin(tt, tn)
	fakenet.Track(tt, admin, webhook.Splunk.Host(), token)
	return &WebhookSink{ControlPlane: webhook.Open(tt, admin, webhook.Splunk, token), Token: token}
}
