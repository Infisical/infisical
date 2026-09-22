// Package appconnection creates app connections against faked providers.
//
// Creating one calls the third party to check the credentials. The fake answers by
// existing, so nothing has to be registered first; what the fixture carries is the
// credential, which is the key that connection's fake state is held under.
package appconnection

import (
	"context"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/provider"
	"github.com/google/uuid"
)

// Connection is one app connection and the credential that addresses its fake.
type Connection struct {
	ID       uuid.UUID
	Name     string
	Provider provider.Provider

	// nonce is the credential this connection authenticates with, and therefore
	// what tells its outbound calls apart from every other tenant's.
	nonce string

	tn *harness.Tenant
}

// Option adjusts a new connection.
type Option func(*config)

type config struct {
	rejectWith int
}

// RejectCredentials makes the provider answer the credential check with an error
// status, so the connection cannot be created.
//
// For asserting that the check is load bearing. Without a test like that, an
// interception test proves only that a request was made, not that its answer
// mattered.
func RejectCredentials(status int) Option {
	return func(c *config) { c.rejectWith = status }
}

// New creates a connection, failing the test if the provider refuses it.
func New(tt *testing.T, tn *harness.Tenant, p provider.Provider, opts ...Option) *Connection {
	tt.Helper()
	conn, err := Try(tt, tn, p, opts...)
	if err != nil {
		tt.Fatalf("appconnection: %v\n%s", err, unstubbedHint(tt, tn))
	}
	return conn
}

// Try is New without failing the test, for the cases where the create is expected
// to be refused.
func Try(tt *testing.T, tn *harness.Tenant, p provider.Provider, opts ...Option) (*Connection, error) {
	tt.Helper()

	var cfg config
	for _, o := range opts {
		o(&cfg)
	}

	conn := &Connection{
		Name:     p.App + "-" + id.Short(),
		Provider: p,
		nonce:    id.Nonce(),
		tn:       tn,
	}

	// The fake answers the credential check by existing, so nothing has to be
	// registered for a connection to be created. Refusing one is the exception, and
	// it goes in before the create: the scope is the credential, which the fixture
	// already knows, so the rule is in place before the first call carries it.
	if cfg.rejectWith != 0 {
		fakenet.Open[any](tt, conn.FakenetAdmin(tt), p.Host, conn.nonce).
			Fail(tt, "", "*", cfg.rejectWith, 0)
	}

	connID, err := p.Create(tt.Context(), tn.Admin.API, conn.Name, conn.nonce)
	if err != nil {
		return nil, err
	}
	conn.ID = connID
	return conn, nil
}

// unstubbedHint turns "the provider call failed" into the URL nobody stubbed.
//
// The application reports a validation failure or a 501 and rarely names the URL,
// so without this the test author is left guessing which call they missed.
func unstubbedHint(tt *testing.T, tn *harness.Tenant) string {
	h, ok := tn.Module(tt, fakenet.Key, "harness.Shared").(*fakenet.Handle)
	if !ok {
		return ""
	}
	denied, err := h.Denied(context.WithoutCancel(tt.Context()))
	if err != nil || len(denied) == 0 {
		return ""
	}
	out := "Outbound calls that reached no fake:\n"
	for _, d := range denied {
		out += "  " + d.Method + " " + d.URL + ": " + d.Reason + "\n"
	}
	return out + "Add a Service to fakenet.New in cmd/fakenet, or a route to the fake that owns that host.\n"
}

// Nonce is the credential this connection authenticates with, and therefore the key
// its fake state is held under inside fakenet.
func (c *Connection) Nonce() string { return c.nonce }

// FakenetAdmin is where this connection's fake can be read and driven.
//
// Returned as a URL rather than a typed handle so that a fake package never has to
// import this one: fixtures may depend on the harness, and fakes depend on neither.
func (c *Connection) FakenetAdmin(tt *testing.T) string {
	tt.Helper()
	return c.tn.Module(tt, fakenet.Key, "harness.Shared").(*fakenet.Handle).AdminURL()
}
