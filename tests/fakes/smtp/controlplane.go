package smtp

import (
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Inbox is one mail domain's messages, as events. ExpectEvent and ExpectNoEvent on
// MessageReceived are there for anything Expect does not cover.
type Inbox struct {
	*fakenet.Events
	domain string
}

// Track starts collecting a domain's mail. Call it before Infisical can send there,
// the same way a credential is tracked before it is handed over.
func Track(tt *testing.T, adminURL, domain string) {
	tt.Helper()
	fakenet.Track(tt, adminURL, Host, domain)
}

func Open(adminURL, domain string) *Inbox {
	return &Inbox{Events: fakenet.OpenEvents(adminURL, Host, domain), domain: domain}
}

// Filter narrows what Expect accepts.
type Filter func(Message) bool

// Subject accepts a message whose subject contains s.
func Subject(s string) Filter {
	return func(m Message) bool { return strings.Contains(m.Subject, s) }
}

// Expect waits for an unclaimed message to addr that every filter accepts, and claims
// it.
func (in *Inbox) Expect(tt *testing.T, addr string, filters ...Filter) Message {
	tt.Helper()
	addr = strings.ToLower(addr)
	if !strings.HasSuffix(addr, "@"+in.domain) {
		tt.Fatalf("smtp: this inbox is scoped to @%s but was asked for %s.\n"+
			"Reading another tenant's mail would make the test order-dependent; use tn.Email(local)",
			in.domain, addr)
	}
	received := in.ExpectEvent[MessageReceived](tt, func(e MessageReceived) bool {
		if e.Recipient != addr {
			return false
		}
		for _, f := range filters {
			if !f(e.Message) {
				return false
			}
		}
		return true
	})
	return received.Message
}
