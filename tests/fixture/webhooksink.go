package fixture

import (
	"testing"

	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// WebhookSink is a receiving URL of the test's own and the fake behind it.
type WebhookSink struct {
	*webhook.ControlPlane
	URL string
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
