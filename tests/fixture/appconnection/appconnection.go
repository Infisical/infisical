// Package appconnection creates app connections against stubbed providers.
//
// Creating one calls the third party to check the credentials, so a connection and
// the stubs that stand in for its service arrive together: the fixture registers
// the provider's validation calls before it creates anything, or the create fails
// rather than the assertion.
package appconnection

import (
	"context"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/wiremock"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/provider"
	"github.com/Infisical/infisical/tests/stub"
	"github.com/google/uuid"
)

// Connection is one app connection and the stubs standing in for the service
// behind it.
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

	scope := conn.Stub(tt)
	for _, s := range p.Validate(conn.nonce) {
		if cfg.rejectWith != 0 {
			s.Status = cfg.rejectWith
			s.JSONBody = map[string]any{"message": "harness: credential rejected"}
		}
		scope.Register(tt, s)
	}

	connID, err := p.Create(tt.Context(), tn.Admin.API, conn.Name, conn.nonce)
	if err != nil {
		return nil, err
	}
	conn.ID = connID
	return conn, nil
}

// Stub returns the stub scope for this connection.
//
// A method rather than a field so a suite without WireMock fails here naming the
// fix, where a field would be a nil dereference inside the stub client.
func (c *Connection) Stub(tt *testing.T) *stub.Scope {
	tt.Helper()

	if c.Provider.Auth == nil {
		tt.Fatalf("appconnection: provider %q defines no Auth discriminator.\n"+
			"Without one its stubs would match every tenant's requests, so parallel tests "+
			"would see each other's calls. Add Auth to the registry entry.", c.Provider.App)
	}

	h := c.tn.Module(tt, wiremock.Key, "harness.Shared").(*wiremock.Handle)
	sc := stub.New(tt, h.NewAdminClient(), c.Provider.Auth(c.nonce), c.nonce)
	tt.Cleanup(func() { _ = sc.Remove(context.WithoutCancel(tt.Context())) })
	return sc
}

// unstubbedHint turns "the provider call failed" into the URL nobody stubbed.
//
// The application reports a validation failure or a 501 and rarely names the URL,
// so without this the test author is left guessing which call they missed.
func unstubbedHint(tt *testing.T, tn *harness.Tenant) string {
	h, ok := tn.Module(tt, wiremock.Key, "harness.Shared").(*wiremock.Handle)
	if !ok {
		return ""
	}
	calls, err := h.NewAdminClient().Unstubbed(context.WithoutCancel(tt.Context()))
	if err != nil || len(calls) == 0 {
		return ""
	}
	out := "Outbound calls that reached no stub:\n"
	for _, c := range calls {
		out += "  " + c + "\n"
	}
	return out
}
